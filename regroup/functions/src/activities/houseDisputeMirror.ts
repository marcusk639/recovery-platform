/**
 * Server-side maintenance of the `house.disputes` mirror, the /disputes
 * archive and the dispute decision log (disputeDecisions).
 *
 * house.disputes is the per-house list of open disputes, read by the app's
 * dispute screens. Residents may not write it (they could forge or delete
 * other people's disputes); this keeps it instead, from the onActivityWritten
 * trigger, on any event that enters `disputed` (incl. a REOPEN) or leaves it.
 *
 * In one transaction:
 *   1. the decision log: a write that leaves `disputed` logs its decision,
 *      and a REOPEN logs the reopen, from the EVENT payload (a decision is a
 *      fact about that write, even if processed late). Append-only: an
 *      existing entry is never rewritten;
 *   2. the archive: the entry of the dispute this event decided is archived
 *      to /disputes/{key}_{stamp}_{decision id} with that decision's outcome
 *      and resolver, even if the activity has been reopened since. Each
 *      decision has its own archive doc, so re-deciding a reopened dispute
 *      never overwrites an earlier decision;
 *   3. the mirror, from the activity's CURRENT state (events are redelivered
 *      and arrive out of order): while `disputed`, keep the entry with its
 *      dispute stamp (disputer + reason + disputedAt; an older build's
 *      unstamped entry matches on its reason), archive any other as
 *      `superseded`, and add one if none; otherwise remove every entry for
 *      the activity (archived with the current outcome, if step 2 did not).
 * The rules let an admin REOPEN only once step 1 has logged the decision it
 * undoes, so a decision is never undone before it is archived.
 *
 * Field-path updates, so a concurrent dispute on another activity is never
 * overwritten. The house comes from the guest doc, never from the activity.
 * Logs ids and counts only.
 */
import { logger } from 'firebase-functions';
import { FieldValue } from 'firebase-admin/firestore';
import { trustedGuestFrom } from './activityTrust';
import { toInstant } from './weekSummaryMath';
import { disputerOf, isNewDispute } from './disputeNotifications';
import {
  DECISIONS,
  Decision,
  closingDecision,
  disputeStamp,
  leavesDispute,
  millisOf,
  outcomeOf,
  reopenDecision,
} from './disputeDecisions';

export { disputeStamp, leavesDispute, outcomeOf };

type Firestore = FirebaseFirestore.Firestore;
type Data = Record<string, unknown>;
type Result = { added: number; removed: number; logged: number };

const stringOrNull = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

// Map keys become field paths; auto-ids and uuids never contain these.
const safeKey = (k: string) => /^[A-Za-z0-9_-]+$/.test(k);

/** Whether a house.disputes entry belongs to the dispute on `activity`. */
const belongsTo = (entry: Data | undefined, activity: Data) =>
  typeof entry?.disputeStamp === 'string'
    ? entry.disputeStamp === disputeStamp(activity)
    : (entry?.message ?? '') ===
      (typeof activity.disputeReason === 'string' ? activity.disputeReason : '');

export async function mirrorHouseDispute(
  db: Firestore,
  activityId: string,
  before: Data | undefined,
  after: Data | undefined,
  { now = new Date().toISOString() }: { now?: string } = {},
): Promise<Result> {
  const none = { added: 0, removed: 0, logged: 0 };
  const closing = leavesDispute(before, after);
  if (!isNewDispute(before, after) && !closing) return none;
  if (!safeKey(activityId)) {
    logger.warn('dispute_mirror.unsafe_activity_id', { activityId });
    return none;
  }

  const activity = (after ?? before)!;
  const guestId = typeof activity.guestId === 'string' ? activity.guestId : '';
  const guestSnap = guestId ? await db.collection('guests').doc(guestId).get() : undefined;
  const guest = trustedGuestFrom(
    guestId,
    guestSnap?.exists ? (guestSnap.data() as Data) : undefined,
  );
  const houseId = guest?.houseId ?? null;
  const activityRef = db.collection('activities').doc(activityId);
  const decided = closingDecision(before, after, now);
  const decisions = [decided, reopenDecision(before, after, now)].filter(
    (d): d is Decision => d !== null,
  );

  const result = await db.runTransaction(async (tx): Promise<Result & { missingHouse?: true }> => {
    const current = await tx.get(activityRef);
    const house = guest ? await tx.get(db.collection('houses').doc(guest.houseId)) : undefined;
    const logRefs = decisions.map((d) => activityRef.collection(DECISIONS).doc(d.id));
    const logged = await Promise.all(logRefs.map((ref) => tx.get(ref)));
    // The archive of the decided dispute, if its entry is already gone.
    const decidedArchiveRef =
      decided && before
        ? db.collection('disputes').doc(`${activityId}_${disputeStamp(before)}_${decided.id}`)
        : undefined;
    const decidedArchive = decidedArchiveRef ? await tx.get(decidedArchiveRef) : undefined;

    // 1. The decision log (append-only), whatever the state of the house.
    let newlyLogged = 0;
    decisions.forEach((d, i) => {
      if (logged[i].exists) return;
      tx.set(logRefs[i], { ...d.data, activityId, houseId });
      newlyLogged++;
    });
    if (!guest || !house?.exists) return { ...none, logged: newlyLogged, missingHouse: true };

    const houseRef = db.collection('houses').doc(guest.houseId);
    const disputes = ((house.data() as Data).disputes ?? {}) as Record<string, Data>;
    const now_ = current.exists ? (current.data() as Data) : undefined;
    // Every entry for this activity, whatever its key (older builds keyed
    // theirs by a random uuid).
    const keys = Object.keys(disputes).filter(
      (k) => safeKey(k) && (k === activityId || disputes[k]?.activityId === activityId),
    );
    const updates: FirebaseFirestore.UpdateData<Data> = {};
    const archived = new Set<string>();
    const archive = (k: string, outcome: string, decisionId: string | null, by: string | null) => {
      const stamp = disputes[k]?.disputeStamp;
      const id = [k, typeof stamp === 'string' ? stamp : null, decisionId]
        .filter(Boolean)
        .join('_');
      tx.set(db.collection('disputes').doc(id), {
        ...disputes[k],
        id: k,
        houseId: guest.houseId,
        status: 'resolved',
        resolutionMessage: outcome,
        resolvedDate: now,
        resolvedBy: by,
      });
      archived.add(k);
    };

    // 2. Archive the dispute this event decided, with its own outcome. If its
    // entry is gone (a later dispute superseded it first), archive it from
    // the event payload, unless that was done already.
    if (decided && before) {
      const own = keys.filter((k) => belongsTo(disputes[k], before));
      own.forEach((k) => archive(k, decided.data.event, decided.id, decided.data.by));
      if (own.length === 0 && decidedArchiveRef && !decidedArchive?.exists) {
        tx.set(decidedArchiveRef, {
          id: activityId,
          activityId,
          guestId,
          houseId: guest.houseId,
          type: before.type ?? null,
          message: typeof before.disputeReason === 'string' ? before.disputeReason : '',
          disputedBy: stringOrNull(before.disputedBy) || stringOrNull(before.disputeResolvedBy),
          disputeStamp: disputeStamp(before),
          status: 'resolved',
          resolutionMessage: decided.data.event,
          resolvedDate: now,
          resolvedBy: decided.data.by,
        });
      }
    }

    // 3. Reconcile the mirror with the current state.
    const remove = (k: string, outcome: string, decisionId: string | null, by: string | null) => {
      updates[`disputes.${k}`] = FieldValue.delete();
      if (!archived.has(k)) archive(k, outcome, decisionId, by);
    };
    let added = 0;
    if (now_?.status === 'disputed') {
      const kept = keys.filter((k) => belongsTo(disputes[k], now_));
      keys.filter((k) => !kept.includes(k)).forEach((k) => remove(k, 'superseded', null, null));
      if (kept.length === 0) {
        const openedAt =
          toInstant(now_.disputedAt)?.toISOString() ??
          toInstant(now_.loggedAt)?.toISOString() ??
          now;
        updates[`disputes.${activityId}`] = {
          id: activityId,
          activityId,
          guestId,
          houseId: guest.houseId,
          type: now_.type ?? null,
          message: typeof now_.disputeReason === 'string' ? now_.disputeReason : '',
          // The rules make the entering write's disputedBy (else
          // disputeResolvedBy) the caller; built from current state.
          disputedBy:
            stringOrNull(now_.disputedBy) ||
            stringOrNull(now_.disputeResolvedBy) ||
            disputerOf(before, after) ||
            null,
          disputeStamp: disputeStamp(now_),
          status: 'pending',
          reopenedAt: toInstant(now_.reopenedAt)?.toISOString() ?? null,
          challenges: [],
          createdAt: openedAt,
          updatedAt: toInstant(now_.reopenedAt)?.toISOString() ?? openedAt,
        };
        added = 1;
      }
    } else {
      const at = millisOf(now_?.disputeResolvedAt);
      const by = stringOrNull(now_?.disputeResolvedBy);
      keys.forEach((k) => remove(k, outcomeOf(now_), at === null ? null : `decided_${at}`, by));
    }
    const removed = keys.filter((k) => `disputes.${k}` in updates).length;
    if (Object.keys(updates).length) tx.update(houseRef, updates);
    return { added, removed, logged: newlyLogged };
  });

  if ('missingHouse' in result) {
    const { missingHouse: _m, ...counts } = result;
    logger.warn('dispute_mirror.skipped_no_house', { activityId, guestId, houseId, ...counts });
    return counts;
  }
  logger.info('dispute_mirror.updated', { activityId, houseId, ...result });
  return result;
}
