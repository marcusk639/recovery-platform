/**
 * Stamps `residentUid` on an activity: the account of the resident it is for
 * (guests.userId, or null for a guest with no app account), read when the
 * activity is created or moved to another guest, and filled in on its next
 * write while it is null and the guest now has an account.
 *
 * The Firestore rules use it for the owner rule ("nobody disputes, resolves
 * or reopens their own activity"). Reading the guest doc live was not enough:
 * a resident or a peer-leader admin could edit or delete their own guest doc
 * around a dispute. Clients can never write residentUid (the rules refuse the
 * key on create and update). It is written only server-side: here (from
 * onActivityWritten), by restampGuestActivities (from onGuestLinkedRestamp,
 * whenever a guest's account changes), and by the backfillDisputeIdentity
 * script.
 *
 * Idempotent: it writes only when the stamp is missing, null while the guest
 * has an account, or the guest changed, in a transaction that re-reads the
 * activity and guest, so a redelivered or late event changes nothing. A
 * missing guest doc stamps nothing (the rules then refuse all but the house
 * owner). Logs ids only.
 */
import { logger } from 'firebase-functions';

type Firestore = FirebaseFirestore.Firestore;
type Data = Record<string, unknown>;

export type StampResult = 'stamped' | 'unchanged' | 'skipped';

const has = (d: Data, k: string) => Object.prototype.hasOwnProperty.call(d, k);

/** The value to stamp from a guest doc: its userId, or null with no account. */
export function residentUidFrom(guest: Data | undefined): string | null {
  const uid = guest?.userId;
  return typeof uid === 'string' && uid !== '' ? uid : null;
}

/**
 * Whether this write needs a (re)stamp: a new activity, a new guest, none
 * yet, or a null stamp (the guest may have an account by now).
 */
export function needsResidentStamp(before: Data | undefined, after: Data | undefined): boolean {
  if (!after) return false;
  return (
    !before ||
    before.guestId !== after.guestId ||
    !has(after, 'residentUid') ||
    after.residentUid === null
  );
}

export async function stampResidentUid(
  db: Firestore,
  activityId: string,
  before: Data | undefined,
  after: Data | undefined,
): Promise<StampResult> {
  if (!needsResidentStamp(before, after)) return 'unchanged';
  const guestId = typeof after?.guestId === 'string' ? after.guestId : '';
  if (!guestId) return 'skipped';
  const ref = db.collection('activities').doc(activityId);

  const result = await db.runTransaction(async (tx): Promise<StampResult> => {
    const current = await tx.get(ref);
    if (!current.exists) return 'skipped';
    const data = current.data() as Data;
    // A later write moved it to another guest; that write's event stamps it.
    if (data.guestId !== guestId) return 'skipped';
    const guest = await tx.get(db.collection('guests').doc(guestId));
    if (!guest.exists) return 'skipped';
    const residentUid = residentUidFrom(guest.data() as Data);
    if (has(data, 'residentUid') && data.residentUid === residentUid) return 'unchanged';
    tx.update(ref, { residentUid });
    return 'stamped';
  });
  if (result === 'stamped') logger.info('resident_stamp.stamped', { activityId, guestId });
  if (result === 'skipped') logger.warn('resident_stamp.skipped', { activityId, guestId });
  return result;
}
