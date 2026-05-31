import * as functions from "firebase-functions";
import * as functionsV1 from "firebase-functions/v1";
import * as admin from "firebase-admin";
import { db, messaging } from "../../utils/firebase";
import { pruneStaleTokens } from "../../utils/fcm";

interface AnnouncementData {
  title: string;
  content: string;
  createdBy: string;
  createdByName?: string;
  groupId: string;
  isPinned?: boolean;
  createdAt: FirebaseFirestore.Timestamp;
  status?: "published" | "scheduled";
  scheduledFor?: FirebaseFirestore.Timestamp;
}

interface MemberData {
  userId: string;
  name: string;
  role?: string;
}

interface UserData {
  fcmTokens?: string[];
  notificationSettings?: {
    announcements?: boolean;
    allowPushNotifications?: boolean;
  };
}

/**
 * Cloud Function triggered when a new announcement is created.
 *
 * Listens on the TOP-LEVEL announcements/{announcementId} collection (not a
 * group subcollection) so it is consistent with the scheduledAnnouncementPublisher
 * which also reads from the top-level collection.
 *
 * groupId is read from announcementData.groupId (a field on the document).
 *
 * Members are looked up in the TOP-LEVEL "members" collection where documents
 * have IDs like {groupId}_{userId} and a "groupId" field — NOT from the
 * groups/{groupId}/members subcollection which is always empty.
 */
export const onAnnouncementCreate = functionsV1.firestore
  .document("announcements/{announcementId}")
  .onCreate(async (snap, context) => {
    const { announcementId } = context.params;
    const announcementData = snap.data() as AnnouncementData;

    // groupId comes from the document field, not the path
    const groupId = announcementData.groupId;

    // Skip notifications for scheduled announcements — publisher function handles these
    if (announcementData.status === "scheduled") {
      functions.logger.info(
        `Announcement ${announcementId} is scheduled for ${announcementData.scheduledFor?.toDate()}, skipping notification`,
      );
      return null;
    }

    functions.logger.info(
      `New announcement ${announcementId} created in group ${groupId}`,
    );

    try {
      // Get group name
      const groupDoc = await db.collection("groups").doc(groupId).get();
      if (!groupDoc.exists) {
        functions.logger.error(`Group ${groupId} not found`);
        return;
      }
      const groupName = groupDoc.data()?.name || "Your Group";

      // Get all members of the group from the TOP-LEVEL members collection.
      // Documents have IDs like {groupId}_{userId} and a "groupId" field.
      const membersSnapshot = await db
        .collection("members")
        .where("groupId", "==", groupId)
        .get();

      if (membersSnapshot.empty) {
        functions.logger.info(`No members found in group ${groupId}`);
        return;
      }

      // Collect FCM tokens from eligible users, tracking owner per token for
      // stale-token cleanup after send.
      const tokenOwners: { uid: string; token: string }[] = [];
      const memberUserIds = membersSnapshot.docs.map(
        (doc) => (doc.data() as MemberData).userId,
      );

      // Fetch user documents to get FCM tokens and notification preferences
      const userPromises = memberUserIds.map((userId) =>
        db.collection("users").doc(userId).get(),
      );
      const userDocs = await Promise.all(userPromises);

      for (const userDoc of userDocs) {
        if (!userDoc.exists) continue;

        const userData = userDoc.data() as UserData;

        // Skip the user who created the announcement
        if (userDoc.id === announcementData.createdBy) continue;

        // Check notification preferences
        const announcementsEnabled =
          userData.notificationSettings?.announcements !== false;
        const pushEnabled =
          userData.notificationSettings?.allowPushNotifications !== false;

        if (announcementsEnabled && pushEnabled && userData.fcmTokens?.length) {
          for (const token of userData.fcmTokens) {
            tokenOwners.push({ uid: userDoc.id, token });
          }
        }
      }

      const tokens = tokenOwners.map((t) => t.token);

      if (tokens.length === 0) {
        functions.logger.info(
          "No eligible FCM tokens found for announcement notification",
        );
        return;
      }

      // Truncate announcement content for notification body
      const truncatedContent =
        announcementData.content.length > 100
          ? announcementData.content.substring(0, 97) + "..."
          : announcementData.content;

      const senderName = announcementData.createdByName || "Admin";

      // Send notification
      const response = await messaging.sendEachForMulticast({
        tokens,
        notification: {
          title: `📣 ${groupName}`,
          body: `${senderName}: ${truncatedContent}`,
        },
        data: {
          type: "announcement",
          groupId: groupId,
          announcementId: announcementId,
          groupName: groupName,
        },
        android: {
          priority: "high",
          notification: {
            channelId: "announcements",
            priority: "high",
          },
        },
        apns: {
          payload: {
            aps: {
              sound: "default",
              badge: 1,
            },
          },
        },
      });

      functions.logger.info(
        `Sent ${response.successCount} announcement notifications for group ${groupId}`,
      );

      // Mark the announcement so the sendAnnouncementNotification callable
      // knows the trigger already handled this push and won't double-send.
      await snap.ref.update({
        notificationSentAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      if (response.failureCount > 0) {
        functions.logger.warn(
          `Failed to send ${response.failureCount} announcement notifications`,
        );
        await pruneStaleTokens(tokenOwners, response.responses);
      }
    } catch (error) {
      functions.logger.error(
        `Error sending announcement notifications for group ${groupId}:`,
        error,
      );
    }
  });
