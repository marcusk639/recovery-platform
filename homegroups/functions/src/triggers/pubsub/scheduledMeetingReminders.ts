// functions/src/triggers/pubsub/scheduledMeetingReminders.ts
// V2.2 Task 4.2 — Meeting Reminders
// Runs every hour. Finds meeting instances starting within the next hour
// and sends FCM push notifications to users who have favorited that meeting.
import * as functionsV1 from "firebase-functions/v1";
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { db, messaging } from "../../utils/firebase";

/**
 * Scheduled function that runs at the top of every hour.
 * It looks for meeting instances starting in the next 60 minutes,
 * finds all users who have `favoriteMeetings` containing the meetingId
 * of those instances, and sends them a reminder push notification.
 */
export const scheduledMeetingReminders = functionsV1.pubsub
  .schedule("0 * * * *") // Top of every hour
  .timeZone("UTC")
  .onRun(async () => {
    const now = new Date();
    const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);

    // Query meeting instances scheduled within the next hour that are not cancelled
    const instancesSnap = await db
      .collection("meetingInstances")
      .where("scheduledAt", ">=", admin.firestore.Timestamp.fromDate(now))
      .where("scheduledAt", "<=", admin.firestore.Timestamp.fromDate(oneHourLater))
      .where("isCancelled", "==", false)
      .get();

    if (instancesSnap.empty) {
      functions.logger.info("No meeting instances starting within the next hour.");
      return null;
    }

    functions.logger.info(
      `Found ${instancesSnap.size} upcoming meeting instance(s) for reminders.`,
    );

    for (const instanceDoc of instancesSnap.docs) {
      const instance = instanceDoc.data();
      const meetingId: string = instance.meetingId;
      const meetingName: string = instance.name ?? "Meeting";
      const groupId: string = instance.groupId;

      // Parse scheduled time for display
      const scheduledAt: admin.firestore.Timestamp = instance.scheduledAt;
      const scheduledDate = scheduledAt.toDate();
      const timeStr = scheduledDate.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: "UTC",
      });

      // Find all users who have favorited this meeting
      // Firestore array-contains queries are efficient for this pattern.
      const usersSnap = await db
        .collection("users")
        .where("favoriteMeetings", "array-contains", meetingId)
        .get();

      if (usersSnap.empty) {
        functions.logger.info(
          `No users favorited meeting ${meetingId} — skipping.`,
        );
        continue;
      }

      // Collect FCM tokens from eligible users (only those who actually favorited)
      const tokens: string[] = [];
      usersSnap.docs.forEach((userDoc) => {
        const userData = userDoc.data();
        const hasFavorited = userData.favoriteMeetings?.includes(meetingId);
        const pushEnabled =
          userData.notificationSettings?.allowPushNotifications !== false;
        const meetingNotifEnabled =
          userData.notificationSettings?.meetings !== false;
        if (hasFavorited && pushEnabled && meetingNotifEnabled && userData.fcmTokens?.length) {
          tokens.push(...userData.fcmTokens);
        }
      });

      if (tokens.length === 0) {
        functions.logger.info(
          `No eligible FCM tokens for meeting ${meetingId}.`,
        );
        continue;
      }

      // Send in batches of 500
      const batchSize = 500;
      for (let i = 0; i < tokens.length; i += batchSize) {
        const batch = tokens.slice(i, i + batchSize);
        await messaging.sendEachForMulticast({
          tokens: batch,
          notification: {
            title: "Meeting Starting Soon",
            body: `${meetingName} starts at ${timeStr} today. See you there!`,
          },
          data: {
            type: "meeting_reminder",
            meetingId,
            groupId,
            instanceId: instanceDoc.id,
          },
          android: {
            priority: "high",
            notification: {
              channelId: "meetings",
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
      }

      functions.logger.info(
        `Sent meeting reminder for "${meetingName}" (${meetingId}) to ${tokens.length} token(s).`,
      );
    }

    return null;
  });
