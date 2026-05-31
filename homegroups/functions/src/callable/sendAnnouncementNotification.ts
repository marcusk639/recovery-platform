import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { db, messaging } from "../utils/firebase";
import { pruneStaleTokens } from "../utils/fcm";

interface SendAnnouncementNotificationData {
  groupId: string;
  announcementId: string;
  title: string;
  body: string;
  /** @deprecated Ignored. Author is derived from request.auth.uid. */
  authorId?: string;
}

/**
 * Cloud function to send push notifications to group members when a new
 * announcement is posted.
 *
 * Authorization: caller must be authenticated AND an admin of the target
 * group. Membership/role is checked against `groups.admins` (legacy denorm
 * array) first, then `members/{groupId}_{userId}.isAdmin` as a fallback.
 *
 * Previously this callable performed NO auth check: any caller could push
 * arbitrary FCM notifications to every member of any group, with an
 * arbitrary `authorId` accepted from the client. The `authorId` param is
 * now deprecated and ignored — the actual author is `request.auth.uid`.
 *
 * Refs: .audit/doc-code-discrepancies.md D-2
 */
export const sendAnnouncementNotification = onCall(
  async (request: CallableRequest<SendAnnouncementNotificationData>) => {
    const data = request.data;

    // Validate input
    if (!data || !data.groupId || !data.announcementId || !data.title) {
      logger.error("Invalid announcement notification request data");
      throw new HttpsError(
        "invalid-argument",
        "Missing required announcement data (groupId, announcementId, title).",
      );
    }

    // Require authentication
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "You must be signed in to send announcement notifications.",
      );
    }

    const { groupId, announcementId, title, body } = data;
    // Use the verified auth UID, not the client-supplied authorId, as the
    // source of truth for who's posting.
    const authorId = request.auth.uid;

    logger.info(
      `Sending announcement notification for group ${groupId}, announcement ${announcementId}`,
    );

    try {
      // Get the group for both the notification title and the admin check
      const groupSnap = await db.collection("groups").doc(groupId).get();
      if (!groupSnap.exists) {
        logger.error(`Group ${groupId} not found`);
        throw new HttpsError("not-found", "Group not found");
      }
      const groupData = groupSnap.data();
      const groupName = groupData?.name || "Your Group";

      // Skip if the onAnnouncementCreate trigger already sent this notification.
      // Avoids double-notifying members when both paths fire for the same post.
      const announcementSnap = await db
        .collection("announcements")
        .doc(announcementId)
        .get();
      if (
        announcementSnap.exists &&
        announcementSnap.data()?.notificationSentAt
      ) {
        logger.info(
          `Announcement ${announcementId} already notified by trigger — skipping callable send`,
        );
        return { success: true, sentCount: 0, skipped: true };
      }

      // Authorization: only group admins may broadcast notifications.
      // Try the denormalized group-doc array first; fall back to the
      // canonical members collection if missing.
      let isAdmin =
        Array.isArray(groupData?.admins) &&
        groupData?.admins.includes(authorId);
      if (!isAdmin) {
        const memberSnap = await db
          .collection("members")
          .doc(`${groupId}_${authorId}`)
          .get();
        isAdmin = memberSnap.exists && memberSnap.data()?.isAdmin === true;
      }
      if (!isAdmin) {
        throw new HttpsError(
          "permission-denied",
          "Only group admins can send announcement notifications.",
        );
      }

      // Get all members of the group
      const membersSnapshot = await db
        .collection("members")
        .where("groupId", "==", groupId)
        .get();

      if (membersSnapshot.empty) {
        logger.info(`No members found for group ${groupId}`);
        return { success: true, sentCount: 0 };
      }

      // Collect user IDs from members (excluding the author)
      const memberUserIds = membersSnapshot.docs
        .map((doc) => doc.data().userId)
        .filter((userId) => userId && userId !== authorId);

      if (memberUserIds.length === 0) {
        logger.info("No recipients found (only author is a member)");
        return { success: true, sentCount: 0 };
      }

      // Fetch user documents to get FCM tokens and notification preferences.
      // Track token ownership so stale tokens can be pruned after send.
      // Firebase has a limit of 10 for 'in' queries, so we batch if needed.
      const tokenOwners: { uid: string; token: string }[] = [];
      const batchSize = 10;

      for (let i = 0; i < memberUserIds.length; i += batchSize) {
        const batch = memberUserIds.slice(i, i + batchSize);
        const usersSnapshot = await db
          .collection("users")
          .where("uid", "in", batch)
          .get();

        usersSnapshot.docs.forEach((doc) => {
          const userData = doc.data();

          // Check if user has announcements notifications enabled
          const announcementsEnabled =
            userData?.notificationSettings?.announcements !== false;
          const globalEnabled =
            userData?.notificationSettings?.allowPushNotifications !== false;

          if (
            announcementsEnabled &&
            globalEnabled &&
            userData?.fcmTokens &&
            Array.isArray(userData.fcmTokens)
          ) {
            for (const token of userData.fcmTokens as string[]) {
              tokenOwners.push({ uid: doc.id, token });
            }
          }
        });
      }

      const tokens = tokenOwners.map((t) => t.token);

      if (tokens.length === 0) {
        logger.info("No valid FCM tokens found for recipients");
        return { success: true, sentCount: 0 };
      }

      // Truncate body for notification
      const truncatedBody =
        body && body.length > 150 ? body.substring(0, 147) + "..." : body || "";

      // Send notifications using multicast
      const response = await messaging.sendEachForMulticast({
        tokens,
        notification: {
          title: `📣 ${groupName}`,
          body: `${title}${truncatedBody ? `: ${truncatedBody}` : ""}`,
        },
        data: {
          type: "announcement",
          groupId: groupId,
          announcementId: announcementId,
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

      logger.info(
        `Sent ${response.successCount} announcement notifications for group ${groupId}`,
      );

      if (response.failureCount > 0) {
        logger.warn(`Failed to send ${response.failureCount} notifications`);
        await pruneStaleTokens(tokenOwners, response.responses);
      }

      return {
        success: true,
        sentCount: response.successCount,
        failureCount: response.failureCount,
      };
    } catch (error) {
      // Pass through HttpsErrors we threw deliberately (unauthenticated,
      // permission-denied, not-found, etc.) so the client sees the right
      // code rather than a generic "internal".
      if (error instanceof HttpsError) {
        throw error;
      }
      logger.error("Error sending announcement notification:", error);
      // Do NOT leak `(error as Error).message` to the client — that exposes
      // internal Firestore/FCM error fragments (D-27).
      throw new HttpsError(
        "internal",
        "Failed to send announcement notifications.",
      );
    }
  },
);
