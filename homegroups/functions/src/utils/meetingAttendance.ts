import * as admin from "firebase-admin";

/**
 * Per-user reverse index of 12-step meeting check-ins.
 *
 * Attendance must NOT live on `meetingInstances`: that collection is publicly
 * readable so unauthenticated clients can discover meetings, and Firestore rules
 * are document-level — there is no rule that hides an `attendees` field while
 * keeping `attendeeCount` visible. Storing attendance here instead lets rules
 * scope it to its owner.
 */
export const MEETING_ATTENDANCE_SUBCOLLECTION = "meetingAttendance";

/** Doc id is the instance id, which makes a check-in naturally idempotent. */
export function attendanceDocPath(userId: string, instanceId: string): string {
  return `users/${userId}/${MEETING_ATTENDANCE_SUBCOLLECTION}/${instanceId}`;
}

export function buildAttendanceRecord(args: {
  instanceId: string;
  meetingId: string | null;
  groupId: string;
  scheduledAt: admin.firestore.Timestamp | null;
  /**
   * When the check-in happened. Defaults to the server's clock, which is right
   * for a live check-in. A backfill MUST pass the meeting's own `scheduledAt`
   * instead: stamping migrated rows with "now" would claim every historical
   * meeting was attended on migration day.
   */
  attendedAt?: admin.firestore.Timestamp | null;
}): Record<string, unknown> {
  return {
    instanceId: args.instanceId,
    meetingId: args.meetingId,
    groupId: args.groupId,
    scheduledAt: args.scheduledAt,
    attendedAt:
      args.attendedAt ?? admin.firestore.FieldValue.serverTimestamp(),
  };
}
