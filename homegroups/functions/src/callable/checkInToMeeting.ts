// functions/src/callable/checkInToMeeting.ts
// V2.2 Task 4.3 — Attendance Check-In callable function
import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { db } from "../utils/firebase";
import { requireAuth } from "../utils/callableWrapper";
import {
  attendanceDocPath,
  buildAttendanceRecord,
} from "../utils/meetingAttendance";

interface CheckInToMeetingData {
  groupId: string;
  instanceId: string;
}

interface CheckInToMeetingResult {
  success: boolean;
  attendeeCount: number;
  alreadyCheckedIn: boolean;
}

/**
 * Callable function: checkInToMeeting
 *
 * Records the authenticated user as an attendee of the given MeetingInstance.
 * Verifies the caller is a member of the group before allowing check-in.
 * Returns the updated attendee count.
 */
export const checkInToMeeting = onCall(
  async (
    request: CallableRequest<CheckInToMeetingData>,
  ): Promise<CheckInToMeetingResult> => {
    const userId = requireAuth(request);

    const { groupId, instanceId } = request.data ?? {};
    if (
      !groupId ||
      typeof groupId !== "string" ||
      !instanceId ||
      typeof instanceId !== "string"
    ) {
      throw new HttpsError(
        "invalid-argument",
        "groupId and instanceId are required and must be strings.",
      );
    }

    // Check if user is a member of the group
    const memberDocId = `${groupId}_${userId}`;
    const memberDoc = await db.collection("members").doc(memberDocId).get();

    if (!memberDoc.exists) {
      throw new HttpsError(
        "permission-denied",
        "You are not a member of this group.",
      );
    }

    // Fetch the meeting instance
    const instanceRef = db.collection("meetingInstances").doc(instanceId);
    const instanceDoc = await instanceRef.get();

    if (!instanceDoc.exists) {
      throw new HttpsError(
        "not-found",
        `Meeting instance ${instanceId} not found.`,
      );
    }

    const instance = instanceDoc.data()!;

    // Verify the instance belongs to the requested group
    if (instance.groupId !== groupId) {
      throw new HttpsError(
        "permission-denied",
        "Meeting instance does not belong to this group.",
      );
    }

    if (instance.isCancelled) {
      throw new HttpsError(
        "failed-precondition",
        "Cannot check in to a cancelled meeting.",
      );
    }

    // Idempotency and the count increment must agree, so both live in one
    // transaction keyed on the per-user attendance doc. The previous guard read
    // `instance.attendees` and then updated outside any transaction, so two
    // concurrent check-ins could both pass it and both increment the count —
    // existing `attendeeCount` values may therefore sit above `attendees.length`.
    const attendanceRef = db.doc(attendanceDocPath(userId, instanceId));
    const applied = await db.runTransaction(async (txn) => {
      const existing = await txn.get(attendanceRef);
      if (existing.exists) {
        return false;
      }
      txn.set(
        attendanceRef,
        buildAttendanceRecord({
          instanceId,
          meetingId: (instance.meetingId as string) ?? null,
          groupId: instance.groupId as string,
          scheduledAt:
            (instance.scheduledAt as admin.firestore.Timestamp) ?? null,
        }),
      );
      txn.update(instanceRef, {
        attendees: admin.firestore.FieldValue.arrayUnion(userId),
        attendeeCount: admin.firestore.FieldValue.increment(1),
      });
      return true;
    });

    // Also record last meeting attendance on user document for activity tracking
    await db.collection("users").doc(userId).update({
      "activityLog.lastMeetingAttendance":
        admin.firestore.FieldValue.serverTimestamp(),
      lastActivityAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const storedCount = (instance.attendeeCount as number) ?? 0;
    const newCount = applied ? storedCount + 1 : storedCount;

    // Deliberately identifier-free: a user id joined to a meeting instance is
    // recovery-status PII, and Cloud Functions logs sit outside Firestore rules.
    logger.info("Meeting check-in processed", { applied });

    return {
      success: true,
      attendeeCount: newCount,
      alreadyCheckedIn: !applied,
    };
  },
);
