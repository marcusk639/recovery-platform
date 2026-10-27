/**
 * Server-side maintenance of the live dispute list, the dispute-archive and
 * the dispute decision log (disputeDecisions), from the onActivityWritten
 * trigger, on any event that enters `disputed` (incl. a REOPEN) or leaves it.
 *
 * The live list of a house's open disputes is house-disputes/{houseId}
 * (server-only, readable by house members; the app reads it). The same
 * entries are mirrored into houses/{id}.disputes for older app builds; admins
 * can rewrite that map (house setup saves whole-house copies), so it is
 * display-only and nothing trusts it.
 *
 * In one transaction:
 *   1. the decision log: a write that leaves `disputed` logs its decision,
 *      and a REOPEN logs the reopen, from the EVENT payload (a decision is a
 *      fact about that write, even if processed late). Append-only: an
 *      existing entry is never rewritten (a different one is logged as a
 *      conflict). Written for every activity, whatever its id or house;
 *   2. the archive: the dispute this event decided is archived to
 *      dispute-archive/{activityId}_{decision id}, built from the decision
 *      and the activity payload only, with create(): never overwritten (a
 *      redelivery that disagrees is logged as a conflict);
 *   3. the live list, from the activity's CURRENT state (events are
 *      redelivered and arrive out of order): while `disputed`, keep the
 *      server's own entry if it has this dispute's stamp (disputer + reason +
 *      disputedAt), else build a new one from the activity; otherwise remove
 *      every entry for the activity. Nothing is ever copied from the legacy
 *      houses/{id}.disputes map (admins can write it): its keys for this
 *      activity are only deleted, and the legacy mirror gets the live entry.
 *      A REOPEN of an older build's dispute (no disputedBy) gets its disputer
 *      back from the decision log of that same dispute, onto the activity
 *      too. Decisions backfilled for pre-deploy disputes carry no disputer
 *      (older builds overwrote it), so those get none back. An activity id
 *      that cannot be a map key is left out of both lists (logged); steps 1
 *      and 2 still run.
 * The rules let an admin REOPEN only once step 1 has logged the decision it
 * undoes, so a decision is never undone before it is archived.
 *
 * The house comes from the guest doc, never from the activity. Logs ids and
 * counts only.
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
  isReopen,
  leavesDispute,
  millisOf,
  outcomeOf,
  reopenDecision,
} from './disputeDecisions';

export { disputeStamp, leavesDispute, outcomeOf };

type Firestore = FirebaseFirestore.Firestore;
type Data = Record<string, unknown>;
type Result = { added: number; removed: number; logged: number };

export const LIVE_DISPUTES = 'house-disputes';
/**
 * The server-only archive of decided disputes (no client rule matches it).
 * /disputes is the legacy client collection older builds still write; it is
 * untrusted. dispute-decisions + dispute-archive are the trusted record.
 */
export const ARCHIVE = 'dispute-archive';

const stringOrNull = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const disputerIn = (a: Data) => stringOrNull(a.disputedBy) || stringOrNull(a.disputeResolvedBy);

// Map keys become field paths; auto-ids and uuids never contain these.
export const safeKey = (k: string) => /^[A-Za-z0-9_-]+$/.test(k);

/** Whether a dispute entry belongs to the dispute on `activity`. */
const belongsTo = (entry: Data | undefined, activity: Data) =>
  typeof entry?.disputeStamp === 'string'
    ? entry.disputeStamp === disputeStamp(activity)
    : (entry?.message ?? '') ===
      (typeof activity.disputeReason === 'string' ? activity.disputeReason : '');

/** A pending entry built from the activity's current state. */
function newEntry(
  activityId: string,
  guestId: string,
  houseId: string,
  a: Data,
  fallback: string,
  now: string,
) {
  const openedAt =
    toInstant(a.disputedAt)?.toISOString() ?? toInstant(a.loggedAt)?.toISOString() ?? now;
  const reopenedAt = toInstant(a.reopenedAt)?.toISOString() ?? null;
  return {
    id: activityId,
    activityId,
    guestId,
    houseId,
    type: a.type ?? null,
    message: typeof a.disputeReason === 'string' ? a.disputeReason : '',
    // The rules make the entering write's disputedBy (else
    // disputeResolvedBy) the caller.
    disputedBy: disputerIn(a) || fallback || null,
    disputeStamp: disputeStamp(a),
    status: 'pending',
    reopenedAt,
    challenges: [],
    createdAt: openedAt,
    updatedAt: reopenedAt ?? openedAt,
  };
}

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
  const mapSafe = safeKey(activityId);
  if (!mapSafe) logger.warn('dispute_mirror.unsafe_activity_id', { activityId });

  const activity = (after ?? before)!;
  const guestId = typeof activity.guestId === 'string' ? activity.guestId : '';
  const guestSnap = guestId ? await db.collection('guests').doc(guestId).get() : undefined;
  const guest = trustedGuestFrom(
    guestId,
    guestSnap?.exists ? (guestSnap.data() as Data) : undefined,
  );
  const houseId = guest?.houseId ?? null;
  const activityRef = db.collection('activities').doc(activityId);
  const log = activityRef.collection(DECISIONS);
  const decided = closingDecision(before, after, now);
  const decisions = [decided, reopenDecision(before, after, now)].filter(
    (d): d is Decision => d !== null,
  );
  // An older build's dispute (no disputedBy) loses its disputer on a reopen;
  // the decision that was undone recorded it.
  const undone =
    isReopen(before, after) && !stringOrNull(after?.disputedBy)
      ? millisOf(before?.disputeResolvedAt)
      : null;

  const result = await db.runTransaction(async (tx): Promise<Result & { missingHouse?: true }> => {
    const current = await tx.get(activityRef);
    const houseRef = guest ? db.collection('houses').doc(guest.houseId) : undefined;
    const liveRef = guest ? db.collection(LIVE_DISPUTES).doc(guest.houseId) : undefined;
    const house = houseRef ? await tx.get(houseRef) : undefined;
    const liveSnap = liveRef ? await tx.get(liveRef) : undefined;
    const logged = await Promise.all(decisions.map((d) => tx.get(log.doc(d.id))));
    const undoneLog = undone !== null ? await tx.get(log.doc(`decided_${undone}`)) : undefined;
    // The decided dispute's archive: keyed by the decision, built from the
    // event payload, written once.
    const decidedArchiveRef =
      decided && before ? db.collection(ARCHIVE).doc(`${activityId}_${decided.id}`) : undefined;
    const decidedArchive = decidedArchiveRef ? await tx.get(decidedArchiveRef) : undefined;

    let now_ = current.exists ? (current.data() as Data) : undefined;
    const restored = stringOrNull(undoneLog?.exists ? (undoneLog.data() as Data).disputedBy : null);
    if (restored) {
      decisions
        .filter((d) => d.data.event === 'reopened')
        .forEach((d) => {
          d.data.disputedBy = restored;
          d.data.disputeStamp = disputeStamp({ ...after, disputedBy: restored });
        });
    }

    // 1. The decision log (append-only), whatever the state of the house.
    let newlyLogged = 0;
    decisions.forEach((d, i) => {
      const existing = logged[i].exists ? (logged[i].data() as Data) : undefined;
      if (existing) {
        if (existing.event !== d.data.event || existing.disputeStamp !== d.data.disputeStamp) {
          logger.warn('dispute_decisions.conflict', { activityId, decisionId: d.id });
        }
        return;
      }
      tx.set(log.doc(d.id), { ...d.data, activityId, houseId });
      newlyLogged++;
    });
    if (restored && now_?.status === 'disputed' && !stringOrNull(now_.disputedBy)) {
      tx.update(activityRef, { disputedBy: restored });
      now_ = { ...now_, disputedBy: restored };
    }

    // 2. Archive the dispute this event decided: from the decision and the
    // activity payload only (never from a house entry, which an admin can
    // forge), under the decision's id, never overwritten.
    if (decided && before && decidedArchiveRef) {
      const record = {
        ...newEntry(activityId, guestId, houseId ?? '', before, '', now),
        houseId,
        decisionId: decided.id,
        status: 'resolved',
        resolutionMessage: decided.data.event,
        resolvedDate: now,
        resolvedBy: decided.data.by,
      };
      const existing = decidedArchive?.exists ? (decidedArchive.data() as Data) : undefined;
      if (!existing) tx.create(decidedArchiveRef, record);
      else if (
        existing.resolutionMessage !== record.resolutionMessage ||
        existing.resolvedBy !== record.resolvedBy
      ) {
        logger.warn('dispute_archive.conflict', { activityId, decisionId: decided.id });
      }
    }
    if (!guest || !house?.exists || !houseRef || !liveRef) {
      return { ...none, logged: newlyLogged, missingHouse: true };
    }
    if (!mapSafe) return { ...none, logged: newlyLogged };

    // 3. Reconcile the live list from the activity's current state. Live
    // entries are the server's own; the legacy houses/{id}.disputes map is
    // only searched for keys to delete (its content is never copied).
    const legacy = ((house.data() as Data).disputes ?? {}) as Record<string, Data>;
    const live = ((liveSnap?.exists ? (liveSnap.data() as Data).disputes : undefined) ??
      {}) as Record<string, Data>;
    const forActivity = (m: Record<string, Data>) =>
      Object.keys(m).filter(
        (k) => safeKey(k) && (k === activityId || m[k]?.activityId === activityId),
      );
    const legacyKeys = forActivity(legacy);
    const liveKeys = forActivity(live);
    const nextLive = { ...live };
    liveKeys.forEach((k) => delete nextLive[k]);
    const legacyUpdates: FirebaseFirestore.UpdateData<Data> = {};
    legacyKeys.forEach((k) => (legacyUpdates[`disputes.${k}`] = FieldValue.delete()));
    let added = 0;
    if (now_?.status === 'disputed') {
      const kept = liveKeys.find((k) => belongsTo(live[k], now_!));
      const entry = kept
        ? live[kept]
        : newEntry(activityId, guestId, guest.houseId, now_, disputerOf(before, after), now);
      if (!kept) added = 1;
      nextLive[activityId] = entry;
      // The legacy mirror, for older builds: the same entry, under the id.
      legacyUpdates[`disputes.${activityId}`] = entry;
    }
    const open = now_?.status === 'disputed';
    const removed = [...new Set([...legacyKeys, ...liveKeys])].filter(
      (k) => !(open && k === activityId),
    ).length;
    const legacyChanged =
      legacyKeys.some((k) => k !== activityId) ||
      (open
        ? JSON.stringify(legacy[activityId] ?? null) !== JSON.stringify(nextLive[activityId])
        : legacyKeys.length > 0);
    if (legacyChanged) tx.update(houseRef, legacyUpdates);
    const liveChanged = !liveSnap?.exists || JSON.stringify(live) !== JSON.stringify(nextLive);
    if (liveChanged)
      tx.set(liveRef, { houseId: guest.houseId, disputes: nextLive, updatedAt: now });
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
