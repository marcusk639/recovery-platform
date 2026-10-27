import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { ratsFirestore } from '../../api/firestore';
import { syncWeekSummariesForActivityWrite } from '../../activities/syncWeekSummary';
import { notifyDispute } from '../../activities/disputeNotifications';
import { mirrorHouseDispute } from '../../activities/houseDisputeMirror';

/**
 * Every create, update or delete of an activity:
 *   - recomputes the guest-week summaries it touches (activities/
 *     syncWeekSummary). The mobile client no longer writes summaries;
 *   - on a transition into `disputed`, notifies the house admins and the
 *     disputed resident (activities/disputeNotifications);
 *   - keeps house.disputes in step on entering and leaving `disputed`
 *     (activities/houseDisputeMirror). Residents may no longer write it.
 *
 * The disputer is the disputedBy (or, for older builds, disputeResolvedBy)
 * that the entering write set; the rules require it to be request.auth.uid
 * for a non-admin, so a client cannot name someone else.
 *
 * All three run even if another fails, and all are idempotent (absolute
 * recompute; notification ids derived from the event id; mirror keyed by
 * activity id), so the trigger retries on failure. Bad input is skipped
 * rather than thrown, so only transient failures retry.
 */
export const onActivityWritten = onDocumentWritten(
  { document: 'activities/{activityId}', retry: true },
  async (event) => {
    const activityId = event.params.activityId;
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    const results = await Promise.allSettled([
      syncWeekSummariesForActivityWrite(ratsFirestore, activityId, before, after),
      notifyDispute(ratsFirestore, event.id, activityId, before, after),
      mirrorHouseDispute(ratsFirestore, activityId, before, after, { now: event.time }),
    ]);
    const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failed) throw failed.reason;
  },
);
