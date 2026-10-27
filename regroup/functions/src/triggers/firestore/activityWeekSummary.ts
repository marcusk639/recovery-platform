import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { ratsFirestore } from '../../api/firestore';
import { syncWeekSummariesForActivityWrite } from '../../activities/syncWeekSummary';

/**
 * Owns week-summaries: every create, update or delete of an activity
 * recomputes the guest-week summaries it touches (see activities/
 * syncWeekSummary). The mobile client no longer writes summaries — residents
 * never could (week-summaries is admin-write in the rules), so their
 * activities went uncounted and logActivity threw after saving the activity.
 *
 * Retried on failure: the recompute is idempotent, and bad input (no guest,
 * unusable timestamp) is skipped rather than thrown, so only transient
 * failures retry.
 */
export const onActivityWritten = onDocumentWritten(
  { document: 'activities/{activityId}', retry: true },
  async (event) => {
    await syncWeekSummariesForActivityWrite(
      ratsFirestore,
      event.params.activityId,
      event.data?.before?.data(),
      event.data?.after?.data(),
    );
  },
);
