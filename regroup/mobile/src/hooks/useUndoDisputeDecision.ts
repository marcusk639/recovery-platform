/**
 * useUndoDisputeDecision — "Undo decision" on a decided dispute.
 *
 * Owner decision: "Add a way to undo dispute decisions. The dispute should
 * stay alive and approve and reject should show as options again." House
 * admins who are not the activity's resident get it on a decided dispute; it
 * confirms first, then reopens the dispute (services/reopenDispute): pending,
 * counted again, with APPROVE and REJECT offered again.
 */
import { useCallback } from 'react';
import { Alert } from 'react-native';
import { Activity } from '../entities/ActivityModel';
import { reopenDispute } from '../services/reopenDispute';

export const UNDO_DECISION_TITLE = 'Undo decision?';
export const UNDO_DECISION_MESSAGE =
  'This reopens the dispute. The activity will count while the dispute is pending, and you can approve or reject it again.';

/** reopenDispute's refusals (services/reopenDispute REOPEN_REFUSALS), as shown to the admin. */
const REOPEN_REFUSAL_ALERTS: Record<string, { title: string; message: string }> = {
  'Not allowed to undo this decision': {
    title: "Can't undo this decision",
    message:
      "You can't undo this decision. It may be your own or one you logged, or your access changed. If it was just made, wait a moment and try again.",
  },
  'Dispute already reopened': {
    title: 'Already reopened',
    message: 'Another admin has already undone this decision. The dispute is open again.',
  },
  'No decision to undo': {
    title: 'Nothing to undo',
    message: 'This dispute has not been decided, so there is no decision to undo.',
  },
  'Activity not found': {
    title: 'Activity not found',
    message: 'This activity no longer exists.',
  },
};

export function useUndoDisputeDecision(userId: string | undefined) {
  const undo = useCallback(
    async (activity: Activity): Promise<void> => {
      try {
        await reopenDispute(activity.id, userId || '');
      } catch (err) {
        const refusal = REOPEN_REFUSAL_ALERTS[(err as Error)?.message];
        if (refusal) {
          Alert.alert(refusal.title, refusal.message);
          return;
        }
        // reopenDispute has already logged it.
        Alert.alert(
          'Decision not undone',
          'We could not undo this decision. If it was just made, wait a moment and try again.',
        );
      }
    },
    [userId],
  );

  const undoDecision = useCallback(
    (activity: Activity): void => {
      Alert.alert(UNDO_DECISION_TITLE, UNDO_DECISION_MESSAGE, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Undo decision', onPress: () => undo(activity) },
      ]);
    },
    [undo],
  );

  return { undoDecision };
}
