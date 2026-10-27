/**
 * Stamps `residentUid` on an activity: the account of the resident it is for
 * (guests.userId). The Firestore rules use it for the owner rule ("nobody
 * disputes, decides or reopens their own activity"). The guest doc alone was
 * not enough: a resident or staff member could edit, delete or recreate their
 * own guest doc around a dispute.
 *
 * The stamp is IMMUTABLE once set. No path ever changes a non-null stamp: not
 * this, not restampGuestActivities (onGuestLinkedRestamp), not the backfill,
 * and the rules refuse any client change. A new app build sets it at create
 * (the rules check it against the guest doc); for older builds this fills it
 * from the onActivityWritten trigger. It only ever fills an ABSENT or NULL
 * stamp:
 *   - the guest has an account: stamp it;
 *   - no account yet, or no guest doc: record `residentUidPending: false` and
 *     `residentUid: null` once (logged once), so later writes skip the
 *     transaction; onGuestLinkedRestamp fills it when an account is linked.
 * Until stamped, the rules let only the house's primary owner decide.
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

/** Whether this write could fill a stamp: none yet, and not already found unfillable. */
export function needsResidentStamp(_before: Data | undefined, after: Data | undefined): boolean {
  if (!after || stamped(after)) return false;
  return after.residentUidPending !== false;
}

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
  const ref = db.collection('activities').doc(activityId);

  const result = await db.runTransaction(async (tx): Promise<StampResult> => {
    const current = await tx.get(ref);
    if (!current.exists) return 'skipped';
    const data = current.data() as Data;
    if (!needsResidentStamp(undefined, data)) return 'unchanged';
    const gid = typeof data.guestId === 'string' ? data.guestId : '';
    const guest = gid ? await tx.get(db.collection('guests').doc(gid)) : undefined;
    const residentUid = residentUidFrom(guest?.exists ? (guest.data() as Data) : undefined);
    if (residentUid) {
      tx.update(ref, fillStamp(residentUid));
      return 'stamped';
    }
    tx.update(ref, { residentUid: null, residentUidPending: false });
    return 'unfillable';
  });
  if (result === 'stamped') logger.info('resident_stamp.stamped', { activityId, guestId });
  if (result === 'unfillable') logger.warn('resident_stamp.unfillable', { activityId, guestId });
  return result;
}
