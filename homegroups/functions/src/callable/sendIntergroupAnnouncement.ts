import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import { db, messaging } from "../utils/firebase";
import * as admin from "firebase-admin";
import { requireAuth } from "../utils/callableWrapper";

interface SendIntergroupAnnouncementData {
  intergroupId: string;
  title: string;
  content: string;
  targetGroupIds?: string[]; // Optional subset; defaults to all affiliated groups
}

interface SendIntergroupAnnouncementResult {
  sentToGroupCount: number;
  notificationsSent: number;
}

export const sendIntergroupAnnouncement = onCall(
  { region: "us-central1" },
  async (
    request: CallableRequest<SendIntergroupAnnouncementData>,
  ): Promise<SendIntergroupAnnouncementResult> => {
    const uid = requireAuth(request);

    const { intergroupId, title, content, targetGroupIds } = request.data;
    if (!intergroupId || !title || !content) {
      throw new HttpsError(
        "invalid-argument",
        "intergroupId, title, and content are required",
      );
    }

    // Load intergroup
    const intergroupSnap = await db
      .collection("intergroups")
      .doc(intergroupId)
      .get();
    if (!intergroupSnap.exists) {
      throw new HttpsError("not-found", "Intergroup not found");
    }
    const intergroupData = intergroupSnap.data()!;

    // Check that caller is admin of the intergroup
    if (!intergroupData.adminUids?.includes(uid)) {
      throw new HttpsError("permission-denied", "Must be an intergroup admin");
    }

    // Subscription must be active
    if (intergroupData.subscriptionStatus !== "active") {
      throw new HttpsError(
        "failed-precondition",
        "Intergroup subscription must be active to send announcements",
      );
    }

    const affiliatedGroupIds: string[] =
      intergroupData.affiliatedGroupIds || [];
    const groupIdsToNotify = targetGroupIds
      ? targetGroupIds.filter((id: string) => affiliatedGroupIds.includes(id))
      : affiliatedGroupIds;

    if (groupIdsToNotify.length === 0) {
      return { sentToGroupCount: 0, notificationsSent: 0 };
    }

    let notificationsSent = 0;
    const now = admin.firestore.FieldValue.serverTimestamp();

    for (const groupId of groupIdsToNotify) {
      // Write announcement to the group's announcements subcollection
      const announcementRef = db
        .collection("groups")
        .doc(groupId)
        .collection("announcements")
        .doc();

      await announcementRef.set({
        id: announcementRef.id,
        title,
        content,
        isPinned: false,
        createdAt: now,
        updatedAt: now,
        createdBy: intergroupId, // Attribution to intergroup
        authorName: intergroupData.name,
        groupId,
        userId: uid,
        memberId: uid,
        readBy: [],
        readCount: 0,
        status: "published",
      });

      // Collect FCM tokens for group members
      const membersSnap = await db
        .collection("members")
        .where("groupId", "==", groupId)
        .get();

      const memberUserIds = membersSnap.docs
        .map((doc) => doc.data().userId as string)
        .filter(Boolean);

      const tokens: string[] = [];
      for (let i = 0; i < memberUserIds.length; i += 10) {
        const batch = memberUserIds.slice(i, i + 10);
        const usersSnap = await db
          .collection("users")
          .where("__name__", "in", batch)
          .get();
        usersSnap.docs.forEach((doc) => {
          const userData = doc.data();
          const pushEnabled =
            userData.notificationSettings?.allowPushNotifications !== false;
          if (pushEnabled && userData.fcmTokens?.length) {
            tokens.push(...userData.fcmTokens);
          }
        });
      }

      if (tokens.length > 0) {
        try {
          const result = await messaging.sendEachForMulticast({
            tokens,
            notification: {
              title: `${intergroupData.name}: ${title}`,
              body: content.substring(0, 100),
            },
            data: {
              type: "intergroup_announcement",
              intergroupId,
              groupId,
            },
            android: { priority: "high" },
            apns: { payload: { aps: { sound: "default", badge: 1 } } },
          });
          notificationsSent += result.successCount;
        } catch (err) {
          console.warn(`FCM failed for group ${groupId}:`, err);
        }
      }
    }

    return { sentToGroupCount: groupIdsToNotify.length, notificationsSent };
  },
);
