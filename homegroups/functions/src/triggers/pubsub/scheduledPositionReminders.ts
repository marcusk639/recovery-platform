import * as functions from "firebase-functions";
import * as functionsV1 from "firebase-functions/v1";
import * as admin from "firebase-admin";
import { db, messaging } from "../../utils/firebase";

/**
 * Scheduled Cloud Function that runs daily to send position expiry reminders.
 * Notifies position holders and group admins at 30, 7, and 1 day intervals.
 * Schedule: Every day at 9:00 AM UTC
 */
export const scheduledPositionReminders = functionsV1.pubsub
  .schedule("0 9 * * *")
  .timeZone("UTC")
  .onRun(async () => {
    functions.logger.info("Starting daily position expiry reminder check");

    const now = new Date();
    const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const oneDay = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);

    try {
      await processExpiringPositions(thirtyDays, "thirtyDay", 30);
      await processExpiringPositions(sevenDays, "sevenDay", 7);
      await processExpiringPositions(oneDay, "oneDay", 1);
      functions.logger.info("Position expiry reminder check complete");
    } catch (error) {
      functions.logger.error("Error during position expiry reminder check:", error);
    }

    return null;
  });

async function processExpiringPositions(
  targetDate: Date,
  reminderKey: "thirtyDay" | "sevenDay" | "oneDay",
  daysRemaining: number
): Promise<void> {
  const startOfDay = new Date(targetDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(targetDate);
  endOfDay.setHours(23, 59, 59, 999);

  const positionsSnapshot = await db
    .collectionGroup("servicePositions")
    .where("termEndDate", ">=", admin.firestore.Timestamp.fromDate(startOfDay))
    .where("termEndDate", "<=", admin.firestore.Timestamp.fromDate(endOfDay))
    .get();

  functions.logger.info(
    `Found ${positionsSnapshot.size} positions expiring in ${daysRemaining} day(s)`
  );

  for (const doc of positionsSnapshot.docs) {
    const position = doc.data();

    if (position.remindersSent?.[reminderKey]) continue;
    if (!position.currentHolderId) continue;

    const groupId = position.groupId;
    const groupDoc = await db.collection("groups").doc(groupId).get();
    const groupName = groupDoc.data()?.name || "Your group";

    await sendPositionReminder(
      position.currentHolderId,
      position.name,
      groupName,
      daysRemaining,
      "holder"
    );

    const admins: string[] = groupDoc.data()?.admins || [];
    for (const adminId of admins) {
      if (adminId !== position.currentHolderId) {
        await sendPositionReminder(
          adminId,
          position.name,
          groupName,
          daysRemaining,
          "admin",
          position.currentHolderName
        );
      }
    }

    await doc.ref.update({
      [`remindersSent.${reminderKey}`]: true,
    });
  }
}

async function sendPositionReminder(
  userId: string,
  positionName: string,
  groupName: string,
  daysRemaining: number,
  recipientType: "holder" | "admin",
  holderName?: string
): Promise<void> {
  const userDoc = await db.collection("users").doc(userId).get();
  if (!userDoc.exists) return;

  const userData = userDoc.data();
  if (!userData?.fcmTokens?.length) return;
  if (userData?.notificationSettings?.allowPushNotifications === false) return;

  const isUrgent = daysRemaining <= 7;

  let title: string;
  let body: string;

  if (recipientType === "holder") {
    title =
      daysRemaining === 1
        ? `${positionName} term ends tomorrow`
        : `${positionName} term ends in ${daysRemaining} days`;
    body = `Your term as ${positionName} in ${groupName} is ending soon. Talk to your group about rotation.`;
  } else {
    title = `${positionName} position expiring`;
    body =
      daysRemaining === 1
        ? `${holderName}'s term ends tomorrow. Consider assigning a successor.`
        : `${holderName}'s term ends in ${daysRemaining} days. Plan for rotation.`;
  }

  try {
    await messaging.sendEachForMulticast({
      tokens: userData.fcmTokens,
      notification: { title, body },
      data: {
        type: "position_expiry",
        daysRemaining: daysRemaining.toString(),
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
            ...(isUrgent && { "interruption-level": "time-sensitive" }),
          },
        },
      },
    });
  } catch (error) {
    functions.logger.error(
      `Failed to send position reminder to user ${userId}:`,
      error
    );
  }
}
