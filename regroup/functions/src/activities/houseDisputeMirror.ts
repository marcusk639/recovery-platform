/**
 * Server-side maintenance of the live dispute list, the /disputes archive and
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
 *   2. the archive: the entry of the dispute this event decided is archived
 *      to /disputes/{key}_{stamp}_{decision id} with that decision's outcome
 *      and resolver, even if the activity has been reopened since;
 *   3. the live list, from the activity's CURRENT state (events are
 *      redelivered and arrive out of order): while `disputed`, keep the entry
 *      with its dispute stamp (disputer + reason + disputedAt; an older
 *      build's unstamped entry matches on its reason), archive any other as
 *      `superseded`, and add one if none; otherwise remove every entry for
 *      the activity (archived with the current outcome, if step 2 did not).
 *      A REOPEN of an older build's dispute (no disputedBy) gets its disputer
 *      back from the decision log, onto the activity too, so it is the same
 *      dispute. An activity id that cannot be a map key is left out of both
 *      lists (logged); steps 1 and 2 still run.
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
    // The archive of the decided dispute, if its entry is already gone.
    const decidedArchiveRef =
      decided && before
        ? db.collection('disputes').doc(`${activityId}_${disputeStamp(before)}_${decided.id}`)
        : undefined;
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
    if (!guest || !house?.exists || !houseRef || !liveRef) {
      return { ...none, logged: newlyLogged, missingHouse: true };
    }

    const legacy = ((house.data() as Data).disputes ?? {}) as Record<string, Data>;
    const live = ((liveSnap?.exists ? (liveSnap.data() as Data).disputes : undefined) ??
      {}) as Record<string, Data>;
    const entries = { ...legacy, ...live }; // the server's own entry wins
    // Every entry for this activity, whatever its key (older builds keyed
    // theirs by a random uuid).
    const keys = Object.keys(entries).filter(
      (k) => safeKey(k) && (k === activityId || entries[k]?.activityId === activityId),
    );
    const legacyUpdates: FirebaseFirestore.UpdateData<Data> = {};
    const nextLive = { ...live };
    const archived = new Set<string>();
    const archive = (k: string, outcome: string, decisionId: string | null, by: string | null) => {
      const stamp = entries[k]?.disputeStamp;
      const id = [k, typeof stamp === 'string' ? stamp : null, decisionId]
        .filter(Boolean)
        .join('_');
      tx.set(db.collection('disputes').doc(id), {
        ...entries[k],
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
    // entry is gone (a later dispute superseded it first, or it never had
    // one), archive it from the event payload, unless that was done already.
    if (decided && before) {
      const own = keys.filter((k) => belongsTo(entries[k], before));
      own.forEach((k) => archive(k, decided.data.event, decided.id, decided.data.by));
      if (own.length === 0 && decidedArchiveRef && !decidedArchive?.exists) {
        tx.set(decidedArchiveRef, {
          ...newEntry(activityId, guestId, guest.houseId, before, '', now),
          status: 'resolved',
          resolutionMessage: decided.data.event,
          resolvedDate: now,
          resolvedBy: decided.data.by,
        });
      }
    }

    // 3. Reconcile the live list (and its legacy mirror) with the current state.
    const remove = (k: string, outcome: string, decisionId: string | null, by: string | null) => {
      legacyUpdates[`disputes.${k}`] = FieldValue.delete();
      delete nextLive[k];
      if (!archived.has(k)) archive(k, outcome, decisionId, by);
    };
    let added = 0;
    if (now_?.status === 'disputed') {
      const kept = keys.filter((k) => belongsTo(entries[k], now_!));
      keys.filter((k) => !kept.includes(k)).forEach((k) => remove(k, 'superseded', null, null));
      kept.forEach((k) => (nextLive[k] = entries[k]));
      if (kept.length === 0 && mapSafe) {
        const entry = newEntry(
          activityId,
          guestId,
          guest.houseId,
          now_,
          disputerOf(before, after),
          now,
        );
        legacyUpdates[`disputes.${activityId}`] = entry;
        nextLive[activityId] = entry;
        added = 1;
      }
    } else {
      const at = millisOf(now_?.disputeResolvedAt);
      const by = stringOrNull(now_?.disputeResolvedBy);
      keys.forEach((k) => remove(k, outcomeOf(now_), at === null ? null : `decided_${at}`, by));
    }
    const removed = keys.filter((k) => `disputes.${k}` in legacyUpdates).length;
    if (Object.keys(legacyUpdates).length) tx.update(houseRef, legacyUpdates);
    const liveChanged =
      !liveSnap?.exists ||
      Object.keys(nextLive).length !== Object.keys(live).length ||
      keys.some((k) => nextLive[k] !== live[k]);
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
