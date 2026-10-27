import { Activity, countsTowardStats } from '../entities/ActivityModel';

/**
 * Has the guest already checked in to this meeting, among today's meeting
 * activities? Only activities that COUNT are considered (countsTowardStats:
 * not deleted, not an approved dispute), so a pending dispute still blocks a
 * duplicate check-in: it keeps counting until an admin decides.
 */
export function alreadyCheckedIn(
  todaysMeetingActivities: Activity[],
  meetingId: string | undefined,
): boolean {
  if (!meetingId) return false;
  return todaysMeetingActivities.some(
    activity =>
      countsTowardStats(activity) &&
      (activity.data as { meetingId?: string } | undefined)?.meetingId === meetingId,
  );
}
