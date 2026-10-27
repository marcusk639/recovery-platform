/**
 * Server-side check of the owner rule on dispute DECISIONS: nobody approves,
 * rejects, keeps or reopens a dispute on their own activity. The rules refuse
 * it, but they read the guest doc and the residentUid stamp at write time,
 * and both can lag a change to the guest's account. So, from the
 * onActivityWritten trigger, a decision whose decider is the activity's
 * resident (the guest doc's current userId, or the stamp) or its logger is
 * logged as `dispute.self_decision` (ids only) and the activity is flagged
 * for review in `flaggedForReview`, a field only the server writes (reasons
 * are merged with any existing flag, see reviewFlag).
 *
 * Idempotent: the flag is keyed by the decision, so a redelivery rewrites the
 * same value.
 */
import { logger } from 'firebase-functions';
import { closingDecision, reopenDecision } from './disputeDecisions';
import { residentUidFrom } from './residentStamp';
import { mergeReviewFlag } from './reviewFlag';

type Firestore = FirebaseFirestore.Firestore;
type Data = Record<string, unknown>;

export async function flagSelfDecision(
  db: Firestore,
  activityId: string,
  before: Data | undefined,
  after: Data | undefined,
  { now = new Date().toISOString() }: { now?: string } = {},
): Promise<boolean> {
  if (!after) return false;
  const decision = closingDecision(before, after, now) ?? reopenDecision(before, after, now);
  const decider = decision?.data.by;
  if (!decision || !decider) return false;
  const guestId = typeof after.guestId === 'string' ? after.guestId : '';
  const guest = guestId ? await db.collection('guests').doc(guestId).get() : undefined;
  const owners = [
    residentUidFrom(guest?.exists ? (guest.data() as Data) : undefined),
    typeof after.residentUid === 'string' ? after.residentUid : null,
    typeof after.loggedBy === 'string' ? after.loggedBy : null,
  ];
  if (!owners.includes(decider)) return false;
  logger.warn('dispute.self_decision', {
    activityId,
    guestId,
    event: decision.data.event,
    decisionId: decision.id,
  });
  const flag = { reason: 'self_decision', event: decision.data.event, decisionId: decision.id };
  // Merged with any existing flag (e.g. the backfill's stamp_mismatch), never overwritten.
  const ref = db.collection('activities').doc(activityId);
  await db.runTransaction(async (tx) => {
    const current = await tx.get(ref);
    if (!current.exists) return; // gone (Admin SDK delete); the log line stays
    const merged = mergeReviewFlag((current.data() as Data).flaggedForReview, flag);
    if (merged) tx.update(ref, { flaggedForReview: merged });
  });
  return true;
}
