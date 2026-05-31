import * as functions from "firebase-functions";
import * as functionsV1 from "firebase-functions/v1";
import * as admin from "firebase-admin";
import { db, messaging } from "../../utils/firebase";

/**
 * Scheduled Cloud Function that runs daily to send trial ending reminders.
 * Sends reminders at Day 5 (2 days remaining) and Day 7 (trial ending).
 * Schedule: Every day at 10:00 AM UTC
 */
export const scheduledTrialReminders = functionsV1.pubsub
  .schedule("0 10 * * *")
  .timeZone("UTC")
  .onRun(async () => {
    functions.logger.info("Starting daily trial reminder check");

    const now = Date.now();
    const twoDaysFromNow = new Date(now + 2 * 24 * 60 * 60 * 1000);
    const threeDaysFromNow = new Date(now + 3 * 24 * 60 * 60 * 1000);
    const tomorrow = new Date(now + 1 * 24 * 60 * 60 * 1000);

    try {
      // Day 5 reminder: trial ends in 2–3 days
      const day5Groups = await findTrialingGroups(twoDaysFromNow, threeDaysFromNow);
      // Day 7 reminder: trial ends today or tomorrow
      const day7Groups = await findTrialingGroups(new Date(now), tomorrow);

      let sent = 0;
      for (const group of day5Groups) {
        await sendTrialReminder(group, "day5");
        sent++;
      }
      for (const group of day7Groups) {
        await sendTrialReminder(group, "day7");
        sent++;
      }

      functions.logger.info(
        `Trial reminders sent: ${day5Groups.length} day-5, ${day7Groups.length} day-7`
      );
    } catch (error) {
      functions.logger.error("Error during trial reminder check:", error);
    }

    return null;
  });

async function findTrialingGroups(from: Date, to: Date): Promise<FirebaseFirestore.DocumentData[]> {
  const snapshot = await db
    .collection("groups")
    .where("subscriptionStatus", "==", "trialing")
    .where(
      "subscriptionExpiresAt",
      ">=",
      admin.firestore.Timestamp.fromDate(from)
    )
    .where(
      "subscriptionExpiresAt",
      "<=",
      admin.firestore.Timestamp.fromDate(to)
    )
    .get();

  return snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));
}

async function sendTrialReminder(
  group: FirebaseFirestore.DocumentData,
  type: "day5" | "day7"
): Promise<void> {
  const admins: string[] = group.admins || [];
  const tokens: string[] = [];

  const userDocs = await Promise.all(
    admins.map((adminId) => db.collection("users").doc(adminId).get())
  );
  for (const userDoc of userDocs) {
    if (!userDoc.exists) continue;
    const userData = userDoc.data();
    if (
      userData?.fcmTokens?.length > 0 &&
      userData?.notificationSettings?.allowPushNotifications !== false
    ) {
      tokens.push(...userData.fcmTokens);
    }
  }

  if (tokens.length === 0) return;

  const isUrgent = type === "day7";

  // Determine whether the trial ends today or tomorrow to pick the correct title.
  // subscriptionExpiresAt comes from Firestore as a Timestamp object.
  let urgentTitle = `${group.name}: Trial Ending Soon!`;
  if (isUrgent) {
    const expiresAt: Date =
      typeof group.subscriptionExpiresAt?.toDate === "function"
        ? group.subscriptionExpiresAt.toDate()
        : new Date(group.subscriptionExpiresAt);
    const midnightUTC = new Date();
    midnightUTC.setUTCHours(24, 0, 0, 0); // start of next UTC day
    urgentTitle =
      expiresAt < midnightUTC
        ? `${group.name}: Trial Ends Today!`
        : `${group.name}: Trial Ends Tomorrow!`;
  }

  const title = isUrgent ? urgentTitle : `${group.name}: 2 Days Left in Trial`;
  const body = isUrgent
    ? "Upgrade now to keep treasury, announcements, and all admin features."
    : "Your free trial is almost over. Upgrade to continue using all features.";

  try {
    await messaging.sendEachForMulticast({
      tokens,
      notification: {title, body},
      data: {
        type: "trial_reminder",
        groupId: group.id,
        urgency: type,
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
            ...(isUrgent && {"interruption-level": "time-sensitive"}),
          },
        },
      },
      android: {
        priority: "high",
        notification: {
          sound: "default",
          priority: isUrgent ? "max" : "high",
        },
      },
    });
    functions.logger.info(`Sent ${type} trial reminder for group ${group.id}`);
  } catch (error) {
    functions.logger.error(
      `Failed to send ${type} trial reminder for group ${group.id}:`,
      error
    );
  }
}
