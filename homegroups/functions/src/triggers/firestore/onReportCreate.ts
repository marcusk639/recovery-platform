import * as functions from "firebase-functions/v1";
import { db, messaging } from "../../utils/firebase";
import * as admin from "firebase-admin";

/**
 * Firestore trigger that runs when a new report is created
 * - Notifies group admins about the new report
 * - Checks for repeat offenders (multiple reports against same user)
 */
export const onReportCreate = functions.firestore
  .document("reports/{reportId}")
  .onCreate(async (snapshot, context) => {
    const reportId = context.params.reportId;
    const reportData = snapshot.data();

    if (!reportData) {
      functions.logger.error(`Report ${reportId} has no data`);
      return;
    }

    const { groupId, reportedUserId, reportedUserName, reporterName, reason } =
      reportData;

    functions.logger.info(`New report created: ${reportId}`, {
      groupId,
      reportedUserId,
      reason,
    });

    try {
      // Get group admins
      const groupDoc = await db.collection("groups").doc(groupId).get();

      if (!groupDoc.exists) {
        functions.logger.warn(`Group ${groupId} not found for report`);
        return;
      }

      const groupData = groupDoc.data();
      const groupName = groupData?.name || "Unknown Group";
      const adminIds: string[] = groupData?.admins || [];

      if (adminIds.length === 0) {
        functions.logger.info(`No admins to notify for group ${groupId}`);
        return;
      }

      // Get FCM tokens for all admins
      const tokens: string[] = [];
      const adminDocs = await Promise.all(
        adminIds.map((adminId) => db.collection("users").doc(adminId).get())
      );

      for (const doc of adminDocs) {
        if (doc.exists) {
          const userData = doc.data();
          // Check if admin has notifications enabled
          const notificationsEnabled =
            userData?.notificationSettings?.allowPushNotifications !== false;

          if (notificationsEnabled && userData?.fcmTokens) {
            tokens.push(...userData.fcmTokens);
          }
        }
      }

      if (tokens.length === 0) {
        functions.logger.info("No FCM tokens found for admins");
        return;
      }

      // Format reason for display
      const reasonLabels: Record<string, string> = {
        harassment: "Harassment",
        spam: "Spam",
        inappropriate: "Inappropriate Content",
        threatening: "Threatening Behavior",
        other: "Other",
      };

      const reasonLabel = reasonLabels[reason] || reason;

      // Send notification to admins
      const message = {
        tokens,
        notification: {
          title: `New Report in ${groupName}`,
          body: `${reporterName} reported ${reportedUserName} for ${reasonLabel}`,
        },
        data: {
          type: "moderation_report",
          reportId,
          groupId,
          reportedUserId,
        },
        android: {
          priority: "high" as const,
          notification: {
            channelId: "moderation",
            priority: "high" as const,
          },
        },
        apns: {
          payload: {
            aps: {
              badge: 1,
              sound: "default",
            },
          },
        },
      };

      const response = await messaging.sendEachForMulticast(message);

      functions.logger.info(
        `Sent ${response.successCount} notifications for report ${reportId}`
      );

      if (response.failureCount > 0) {
        functions.logger.warn(
          `Failed to send ${response.failureCount} notifications`
        );
      }

      // Check for repeat offenders
      await checkRepeatOffender(reportedUserId, groupId);
    } catch (error) {
      functions.logger.error(`Error processing report ${reportId}:`, error);
    }
  });

/**
 * Check if a user has been reported multiple times
 * If threshold is exceeded, auto-flag for urgent review
 */
async function checkRepeatOffender(userId: string, groupId: string) {
  try {
    // Count reports against this user in the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const reportsSnapshot = await db
      .collection("reports")
      .where("reportedUserId", "==", userId)
      .where("groupId", "==", groupId)
      .where(
        "createdAt",
        ">=",
        admin.firestore.Timestamp.fromDate(thirtyDaysAgo)
      )
      .get();

    const reportCount = reportsSnapshot.size;

    // If user has 3+ reports in 30 days, flag as repeat offender
    if (reportCount >= 3) {
      functions.logger.warn(
        `User ${userId} flagged as repeat offender in group ${groupId}: ${reportCount} reports in 30 days`
      );

      // Update all pending reports for this user to indicate repeat offender status
      const pendingReports = reportsSnapshot.docs.filter(
        (doc) => doc.data().status === "pending"
      );

      for (const report of pendingReports) {
        await report.ref.update({
          isRepeatOffender: true,
          repeatOffenderCount: reportCount,
        });
      }

      // Notify super admins about repeat offender
      await notifySuperAdmins(userId, groupId, reportCount);
    }
  } catch (error) {
    functions.logger.error("Error checking for repeat offender:", error);
  }
}

/**
 * Notify super admins about a repeat offender
 */
async function notifySuperAdmins(
  userId: string,
  groupId: string,
  reportCount: number
) {
  try {
    // Get super admins
    const superAdminsSnapshot = await db
      .collection("users")
      .where("role", "==", "admin")
      .get();

    if (superAdminsSnapshot.empty) {
      return;
    }

    // Get group name
    const groupDoc = await db.collection("groups").doc(groupId).get();
    const groupName = groupDoc.data()?.name || "Unknown Group";

    // Get user name
    const userDoc = await db.collection("users").doc(userId).get();
    const userName = userDoc.data()?.displayName || "Unknown User";

    // Collect FCM tokens
    const tokens: string[] = [];
    for (const doc of superAdminsSnapshot.docs) {
      const userData = doc.data();
      if (
        userData.notificationSettings?.allowPushNotifications !== false &&
        userData.fcmTokens
      ) {
        tokens.push(...userData.fcmTokens);
      }
    }

    if (tokens.length === 0) {
      return;
    }

    // Send notification
    const message = {
      tokens,
      notification: {
        title: "⚠️ Repeat Offender Alert",
        body: `${userName} has ${reportCount} reports in ${groupName} (30 days)`,
      },
      data: {
        type: "repeat_offender",
        userId,
        groupId,
        reportCount: String(reportCount),
      },
    };

    await messaging.sendEachForMulticast(message);

    functions.logger.info(
      `Notified super admins about repeat offender ${userId}`
    );
  } catch (error) {
    functions.logger.error("Error notifying super admins:", error);
  }
}
