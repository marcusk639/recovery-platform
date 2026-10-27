/**
 * Stamps `residentUid` on an activity: the account of the resident it is for
 * (guests.userId). The Firestore rules use it for the owner rule ("nobody
 * disputes, decides or reopens their own activity"). The guest doc alone was
 * not enough: a resident or staff member could edit, delete or recreate their
 * own guest doc around a dispute.
 *
 * Who may change it:
 *   - clients: only at create, and only to the guest doc's userId (the new
 *     app build does; the rules check it);
 *   - this, from onActivityWritten: fills an ABSENT or NULL stamp (the guest
 *     has an account: stamp it; none yet, or no guest doc: record
 *     `residentUid: null, residentUidPending: false` once, logged once, so
 *     later writes skip the transaction), and RE-STAMPS on an admin's
 *     correction of guestId while the activity has no dispute history (from
 *     the new guest: its userId, or null and unfillable);
 *   - restampGuestActivities (onGuestLinkedRestamp) and the backfill: fill
 *     empty stamps only.
 * Once there is dispute history the rules freeze guestId, so a disputed
 * activity's stamp never moves. With no usable stamp the rules fall back to
 * the guest doc (safe only with #145's guest rules live).
 *
 * Idempotent, in a transaction that re-reads the activity and guest. Logs ids
 * only.
 */
import { logger } from 'firebase-functions';
import { FieldValue } from 'firebase-admin/firestore';

type Firestore = FirebaseFirestore.Firestore;
type Data = Record<string, unknown>;

export type StampResult = 'stamped' | 'unchanged' | 'skipped' | 'unfillable';

/** The value to stamp from a guest doc: its userId, or null with no account. */
export function residentUidFrom(guest: Data | undefined): string | null {
  const uid = guest?.userId;
  return typeof uid === 'string' && uid !== '' ? uid : null;
}

const stamped = (d: Data | undefined) => typeof d?.residentUid === 'string' && d.residentUid !== '';

const HISTORY_KEYS = [
  'disputeReason',
  'disputedBy',
  'disputeResolvedBy',
  'disputeResolvedAt',
  'disputed',
  'disputeOutcome',
  'disputedAt',
  'reopenedBy',
];

/** Any dispute history (same test as hasDisputeHistory in firestore.rules). */
export function hasDisputeHistory(d: Data | undefined): boolean {
  if (!d) return false;
  return (
    d.status === 'disputed' ||
    d.status === 'resolved' ||
    HISTORY_KEYS.some((k) => k in d) ||
    // As the rules (get('disputeResult', 'none') != 'none'): a null counts.
    ('disputeResult' in d && d.disputeResult !== 'none') ||
    d.incomplete === true
  );
}

/**
 * An admin's correction of who the activity is for, before any dispute: the
 * stamp follows the new guest. (Once there is history the rules freeze
 * guestId, so a disputed activity's stamp never moves.)
 */
export function isGuestCorrection(before: Data | undefined, after: Data | undefined): boolean {
  return !!before && !!after && before.guestId !== after.guestId && !hasDisputeHistory(after);
}

/** Whether this write could change the stamp: a correction, or an empty stamp not yet found unfillable. */
export function needsResidentStamp(before: Data | undefined, after: Data | undefined): boolean {
  if (!after) return false;
  if (isGuestCorrection(before, after)) return true;
  if (stamped(after)) return false;
  // Entering a dispute retries an empty stamp even if it was found
  // unfillable before (one transaction per dispute, not per write): the
  // guest may have an account by now (probe v9 D1).
  return after.residentUidPending !== false || enteringDispute(before, after);
}

const enteringDispute = (before: Data | undefined, after: Data | undefined) =>
  after?.status === 'disputed' && before?.status !== 'disputed';

/** The update that fills an empty stamp (and clears the "unfillable" marker). */
export const fillStamp = (residentUid: string) => ({
  residentUid,
  residentUidPending: FieldValue.delete(),
});

export async function stampResidentUid(
  db: Firestore,
  activityId: string,
  before: Data | undefined,
  after: Data | undefined,
): Promise<StampResult> {
  if (!needsResidentStamp(before, after)) return 'unchanged';
  const guestId = typeof after?.guestId === 'string' ? after.guestId : '';
  const correction = isGuestCorrection(before, after);
  const retryEmpty = correction || enteringDispute(before, after);
  const ref = db.collection('activities').doc(activityId);

  const result = await db.runTransaction(async (tx): Promise<StampResult> => {
    const current = await tx.get(ref);
    if (!current.exists) return 'skipped';
    const data = current.data() as Data;
    // A correction re-stamps only while the activity is still undisputed and
    // still points at that guest (a later write's own event handles the rest).
    const restamp = correction && data.guestId === guestId && !hasDisputeHistory(data);
    // Filling an EMPTY stamp is not moving one: if the correction lost the
    // race to a dispute (history now, so no re-stamp), still fill a null or
    // absent stamp from the current guest, whatever residentUidPending says
    // (probe v9 D1: otherwise it stayed null for good).
    const empty = !stamped(data);
    const fill = empty && (retryEmpty || needsResidentStamp(undefined, data));
    if (!restamp && !fill) return 'unchanged';
    const gid = typeof data.guestId === 'string' ? data.guestId : '';
    const guest = gid ? await tx.get(db.collection('guests').doc(gid)) : undefined;
    const residentUid = residentUidFrom(guest?.exists ? (guest.data() as Data) : undefined);
    if (residentUid) {
      if (data.residentUid === residentUid && !('residentUidPending' in data)) return 'unchanged';
      tx.update(ref, fillStamp(residentUid));
      return 'stamped';
    }
    if (data.residentUid === null && data.residentUidPending === false) return 'unchanged';
    tx.update(ref, { residentUid: null, residentUidPending: false });
    return 'unfillable';
  });
  if (result === 'stamped') logger.info('resident_stamp.stamped', { activityId, guestId });
  if (result === 'unfillable') logger.warn('resident_stamp.unfillable', { activityId, guestId });
  return result;
}
