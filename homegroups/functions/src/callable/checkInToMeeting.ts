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
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated.");
    }

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

    const userId = request.auth.uid;

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

    // Check if already checked in
    const existingAttendees: string[] = instance.attendees ?? [];
    if (existingAttendees.includes(userId)) {
      return {
        success: true,
        attendeeCount: existingAttendees.length,
        alreadyCheckedIn: true,
      };
    }

    // Atomically add user to attendees and increment count
    await instanceRef.update({
      attendees: admin.firestore.FieldValue.arrayUnion(userId),
      attendeeCount: admin.firestore.FieldValue.increment(1),
    });

    // Also record last meeting attendance on user document for activity tracking
    await db.collection("users").doc(userId).update({
      "activityLog.lastMeetingAttendance":
        admin.firestore.FieldValue.serverTimestamp(),
      lastActivityAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const newCount = existingAttendees.length + 1;

    logger.info(
      `User ${userId} checked in to meeting instance ${instanceId}. Count: ${newCount}`,
    );

    return {
      success: true,
      attendeeCount: newCount,
      alreadyCheckedIn: false,
    };
  },
);
