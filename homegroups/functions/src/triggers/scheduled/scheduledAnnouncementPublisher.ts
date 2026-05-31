import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import * as functionsV1 from "firebase-functions/v1";
import { db, messaging } from "../../utils/firebase";

interface MemberData {
  userId: string;
  name: string;
}

interface UserData {
  fcmTokens?: string[];
  notificationSettings?: {
    announcements?: boolean;
    allowPushNotifications?: boolean;
  };
}

/**
 * Get FCM tokens for all group members with announcements notifications enabled.
 * Uses the top-level "members" collection (doc IDs: {groupId}_{userId}).
 * Batches user document fetches in groups of 10 to respect Firestore 'in' query limit.
 */
async function getGroupMemberTokens(groupId: string): Promise<string[]> {
  const membersSnapshot = await db
    .collection("members")
    .where("groupId", "==", groupId)
    .get();

  const memberUserIds = membersSnapshot.docs
    .map((doc) => {
      const data = doc.data() as MemberData;
      // Prefer userId from data; fallback to doc ID (format: {groupId}_{userId})
      if (data.userId) return data.userId;
      const parts = doc.id.split("_");
      return parts.length >= 2 ? parts.slice(1).join("_") : null;
    })
    .filter((id): id is string => Boolean(id));

  const tokens: string[] = [];

  // Batch in groups of 10 (Firestore 'in' query limit)
  for (let i = 0; i < memberUserIds.length; i += 10) {
    const batch = memberUserIds.slice(i, i + 10);

    if (batch.length === 0) continue;

    const usersSnapshot = await db
      .collection("users")
      .where("__name__", "in", batch)
      .get();

    usersSnapshot.docs.forEach((doc) => {
      const userData = doc.data() as UserData;
      const announcementsEnabled =
        userData.notificationSettings?.announcements !== false;
      const pushEnabled =
        userData.notificationSettings?.allowPushNotifications !== false;

      if (announcementsEnabled && pushEnabled && userData.fcmTokens?.length) {
        tokens.push(...userData.fcmTokens);
      }
    });
  }

  return tokens;
}

/**
 * Scheduled Cloud Function that runs every 60 minutes to publish
 * announcements whose scheduledFor timestamp has passed.
 *
 * Finds all announcements with status === 'scheduled' and scheduledFor <= now,
 * updates them to status === 'published', and sends FCM push notifications
 * to all eligible group members.
 */
export const scheduledAnnouncementPublisher = functionsV1.pubsub
  .schedule("every 60 minutes")
  .timeZone("America/New_York")
  .onRun(async (_context) => {
    const now = admin.firestore.Timestamp.now();

    functions.logger.info("Starting scheduled announcement publisher run");

    // Query all scheduled announcements due to publish
    const snapshot = await db
      .collection("announcements")
      .where("status", "==", "scheduled")
      .where("scheduledFor", "<=", now)
      .get();

    if (snapshot.empty) {
      functions.logger.info(
        "No scheduled announcements due for publishing"
      );
      return null;
    }

    functions.logger.info(
      `Found ${snapshot.docs.length} announcements due for publishing`
    );

    // Process each due announcement; use allSettled so one failure doesn't block others
    const publishPromises = snapshot.docs.map(async (doc) => {
      const data = doc.data();
      const groupId = data.groupId as string;
      const title = data.title as string;
      const announcementId = doc.id;

      try {
        // 1. Update status to published
        await doc.ref.update({
          status: "published",
          publishedAt: now,
        });

        // 2. Get group name
        const groupDoc = await db.collection("groups").doc(groupId).get();
        const groupName = groupDoc.data()?.name || "Your Group";

        // 3. Get FCM tokens for eligible group members
        const tokens = await getGroupMemberTokens(groupId);

        if (tokens.length === 0) {
          functions.logger.info(
            `No eligible FCM tokens for announcement ${announcementId} in group ${groupId}`
          );
          return;
        }

        // 4. Send notification
        const response = await messaging.sendEachForMulticast({
          tokens,
          notification: {
            title: `📢 ${groupName}`,
            body: title,
          },
          data: {
            type: "announcement",
            groupId,
            announcementId,
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
          `Published announcement ${announcementId} for group ${groupId}: ` +
            `${response.successCount} sent, ${response.failureCount} failed`
        );

        if (response.failureCount > 0) {
          response.responses.forEach((resp, idx) => {
            if (!resp.success) {
              functions.logger.warn(
                `Failed to send to token ${idx} for announcement ${announcementId}: ${resp.error?.message}`
              );
            }
          });
        }
      } catch (error) {
        functions.logger.error(
          `Error publishing announcement ${announcementId} for group ${groupId}:`,
          error
        );
      }
    });

    await Promise.allSettled(publishPromises);

    functions.logger.info(
      `Processed ${snapshot.docs.length} scheduled announcements`
    );
    return null;
  });
