import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { ratsFirestore } from '../../api/firestore';
import { syncWeekSummariesForActivityWrite } from '../../activities/syncWeekSummary';
import { notifyDispute } from '../../activities/disputeNotifications';
import { mirrorHouseDispute } from '../../activities/houseDisputeMirror';
import { stampResidentUid } from '../../activities/residentStamp';

/**
 * Every create, update or delete of an activity:
 *   - recomputes the guest-week summaries it touches (activities/
 *     syncWeekSummary). The mobile client no longer writes summaries;
 *   - on a transition into `disputed`, notifies the house admins and the
 *     disputed resident (activities/disputeNotifications);
 *   - keeps house.disputes in step on entering and leaving `disputed`
 *     (activities/houseDisputeMirror), archives every decision and logs it
 *     in activities/{id}/dispute-decisions. Residents may no longer write it;
 *   - on a REOPEN (an admin undoing a decision), notifies and re-adds the
 *     house.disputes entry for the same dispute;
 *   - stamps residentUid (the resident's account, from guests.userId) on a
 *     new activity or a new guest (activities/residentStamp), for the
 *     rules' owner rule.
 *
 * The disputer is the disputedBy (or, for older builds, disputeResolvedBy)
 * that the entering write set; the rules require it to be request.auth.uid
 * for a non-admin, so a client cannot name someone else.
 *
 * All four run even if another fails, and all are idempotent (absolute
 * recompute; notification ids derived from the event id; mirror keyed by
 * activity id, decisions by their time; the stamp re-reads the activity), so
 * the trigger retries on failure. Bad input is skipped
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
      stampResidentUid(ratsFirestore, activityId, before, after),
    ]);
    const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failed) throw failed.reason;
  },
);
