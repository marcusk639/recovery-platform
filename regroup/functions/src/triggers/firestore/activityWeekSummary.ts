import { onDocumentWrittenWithAuthContext } from 'firebase-functions/v2/firestore';
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
 * Registered WITH auth context so the disputer is the authenticated caller of
 * the write (event.authId for an app user), not a client-written field.
 *
 * All three run even if another fails, and all are idempotent (absolute
 * recompute; notification ids derived from the event id; mirror keyed by
 * activity id), so the trigger retries on failure. Bad input is skipped
 * rather than thrown, so only transient failures retry.
 */
export const onActivityWritten = onDocumentWrittenWithAuthContext(
  { document: 'activities/{activityId}', retry: true },
  async (event) => {
    const activityId = event.params.activityId;
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    // For an end user's write authId is their Firebase Auth uid. For a
    // non-user principal (service account, API key, system) it is not a uid,
    // so it matches no notification recipient and excludes nobody.
    const callerUid = event.authId || undefined;
    const results = await Promise.allSettled([
      syncWeekSummariesForActivityWrite(ratsFirestore, activityId, before, after),
      notifyDispute(ratsFirestore, event.id, activityId, before, after, callerUid),
      mirrorHouseDispute(ratsFirestore, activityId, before, after, {
        disputerUid: callerUid,
        now: event.time,
      }),
    ]);
    const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failed) throw failed.reason;
  },
);
