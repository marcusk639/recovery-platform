/**
 * Re-derives the residentUid stamp of an activity created before the backfill
 * cutoff (backfillDisputeIdentity --verify-stamps / --rules-live-at).
 *
 * Under the old rules a client could write any residentUid at create, and
 * the server keeps a set stamp. In the combined #141/#145 deploy the
 * functions go live before the merged ruleset, so stamps written until the
 * rules are live (they take up to ~10 minutes to propagate) are checked
 * against the guest doc:
 *   - it matches the guest's account (or is null for an accountless
 *     guest): left alone;
 *   - no dispute history and it differs: overwritten from the guest doc
 *     (its userId, or null and unfillable);
 *   - dispute history: an empty stamp is filled (filling is not moving);
 *     a set stamp that differs is NEVER changed; the activity is flagged
 *     for the owner's review (flaggedForReview reason 'stamp_mismatch',
 *     merged with any existing flag).
 * The guest doc is read inside the same transaction as the activity, so a
 * concurrent account link can't make it null out a correct stamp. Ids only.
 */
import { fillStamp, hasDisputeHistory, residentUidFrom } from './residentStamp';
import { mergeReviewFlag } from './reviewFlag';

type Firestore = FirebaseFirestore.Firestore;
type Data = Record<string, unknown>;

export type StampCheck = 'match' | 'restamped' | 'filled' | 'flagged' | 'skipped' | 'guestMissing';

const storedStamp = (d: Data): string | null =>
  typeof d.residentUid === 'string' && d.residentUid !== '' ? d.residentUid : null;

/** What to do with this activity's stamp, given the guest's account. */
export function stampCheck(activity: Data, derived: string | null): StampCheck {
  const stored = storedStamp(activity);
  const hasKey = Object.prototype.hasOwnProperty.call(activity, 'residentUid');
  if (stored === derived && (derived !== null || hasKey)) return 'match';
  if (!hasDisputeHistory(activity)) return 'restamped';
  if (stored === null) return derived === null ? 'match' : 'filled';
  return 'flagged';
}

export const MISMATCH_FLAG = { reason: 'stamp_mismatch' } as const;

/** Checks (dry run) or applies (transaction) one activity's stamp. */
export async function verifyStamp(
  db: Firestore,
  activityId: string,
  data: Data,
  apply: boolean,
): Promise<StampCheck> {
  const guestId = typeof data.guestId === 'string' ? data.guestId : '';
  const guestRef = guestId ? db.collection('guests').doc(guestId) : undefined;
  if (!apply) {
    const guest = guestRef ? await guestRef.get() : undefined;
    if (!guest?.exists) return 'guestMissing';
    return stampCheck(data, residentUidFrom(guest.data() as Data));
  }
  const ref = db.collection('activities').doc(activityId);
  return db.runTransaction(async (tx): Promise<StampCheck> => {
    const current = await tx.get(ref);
    if (!current.exists) return 'skipped';
    const now = current.data() as Data;
    if ((typeof now.guestId === 'string' ? now.guestId : '') !== guestId) return 'skipped';
    const guest = guestRef ? await tx.get(guestRef) : undefined;
    if (!guest?.exists) {
      // Can't be verified; a disputed one goes to the owner (merged flag).
      const flag = hasDisputeHistory(now)
        ? mergeReviewFlag(now.flaggedForReview, { reason: 'stamp_unverifiable' })
        : null;
      if (flag) tx.update(ref, { flaggedForReview: flag });
      return 'guestMissing';
    }
    const derived = residentUidFrom(guest.data() as Data);
    const check = stampCheck(now, derived);
    if (check === 'restamped' || check === 'filled') {
      tx.update(
        ref,
        derived ? fillStamp(derived) : { residentUid: null, residentUidPending: false },
      );
    }
    if (check === 'flagged') {
      const merged = mergeReviewFlag(now.flaggedForReview, MISMATCH_FLAG);
      if (merged) tx.update(ref, { flaggedForReview: merged });
    }
    return check;
  });
}
