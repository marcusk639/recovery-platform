import * as functions from "firebase-functions";
import * as functionsV1 from "firebase-functions/v1";
import { db, messaging } from "../../utils/firebase";

interface UserData {
  uid: string;
  displayName: string;
  sobrietyStartDate?: FirebaseFirestore.Timestamp;
  showSobrietyDate?: boolean;
  homeGroups?: string[];
  fcmTokens?: string[];
  notificationSettings?: {
    celebrations?: boolean;
    allowPushNotifications?: boolean;
  };
}

interface MemberData {
  userId: string;
  name: string;
}

// Milestone definitions in days
const MILESTONES = [
  { days: 30, label: "30 days" },
  { days: 60, label: "60 days" },
  { days: 90, label: "90 days" },
  { days: 180, label: "6 months" },
  { days: 270, label: "9 months" },
  { days: 365, label: "1 year" },
  { days: 548, label: "18 months" },
  { days: 730, label: "2 years" },
  { days: 1095, label: "3 years" },
  { days: 1460, label: "4 years" },
  { days: 1825, label: "5 years" },
  { days: 3650, label: "10 years" },
  { days: 5475, label: "15 years" },
  { days: 7300, label: "20 years" },
  { days: 9125, label: "25 years" },
];

// Get milestone for a given number of days
function getMilestoneForDays(days: number): string | null {
  const milestone = MILESTONES.find((m) => m.days === days);
  return milestone?.label || null;
}

// Calculate days since sobriety start
function daysSinceSobriety(startDate: Date): number {
  const now = new Date();
  const diffTime = now.getTime() - startDate.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Scheduled Cloud Function that runs daily to check for sobriety milestones
 * Sends notifications to group members when someone reaches a milestone
 * Schedule: Every day at 9:00 AM UTC
 */
export const scheduledMilestoneCheck = functionsV1.pubsub
  .schedule("0 9 * * *") // 9:00 AM UTC daily
  .timeZone("UTC")
  .onRun(async () => {
    functions.logger.info("Starting daily milestone check");

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Query one date window per milestone instead of scanning the full users collection.
      // For each milestone (e.g. 30 days), find users whose sobriety date falls exactly
      // that many days before today (±12 hours to handle timezone skew).
      const milestoneQueries = MILESTONES.map(({ days, label }) => {
        const targetDate = new Date(
          today.getTime() - days * 24 * 60 * 60 * 1000,
        );
        const windowStart = new Date(
          targetDate.getTime() - 12 * 60 * 60 * 1000,
        );
        const windowEnd = new Date(targetDate.getTime() + 12 * 60 * 60 * 1000);
        return { label, windowStart, windowEnd };
      });

      let notificationsSent = 0;

      await Promise.all(
        milestoneQueries.map(
          async ({ label: milestone, windowStart, windowEnd }) => {
            const snap = await db
              .collection("users")
              .where("sobrietyStartDate", ">=", windowStart)
              .where("sobrietyStartDate", "<", windowEnd)
              .get();

            if (snap.empty) return;

            functions.logger.info(
              `Found ${snap.size} user(s) reaching milestone: ${milestone}`,
            );

            await Promise.all(
              snap.docs.map(async (userDoc) => {
                const userData = userDoc.data() as UserData;

                if (userData.showSobrietyDate !== true) {
                  await sendPersonalMilestoneNotification(userData, milestone);
                  return;
                }

                await sendPersonalMilestoneNotification(userData, milestone);

                const homeGroups = userData.homeGroups || [];
                const groupResults = await Promise.all(
                  homeGroups.map((groupId) =>
                    notifyGroupMembersOfMilestone(
                      groupId,
                      userData.uid,
                      userData.displayName,
                      milestone,
                    ),
                  ),
                );
                notificationsSent += groupResults.reduce((a, b) => a + b, 0);
              }),
            );
          },
        ),
      );

      functions.logger.info(
        `Milestone check complete. Sent ${notificationsSent} group notifications.`,
      );
    } catch (error) {
      functions.logger.error("Error during milestone check:", error);
    }
  });

/**
 * Send a personal milestone notification to the user celebrating
 */
async function sendPersonalMilestoneNotification(
  userData: UserData,
  milestone: string,
): Promise<void> {
  // Check if user has push enabled
  const pushEnabled =
    userData.notificationSettings?.allowPushNotifications !== false;
  const celebrationsEnabled =
    userData.notificationSettings?.celebrations !== false;

  if (!pushEnabled || !celebrationsEnabled || !userData.fcmTokens?.length) {
    return;
  }

  try {
    await messaging.sendEachForMulticast({
      tokens: userData.fcmTokens,
      notification: {
        title: "🎉 Congratulations!",
        body: `You're celebrating ${milestone} of sobriety today! Keep up the amazing work!`,
      },
      data: {
        type: "milestone",
        milestone: milestone,
        userId: userData.uid,
      },
      android: {
        priority: "high",
        notification: {
          channelId: "celebrations",
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
      `Sent personal milestone notification to ${userData.displayName}`,
    );
  } catch (error) {
    functions.logger.error(
      `Error sending personal milestone notification to ${userData.displayName}:`,
      error,
    );
  }
}

/**
 * Notify group members about a member's milestone
 */
async function notifyGroupMembersOfMilestone(
  groupId: string,
  celebratingUserId: string,
  celebratingUserName: string,
  milestone: string,
): Promise<number> {
  try {
    // Get group info
    const groupDoc = await db.collection("groups").doc(groupId).get();
    if (!groupDoc.exists) {
      return 0;
    }
    const groupName = groupDoc.data()?.name || "Your Group";

    // Get group members
    const membersSnapshot = await db
      .collection("groups")
      .doc(groupId)
      .collection("members")
      .get();

    const tokens: string[] = [];

    // Get FCM tokens for members who have celebrations enabled
    for (const memberDoc of membersSnapshot.docs) {
      const memberData = memberDoc.data() as MemberData;

      // Skip the celebrating user
      if (memberData.userId === celebratingUserId) continue;

      const userDoc = await db.collection("users").doc(memberData.userId).get();
      if (!userDoc.exists) continue;

      const userData = userDoc.data() as UserData;
      const celebrationsEnabled =
        userData.notificationSettings?.celebrations !== false;
      const pushEnabled =
        userData.notificationSettings?.allowPushNotifications !== false;

      if (celebrationsEnabled && pushEnabled && userData.fcmTokens?.length) {
        tokens.push(...userData.fcmTokens);
      }
    }

    if (tokens.length === 0) {
      return 0;
    }

    // Get first name only for privacy
    const firstName = celebratingUserName.split(" ")[0];

    const response = await messaging.sendEachForMulticast({
      tokens,
      notification: {
        title: `🎉 Celebration in ${groupName}!`,
        body: `${firstName} is celebrating ${milestone} of sobriety!`,
      },
      data: {
        type: "milestone",
        groupId: groupId,
        groupName: groupName,
        userId: celebratingUserId,
        milestone: milestone,
      },
      android: {
        priority: "normal",
        notification: {
          channelId: "celebrations",
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
      `Sent ${response.successCount} milestone notifications to group ${groupId}`,
    );

    return response.successCount;
  } catch (error) {
    functions.logger.error(
      `Error sending milestone notifications to group ${groupId}:`,
      error,
    );
    return 0;
  }
}
