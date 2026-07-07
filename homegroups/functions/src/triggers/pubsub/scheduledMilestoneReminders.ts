import * as functionsV1 from "firebase-functions/v1";
import * as functions from "firebase-functions";
import { db, messaging } from "../../utils/firebase";

/**
 * Internal handler — exported for testing.
 *
 * Queries milestones where nextMilestoneDate is within the next 3 days,
 * then sends FCM reminders to group admins.
 */
export async function scheduledMilestoneRemindersHandler(): Promise<void> {
  const now = new Date();
  const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  // Query all milestone docs across all groups whose next milestone is upcoming soon
  const milestonesSnap = await db
    .collectionGroup("milestones")
    .where("nextMilestoneDate", ">=", now)
    .where("nextMilestoneDate", "<=", threeDaysFromNow)
    .get();

  if (milestonesSnap.docs.length === 0) {
    functions.logger.info(
      "scheduledMilestoneReminders: no upcoming milestones found.",
    );
    return;
  }

  functions.logger.info(
    `scheduledMilestoneReminders: ${milestonesSnap.docs.length} upcoming milestone(s) found.`,
  );

  for (const milestoneDoc of milestonesSnap.docs) {
    const milestoneData = milestoneDoc.data();
    const displayName: string = milestoneData.displayName || "A member";
    const nextMilestoneDays: number = milestoneData.nextMilestoneDays || 0;
    const nextMilestoneDate: Date =
      typeof milestoneData.nextMilestoneDate?.toDate === "function"
        ? milestoneData.nextMilestoneDate.toDate()
        : new Date(milestoneData.nextMilestoneDate);

    // Get groupId from document path: groups/{groupId}/milestones/{memberId}
    const groupId: string = milestoneDoc.ref.parent.parent?.id || "";
    if (!groupId) {
      functions.logger.warn(
        "scheduledMilestoneReminders: could not determine groupId from ref",
        milestoneDoc.ref.path,
      );
      continue;
    }

    const daysUntil = Math.round(
      (nextMilestoneDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
    );

    const yearCount = Math.floor(nextMilestoneDays / 365);
    const daysLabel =
      nextMilestoneDays >= 365
        ? `${yearCount} ${yearCount === 1 ? "year" : "years"}`
        : `${nextMilestoneDays} days`;

    // Load group admins
    const adminMembersSnap = await db
      .collection("members")
      .where("groupId", "==", groupId)
      .get();

    const adminUserIds = adminMembersSnap.docs
      .filter((d) => d.data().isAdmin === true)
      .map((d) => d.data().userId as string);

    if (adminUserIds.length === 0) {
      functions.logger.info(
        `scheduledMilestoneReminders: no admins found for group ${groupId}`,
      );
      continue;
    }

    // Collect FCM tokens from admin users (who have push enabled)
    const tokens: string[] = [];
    await Promise.all(
      adminUserIds.map(async (uid) => {
        const userSnap = await db.collection("users").doc(uid).get();
        if (!userSnap.exists) return;
        const userData = userSnap.data()!;
        const pushEnabled =
          userData.notificationSettings?.allowPushNotifications !== false;
        const celebrationsEnabled =
          userData.notificationSettings?.celebrations !== false;
        if (pushEnabled && celebrationsEnabled && userData.fcmTokens?.length) {
          tokens.push(...userData.fcmTokens);
        }
      }),
    );

    if (tokens.length === 0) {
      functions.logger.info(
        `scheduledMilestoneReminders: no eligible admin tokens for group ${groupId}`,
      );
      continue;
    }

    // Send reminder FCM in batches of 500
    const batchSize = 500;
    for (let i = 0; i < tokens.length; i += batchSize) {
      const batch = tokens.slice(i, i + batchSize);
      try {
        await messaging.sendEachForMulticast({
          tokens: batch,
          notification: {
            title: `${displayName} reaches ${daysLabel} in ${daysUntil === 0 ? "less than a day" : `${daysUntil} day${daysUntil !== 1 ? "s" : ""}`}`,
            body: `Remember to have the chip ready! ${displayName} will celebrate ${daysLabel} soon.`,
          },
          data: {
            type: "milestone_reminder",
            groupId,
            memberId: milestoneDoc.id,
            days: String(nextMilestoneDays),
          },
          android: { priority: "normal" },
          apns: { payload: { aps: { sound: "default" } } },
        });
      } catch (err) {
        functions.logger.error(
          `scheduledMilestoneReminders: FCM error for group ${groupId}:`,
          err,
        );
      }
    }

    functions.logger.info(
      `scheduledMilestoneReminders: sent reminder (${daysLabel}) in group ${groupId} to ${tokens.length} admin token(s)`,
    );
  }
}

/**
 * Runs daily at 06:00 UTC.
 * Sends reminder notifications to group admins when a member's milestone
 * falls within the next 3 days.
 */
export const scheduledMilestoneReminders = functionsV1.pubsub
  .schedule("0 6 * * *")
  .timeZone("UTC")
  .onRun(async () => {
    await scheduledMilestoneRemindersHandler();
    return null;
  });
