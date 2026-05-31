import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { db, messaging } from "../utils/firebase";
import { assertGroupActive } from "../utils/subscriptionGuard";

interface ApproveMinutesData {
  businessMeetingId: string;
  groupId: string;
}

interface ApproveMinutesResult {
  success: boolean;
}

/**
 * approveMeetingMinutes — Callable Cloud Function
 *
 * Approves the draft minutes for a business meeting.
 * Auth: must be admin of groupId.
 * Sets status: 'approved', approvedAt, approvedBy.
 * Sends FCM to all members.
 */
export const approveMeetingMinutes = onCall(
  async (
    request: CallableRequest<ApproveMinutesData>,
  ): Promise<ApproveMinutesResult> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated.");
    }

    const { data } = request;
    const callerId = request.auth.uid;

    if (!data.businessMeetingId) {
      throw new HttpsError(
        "invalid-argument",
        "businessMeetingId is required.",
      );
    }
    if (!data.groupId) {
      throw new HttpsError("invalid-argument", "groupId is required.");
    }

    // Admin check (parallel fetch for performance)
    const [callerMemberDoc, groupDoc] = await Promise.all([
      db.collection("members").doc(`${data.groupId}_${callerId}`).get(),
      db.collection("groups").doc(data.groupId).get(),
    ]);

    if (!groupDoc.exists) {
      throw new HttpsError("not-found", "Group not found.");
    }
    if (!callerMemberDoc.exists) {
      throw new HttpsError(
        "permission-denied",
        "You are not a member of this group.",
      );
    }

    const callerData = callerMemberDoc.data()!;
    const isAdmin =
      callerData.isAdmin === true || (callerData.roles || []).includes("admin");

    if (!isAdmin) {
      throw new HttpsError(
        "permission-denied",
        "Only group admins can approve minutes.",
      );
    }

    assertGroupActive(groupDoc.data()!);

    // Load and verify minutes exist
    const minutesRef = db
      .collection("business_meetings")
      .doc(data.businessMeetingId)
      .collection("minutes")
      .doc("record");

    const minutesDoc = await minutesRef.get();

    if (!minutesDoc.exists) {
      throw new HttpsError("not-found", "Minutes not found for this meeting.");
    }

    const minutesData = minutesDoc.data()!;

    if (minutesData.groupId !== data.groupId) {
      throw new HttpsError(
        "permission-denied",
        "Meeting does not belong to this group.",
      );
    }

    if (minutesData.status === "approved") {
      throw new HttpsError(
        "failed-precondition",
        "Minutes are already approved.",
      );
    }

    const now = admin.firestore.FieldValue.serverTimestamp();

    await minutesRef.update({
      status: "approved",
      approvedAt: now,
      approvedBy: callerId,
      updatedAt: now,
    });

    logger.info(
      `Meeting minutes approved: meetingId=${data.businessMeetingId} groupId=${data.groupId} by=${callerId}`,
    );

    // Use already-fetched groupDoc for group name
    const groupName: string = groupDoc.data()!.name || "Group";

    // Send FCM to all members
    try {
      const meetingDate = minutesData.date;
      let dateStr = "recent";
      if (meetingDate && typeof meetingDate.toDate === "function") {
        const d = meetingDate.toDate();
        dateStr = d.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
      }
      await notifyGroupMembers(
        data.groupId,
        groupName,
        dateStr,
        data.businessMeetingId,
      );
    } catch (err) {
      logger.warn("FCM notification failed for minutes approval:", err);
    }

    return { success: true };
  },
);

async function notifyGroupMembers(
  groupId: string,
  groupName: string,
  dateStr: string,
  meetingId: string,
): Promise<void> {
  const membersSnapshot = await db
    .collection("members")
    .where("groupId", "==", groupId)
    .get();

  const memberUserIds = membersSnapshot.docs
    .map((doc) => doc.data().userId as string)
    .filter(Boolean);

  const tokens: string[] = [];

  for (let i = 0; i < memberUserIds.length; i += 10) {
    const batch = memberUserIds.slice(i, i + 10);
    const usersSnapshot = await db
      .collection("users")
      .where("__name__", "in", batch)
      .get();

    usersSnapshot.docs.forEach((doc) => {
      const userData = doc.data();
      const pushEnabled =
        userData.notificationSettings?.allowPushNotifications !== false;
      if (pushEnabled && userData.fcmTokens?.length) {
        tokens.push(...userData.fcmTokens);
      }
    });
  }

  if (tokens.length === 0) return;

  await messaging.sendEachForMulticast({
    tokens,
    notification: {
      title: `Minutes Approved — ${groupName}`,
      body: `Minutes from ${dateStr} meeting approved — tap to read`,
    },
    data: { type: "minutes_approved", groupId, meetingId },
    android: { priority: "high" },
    apns: { payload: { aps: { sound: "default", badge: 1 } } },
  });
}
