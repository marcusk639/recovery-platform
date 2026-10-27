/**
 * Server-side maintenance of the `house.disputes` mirror.
 *
 * house.disputes is the per-house list of open disputes (its message and any
 * challenges), read by the app's dispute screens. The app used to write it
 * itself, which meant residents could replace the whole map — forging or
 * deleting other people's disputes — and concurrent disputes overwrote each
 * other. The rules now deny residents that field; this keeps it instead, from
 * the onActivityWritten trigger:
 *
 *   - entering `disputed`: add `disputes.{activityId}` (one entry per
 *     activity, keyed by its id), unless an entry for it already exists;
 *   - leaving `disputed` (approved, rejected, deleted, or a hard delete):
 *     remove EVERY entry whose key or activityId is this activity — older app
 *     builds keyed theirs by a random uuid — and archive each to
 *     /disputes/{key} with the outcome.
 *
 * Field-path updates inside one transaction, so a concurrent dispute on
 * another activity is never overwritten, and a redelivered event finds the
 * work already done (idempotent). The house comes from the guest doc, never
 * from the activity. Logs ids and counts only.
 */
import { logger } from 'firebase-functions';
import { FieldValue } from 'firebase-admin/firestore';
import { trustedGuestFrom } from './activityTrust';
import { disputerOf, isNewDispute } from './disputeNotifications';

type Firestore = FirebaseFirestore.Firestore;
type Data = Record<string, unknown>;

export function leavesDispute(before: Data | undefined, after: Data | undefined): boolean {
  return before?.status === 'disputed' && after?.status !== 'disputed';
}

/** The outcome recorded on the archived dispute. */
export function outcomeOf(after: Data | undefined): 'approved' | 'rejected' | 'deleted' | 'closed' {
  if (!after || after.status === 'deleted') return 'deleted';
  if (after.disputed === 'successful' || after.incomplete === true) return 'approved';
  if (after.disputed === 'rejected') return 'rejected';
  return 'closed';
}

// Map keys become field paths; auto-ids and uuids never contain these.
const safeKey = (k: string) => /^[A-Za-z0-9_-]+$/.test(k);

export async function mirrorHouseDispute(
  db: Firestore,
  activityId: string,
  before: Data | undefined,
  after: Data | undefined,
  { now = new Date().toISOString() }: { now?: string } = {},
): Promise<{ added: number; removed: number }> {
  const opening = isNewDispute(before, after);
  const closing = leavesDispute(before, after);
  if (!opening && !closing) return { added: 0, removed: 0 };
  if (!safeKey(activityId)) {
    logger.warn('dispute_mirror.unsafe_activity_id', { activityId });
    return { added: 0, removed: 0 };
  }

  const activity = (after ?? before)!;
  const guestId = typeof activity.guestId === 'string' ? activity.guestId : '';
  const guestSnap = guestId ? await db.collection('guests').doc(guestId).get() : undefined;
  const guest = trustedGuestFrom(
    guestId,
    guestSnap?.exists ? (guestSnap.data() as Data) : undefined,
  );
  if (!guest) {
    logger.warn('dispute_mirror.skipped_no_guest', { activityId, guestId });
    return { added: 0, removed: 0 };
  }
  const houseRef = db.collection('houses').doc(guest.houseId);

  const result = await db.runTransaction(async (tx) => {
    const house = await tx.get(houseRef);
    if (!house.exists) return { added: 0, removed: 0, missingHouse: true };
    const disputes = ((house.data() as Data).disputes ?? {}) as Record<string, Data>;

    if (opening) {
      if (disputes[activityId]) return { added: 0, removed: 0 };
      tx.update(houseRef, {
        [`disputes.${activityId}`]: {
          id: activityId,
          activityId,
          guestId,
          houseId: guest.houseId,
          type: activity.type ?? null,
          message: typeof activity.disputeReason === 'string' ? activity.disputeReason : '',
          disputedBy: disputerOf(before, after) || null,
          status: 'pending',
          challenges: [],
          createdAt: now,
          updatedAt: now,
        },
      });
      return { added: 1, removed: 0 };
    }

    const keys = Object.keys(disputes).filter(
      (k) => safeKey(k) && (k === activityId || disputes[k]?.activityId === activityId),
    );
    if (keys.length === 0) return { added: 0, removed: 0 };
    const outcome = outcomeOf(after);
    const updates: FirebaseFirestore.UpdateData<Data> = {};
    for (const k of keys) {
      updates[`disputes.${k}`] = FieldValue.delete();
      tx.set(db.collection('disputes').doc(k), {
        ...disputes[k],
        id: k,
        houseId: guest.houseId,
        status: 'resolved',
        resolutionMessage: outcome,
        resolvedDate: now,
        resolvedBy: typeof after?.disputeResolvedBy === 'string' ? after.disputeResolvedBy : null,
      });
    }
    tx.update(houseRef, updates);
    return { added: 0, removed: keys.length };
  });

  if ('missingHouse' in result) {
    logger.warn('dispute_mirror.skipped_no_house', { activityId, houseId: guest.houseId });
    return { added: 0, removed: 0 };
  }
  logger.info('dispute_mirror.updated', { activityId, houseId: guest.houseId, ...result });
  return result;
}
