import { firestore } from '../../firebase-setup';
import FirebaseFirestore from '@react-native-firebase/firestore';
import { Activity, ActivityStatus, isLegacyUpheld } from '../entities/ActivityModel';
import { logException } from '../util/logging';

/** reopenDispute refusals the UI shows as-is (the rest are generic). */
/**
 * The rules refused it: the activity is the caller's own or they logged it,
 * or the decision is not in the decision log yet (moments after deciding).
 */
export const NOT_ALLOWED_TO_UNDO = 'Not allowed to undo this decision';

export const REOPEN_REFUSALS = [
  NOT_ALLOWED_TO_UNDO,
  'Activity not found',
  'Dispute already reopened',
  'No decision to undo',
];

/**
 * Undo a dispute decision (owner decision: "Add a way to undo dispute
 * decisions. The dispute should stay alive and approve and reject should show
 * as options again.").
 *
 * A decided dispute (approved, rejected, an older build's keep, or an older
 * build's "delete") goes back to DISPUTED: pending, counted again, and
 * APPROVE / REJECT are offered again. The decision is cleared from the
 * activity but never lost: the onActivityWritten Cloud Function has logged it
 * (activities/{id}/dispute-decisions) and archived it, and the rules refuse a
 * reopen until it has. Only house admins who are not the activity's resident
 * or logger may reopen; the rules enforce it.
 *
 * In a transaction, so a second admin's reopen, or an approve racing it, is
 * refused rather than overwriting.
 *
 * @param activityId - ID of the activity
 * @param reopenedBy - User ID of the admin undoing the decision
 */
export async function reopenDispute(activityId: string, reopenedBy: string): Promise<void> {
  const activityRef = firestore.collection('activities').doc(activityId);
  try {
    await firestore.runTransaction(async (tx: any) => {
      const snap = await tx.get(activityRef);
      if (!snap.exists) {
        throw new Error('Activity not found');
      }
      const activity = (snap.data() ?? {}) as Activity;
      if (activity.status === ActivityStatus.DISPUTED) {
        throw new Error('Dispute already reopened');
      }
      if (activity.status !== ActivityStatus.RESOLVED && !isLegacyUpheld(activity)) {
        throw new Error('No decision to undo');
      }
      // Exactly what the rules allow: the reopener and server time, the
      // decision cleared, nothing else.
      tx.update(activityRef, {
        status: ActivityStatus.DISPUTED,
        reopenedBy,
        reopenedAt: FirebaseFirestore.FieldValue.serverTimestamp(),
        disputed: null,
        incomplete: null,
        disputeResult: null,
        disputeOutcome: null,
        disputeResolvedBy: null,
        disputeResolvedAt: null,
      });
    });
  } catch (error: any) {
    if (error?.code === 'firestore/permission-denied') {
      throw new Error(NOT_ALLOWED_TO_UNDO);
    }
    if (REOPEN_REFUSALS.includes(error?.message)) {
      throw error;
    }
    logException(error);
    throw new Error('Failed to undo decision');
  }
}
