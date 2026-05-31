import * as functions from "firebase-functions";
import * as functionsV1 from "firebase-functions/v1";
import { db, messaging } from "../../utils/firebase";

type EscalationLevel = "normal" | "timed" | "instant";

interface PendingAdminRequest {
  uid: string;
  message?: string;
  requestedAt: FirebaseFirestore.Timestamp;
  requesterName?: string;
  escalationLevel?: EscalationLevel;
  autoApproveAt?: FirebaseFirestore.Timestamp;
  notificationsSent?: number;
}

interface GroupData {
  name: string;
  admins?: string[];
  pendingAdminRequests?: PendingAdminRequest[];
}

interface UserData {
  displayName?: string;
  fcmTokens?: string[];
  notificationSettings?: {
    allowPushNotifications?: boolean;
  };
}

/**
 * Get notification urgency config based on escalation level
 */
function getUrgencyConfig(escalationLevel: EscalationLevel): {
  urgencyPrefix: string;
  priority: "high" | "normal" | "max";
  channelId: string;
  bodyExtra: string;
} {
  switch (escalationLevel) {
    case "timed":
      return {
        urgencyPrefix: "⚠️ URGENT: ",
        priority: "max",
        channelId: "admin_requests_urgent",
        bodyExtra: " Will auto-approve in 7 days if no response.",
      };
    case "instant":
      // Instant claims don't need notifications as they're approved immediately
      return {
        urgencyPrefix: "",
        priority: "high",
        channelId: "admin_requests",
        bodyExtra: "",
      };
    default: // "normal"
      return {
        urgencyPrefix: "",
        priority: "high",
        channelId: "admin_requests",
        bodyExtra: "",
      };
  }
}

/**
 * Cloud Function triggered when a group document is updated
 * Specifically watches for new pending admin requests to notify existing admins
 */
export const onAdminRequestCreate = functionsV1.firestore
  .document("groups/{groupId}")
  .onUpdate(async (change, context) => {
    const { groupId } = context.params;
    const beforeData = change.before.data() as GroupData;
    const afterData = change.after.data() as GroupData;

    // Get the pending requests before and after
    const beforeRequests = beforeData.pendingAdminRequests || [];
    const afterRequests = afterData.pendingAdminRequests || [];

    // Check if a new request was added
    if (afterRequests.length <= beforeRequests.length) {
      // No new requests added
      return null;
    }

    // Find the new request(s) by comparing UIDs
    const beforeUids = new Set(beforeRequests.map((r) => r.uid));
    const newRequests = afterRequests.filter((r) => !beforeUids.has(r.uid));

    if (newRequests.length === 0) {
      return null;
    }

    functions.logger.info(
      `${newRequests.length} new admin request(s) for group ${groupId}`
    );

    // Get existing admins
    const admins = afterData.admins || [];
    if (admins.length === 0) {
      functions.logger.info(`Group ${groupId} has no admins to notify`);
      return null;
    }

    try {
      // Collect FCM tokens from admin users
      const tokens: string[] = [];

      const adminPromises = admins.map((adminId) =>
        db.collection("users").doc(adminId).get()
      );
      const adminDocs = await Promise.all(adminPromises);

      for (const adminDoc of adminDocs) {
        if (!adminDoc.exists) continue;

        const adminData = adminDoc.data() as UserData;
        const pushEnabled =
          adminData.notificationSettings?.allowPushNotifications !== false;

        if (pushEnabled && adminData.fcmTokens?.length) {
          tokens.push(...adminData.fcmTokens);
        }
      }

      if (tokens.length === 0) {
        functions.logger.info(
          "No eligible FCM tokens found for admin request notification"
        );
        return null;
      }

      // Get requester info for the notification
      for (const request of newRequests) {
        // Skip instant escalation as those are auto-approved
        const escalationLevel: EscalationLevel =
          request.escalationLevel || "normal";
        if (escalationLevel === "instant") {
          functions.logger.info(
            `Skipping notification for instant claim request from ${request.uid}`
          );
          continue;
        }

        const requesterDoc = await db
          .collection("users")
          .doc(request.uid)
          .get();
        const requesterName =
          request.requesterName ||
          (requesterDoc.data() as UserData)?.displayName ||
          "Someone";
        const firstName = requesterName.split(" ")[0];

        // Get urgency config based on escalation level
        const urgencyConfig = getUrgencyConfig(escalationLevel);

        // Build notification content
        const notificationTitle = `${urgencyConfig.urgencyPrefix}🔑 Admin Request for ${afterData.name}`;
        const notificationBody = `${firstName} has requested to become an admin. Tap to review.${urgencyConfig.bodyExtra}`;

        // Send notification to all admins
        const response = await messaging.sendEachForMulticast({
          tokens,
          notification: {
            title: notificationTitle,
            body: notificationBody,
          },
          data: {
            type: "admin_request",
            groupId: groupId,
            requesterId: request.uid,
            groupName: afterData.name,
            escalationLevel: escalationLevel,
            autoApproveAt: request.autoApproveAt?.toDate().toISOString() || "",
          },
          android: {
            // Android only supports "high" or "normal", map "max" to "high"
            priority:
              urgencyConfig.priority === "max"
                ? "high"
                : urgencyConfig.priority,
            notification: {
              channelId: urgencyConfig.channelId,
              // Notification priority can be "max" for Android notifications
              priority: urgencyConfig.priority === "max" ? "max" : "high",
            },
          },
          apns: {
            payload: {
              aps: {
                sound: "default",
                badge: 1,
                // Critical alerts for urgent requests (requires capability)
                ...(urgencyConfig.priority === "max" && {
                  "content-available": 1,
                  "interruption-level": "time-sensitive",
                }),
              },
            },
          },
        });

        functions.logger.info(
          `Sent ${response.successCount} admin request notifications for group ${groupId} (escalation: ${escalationLevel})`
        );

        if (response.failureCount > 0) {
          functions.logger.warn(
            `Failed to send ${response.failureCount} admin request notifications`
          );
        }
      }

      return null;
    } catch (error) {
      functions.logger.error(
        `Error sending admin request notifications for group ${groupId}:`,
        error
      );
      return null;
    }
  });

/**
 * Cloud Function to notify a user when their admin request is approved or denied
 */
export const notifyAdminRequestResult = async (
  groupId: string,
  groupName: string,
  requesterId: string,
  approved: boolean
): Promise<void> => {
  try {
    const requesterDoc = await db.collection("users").doc(requesterId).get();
    if (!requesterDoc.exists) {
      functions.logger.warn(`Requester ${requesterId} not found`);
      return;
    }

    const requesterData = requesterDoc.data() as UserData;
    const pushEnabled =
      requesterData.notificationSettings?.allowPushNotifications !== false;

    if (!pushEnabled || !requesterData.fcmTokens?.length) {
      functions.logger.info("Requester has no eligible FCM tokens");
      return;
    }

    const title = approved
      ? `✅ Admin Request Approved`
      : `❌ Admin Request Denied`;
    const body = approved
      ? `You are now an admin of ${groupName}!`
      : `Your request to become an admin of ${groupName} was not approved.`;

    const response = await messaging.sendEachForMulticast({
      tokens: requesterData.fcmTokens,
      notification: {
        title,
        body,
      },
      data: {
        type: "admin_request_result",
        groupId: groupId,
        groupName: groupName,
        approved: approved.toString(),
      },
      android: {
        priority: "high",
        notification: {
          channelId: approved ? "default" : "admin_requests",
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
      `Sent admin request result notification to ${requesterId}: ${
        approved ? "approved" : "denied"
      }`
    );
  } catch (error) {
    functions.logger.error(
      `Error sending admin request result notification:`,
      error
    );
  }
};
