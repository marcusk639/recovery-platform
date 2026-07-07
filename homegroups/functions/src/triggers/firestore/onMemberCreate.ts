import * as functions from "firebase-functions";
import * as functionsV1 from "firebase-functions/v1";
import { db, messaging } from "../../utils/firebase";

interface MemberData {
  userId: string;
  groupId: string;
  displayName?: string;
  name?: string;
  role?: string;
  roles?: string[];
  isAdmin?: boolean;
  isTreasurer?: boolean;
  joinedAt?: FirebaseFirestore.Timestamp;
}

interface UserData {
  fcmTokens?: string[];
  notificationSettings?: {
    allowPushNotifications?: boolean;
    newMemberNotifications?: boolean;
  };
}

/**
 * Cloud Function triggered when a new member joins a group
 * Sends push notifications to all existing group members
 *
 * NOTE: This listens to the top-level "members" collection
 * Document ID format: {groupId}_{userId}
 */
export const onMemberCreate = functionsV1.firestore
  .document("members/{memberId}")
  .onCreate(async (snap, context) => {
    const { memberId } = context.params;
    const newMemberData = snap.data() as MemberData;

    // Extract groupId from the member data or document ID
    let groupId = newMemberData.groupId;
    if (!groupId) {
      // Fallback: extract from document ID (format: {groupId}_{userId})
      const parts = memberId.split("_");
      if (parts.length >= 2) {
        groupId = parts[0];
      }
    }

    if (!groupId) {
      functions.logger.error(
        `Could not determine groupId from member document ${memberId}`,
      );
      return;
    }

    const memberName =
      newMemberData.displayName || newMemberData.name || "A new member";

    functions.logger.info(
      `New member ${memberId} joined group ${groupId}: ${memberName}`,
    );

    try {
      // Get group name
      const groupDoc = await db.collection("groups").doc(groupId).get();
      if (!groupDoc.exists) {
        functions.logger.error(`Group ${groupId} not found`);
        return;
      }
      const groupName = groupDoc.data()?.name || "Your Group";

      // Get all members of the group from top-level members collection
      const membersSnapshot = await db
        .collection("members")
        .where("groupId", "==", groupId)
        .get();

      if (membersSnapshot.size <= 1) {
        // Only the new member exists, no one to notify
        functions.logger.info(
          `No other members in group ${groupId} to notify about new member`,
        );
        return;
      }

      // Collect existing members' user IDs (excluding the new member)
      const existingMemberUserIds: string[] = [];
      for (const memberDoc of membersSnapshot.docs) {
        const memberData = memberDoc.data() as MemberData;
        if (memberData.userId !== newMemberData.userId) {
          existingMemberUserIds.push(memberData.userId);
        }
      }

      if (existingMemberUserIds.length === 0) {
        functions.logger.info("No existing members to notify");
        return;
      }

      // Fetch user documents in batches of 10 (Firestore 'in' query limit)
      // instead of one get() per member — see onMeetingInstanceUpdate.ts's
      // getGroupMemberTokens for the same pattern applied elsewhere.
      const tokens: string[] = [];
      for (let i = 0; i < existingMemberUserIds.length; i += 10) {
        const batch = existingMemberUserIds.slice(i, i + 10);
        if (batch.length === 0) continue;

        const usersSnapshot = await db
          .collection("users")
          .where("__name__", "in", batch)
          .get();

        usersSnapshot.docs.forEach((userDoc) => {
          const userData = userDoc.data() as UserData;
          const pushEnabled =
            userData.notificationSettings?.allowPushNotifications !== false;
          const newMemberNotificationsEnabled =
            userData.notificationSettings?.newMemberNotifications !== false;

          if (
            pushEnabled &&
            newMemberNotificationsEnabled &&
            userData.fcmTokens?.length
          ) {
            tokens.push(...userData.fcmTokens);
          }
        });
      }

      if (tokens.length === 0) {
        functions.logger.info(
          "No eligible FCM tokens found for new member notification",
        );
        return;
      }

      // Get new member's first name only for privacy
      const memberFirstName = memberName.split(" ")[0];

      // Send notification
      const response = await messaging.sendEachForMulticast({
        tokens,
        notification: {
          title: `👋 New Member in ${groupName}`,
          body: `${memberFirstName} has joined the group`,
        },
        data: {
          type: "new_member",
          groupId: groupId,
          memberId: memberId,
          groupName: groupName,
        },
        android: {
          priority: "normal",
          notification: {
            channelId: "default",
          },
        },
        apns: {
          payload: {
            aps: {
              sound: "default",
            },
          },
        },
      });

      functions.logger.info(
        `Sent ${response.successCount} new member notifications for group ${groupId}`,
      );

      if (response.failureCount > 0) {
        functions.logger.warn(
          `Failed to send ${response.failureCount} new member notifications`,
        );
      }
    } catch (error) {
      functions.logger.error(
        `Error sending new member notifications for group ${groupId}:`,
        error,
      );
    }
  });
