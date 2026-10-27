import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { ratsFirestore } from '../../api/firestore';
import { syncWeekSummariesForActivityWrite } from '../../activities/syncWeekSummary';
import { notifyDispute } from '../../activities/disputeNotifications';

/**
 * Every create, update or delete of an activity:
 *   - recomputes the guest-week summaries it touches (activities/
 *     syncWeekSummary). The mobile client no longer writes summaries;
 *   - on a transition into `disputed`, notifies the house admins and the
 *     disputed resident (activities/disputeNotifications). The client cannot:
 *     notifications may only be created for the caller.
 *
 * Both run even if the other fails, and both are idempotent (absolute
 * recompute; notification ids derived from the event id), so the trigger
 * retries on failure. Bad input is skipped rather than thrown, so only
 * transient failures retry.
 */
export const onActivityWritten = onDocumentWritten(
  { document: 'activities/{activityId}', retry: true },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    const results = await Promise.allSettled([
      syncWeekSummariesForActivityWrite(ratsFirestore, event.params.activityId, before, after),
      notifyDispute(ratsFirestore, event.id, event.params.activityId, before, after),
    ]);
    const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failed) throw failed.reason;
  },
);
