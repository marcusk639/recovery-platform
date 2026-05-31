import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { db, messaging } from "../utils/firebase";
import { assertGroupActive } from "../utils/subscriptionGuard";

interface InitiateRemovalData {
  groupId: string;
  targetAdminId: string;
  targetAdminName: string;
  reason: string;
}

interface InitiateRemovalResult {
  requestId: string;
}

export const initiateAdminRemoval = onCall(
  async (
    request: CallableRequest<InitiateRemovalData>,
  ): Promise<InitiateRemovalResult> => {
    const { data, auth: context } = request;

    if (!context) {
      throw new HttpsError("unauthenticated", "Must be authenticated.");
    }

    const callerId = context.uid;

    if (!data.groupId || !data.targetAdminId || !data.reason?.trim()) {
      throw new HttpsError(
        "invalid-argument",
        "groupId, targetAdminId, and reason are required.",
      );
    }

    if (callerId === data.targetAdminId) {
      throw new HttpsError(
        "invalid-argument",
        "You cannot initiate a removal vote against yourself.",
      );
    }

    const callerMemberDoc = await db
      .collection("members")
      .doc(`${data.groupId}_${callerId}`)
      .get();

    if (!callerMemberDoc.exists) {
      throw new HttpsError(
        "permission-denied",
        "Only group members can initiate removal votes.",
      );
    }

    const groupDoc = await db.collection("groups").doc(data.groupId).get();
    if (!groupDoc.exists) {
      throw new HttpsError("not-found", "Group not found.");
    }

    const groupData = groupDoc.data()!;
    const admins: string[] = groupData.admins || [];

    if (!admins.includes(data.targetAdminId)) {
      throw new HttpsError(
        "invalid-argument",
        "Target user is not an admin of this group.",
      );
    }

    assertGroupActive(groupData);

    const existingSnapshot = await db
      .collection("admin_removal_requests")
      .where("groupId", "==", data.groupId)
      .where("targetAdminId", "==", data.targetAdminId)
      .where("status", "==", "pending")
      .limit(1)
      .get();

    if (!existingSnapshot.empty) {
      throw new HttpsError(
        "already-exists",
        "A pending removal vote already exists for this admin.",
      );
    }

    const callerMemberData = callerMemberDoc.data()!;
    const callerName = callerMemberData.displayName || "A member";

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const requestRef = db.collection("admin_removal_requests").doc();
    await requestRef.set({
      id: requestRef.id,
      groupId: data.groupId,
      targetAdminId: data.targetAdminId,
      targetAdminName: data.targetAdminName,
      initiatedBy: callerId,
      initiatedByName: callerName,
      reason: data.reason.trim(),
      status: "pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
      votesFor: 0,
      votesAgainst: 0,
      votesAbstain: 0,
      totalEligibleVoters: Math.max((groupData.memberCount || 1) - 1, 1),
    });

    logger.info(
      `Admin removal vote initiated: group=${data.groupId} target=${data.targetAdminId} by=${callerId}`,
    );

    try {
      await notifyGroupMembers(
        data.groupId,
        data.targetAdminName,
        groupData.name,
        requestRef.id,
      );
    } catch (err) {
      logger.warn("FCM notification failed for admin removal:", err);
    }

    return { requestId: requestRef.id };
  },
);

async function notifyGroupMembers(
  groupId: string,
  targetAdminName: string,
  groupName: string,
  requestId: string,
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
      title: `Admin Vote — ${groupName}`,
      body: `A vote has been called to remove ${targetAdminName} as admin. Cast your vote.`,
    },
    data: { type: "admin_removal_vote", groupId, requestId },
    android: { priority: "high" },
    apns: { payload: { aps: { sound: "default", badge: 1 } } },
  });
}
