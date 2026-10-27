/**
 * Re-derives the residentUid stamp of an activity created before #141's
 * rules went live (backfillDisputeIdentity --rules-live-at).
 *
 * Under the old rules a client could write any residentUid at create, and
 * the server keeps a set stamp. Combined deploy order (#141 + #145): the
 * functions go live before the merged ruleset, so stamps written in that
 * window (and before it) are checked against the guest doc:
 *   - it matches the guest's account (or is null for an accountless
 *     guest): left alone;
 *   - no dispute history and it differs: overwritten from the guest doc
 *     (its userId, or null and unfillable);
 *   - dispute history: an empty stamp is filled (filling is not moving);
 *     a set stamp that differs is NEVER changed; the activity is flagged
 *     for the owner's review (flaggedForReview, reason 'stamp_mismatch').
 *
 * Each write is a transaction that re-reads the activity. Ids only.
 */
import { fillStamp, hasDisputeHistory } from './residentStamp';

type Firestore = FirebaseFirestore.Firestore;
type Data = Record<string, unknown>;

export type StampCheck = 'match' | 'restamped' | 'filled' | 'flagged' | 'skipped';

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

/** Applies stampCheck in a transaction (dry run: only reports it). */
export async function verifyStamp(
  db: Firestore,
  activityId: string,
  derived: string | null,
  apply: boolean,
  data: Data,
): Promise<StampCheck> {
  if (!apply) return stampCheck(data, derived);
  const ref = db.collection('activities').doc(activityId);
  return db.runTransaction(async (tx): Promise<StampCheck> => {
    const current = await tx.get(ref);
    if (!current.exists) return 'skipped';
    const now = current.data() as Data;
    if (now.guestId !== data.guestId) return 'skipped';
    const check = stampCheck(now, derived);
    if (check === 'restamped' || check === 'filled') {
      tx.update(
        ref,
        derived ? fillStamp(derived) : { residentUid: null, residentUidPending: false },
      );
    }
    // An existing flag (e.g. a self decision) is kept; the report lists both.
    if (check === 'flagged' && !now.flaggedForReview)
      tx.update(ref, { flaggedForReview: MISMATCH_FLAG });
    return check;
  });
}
