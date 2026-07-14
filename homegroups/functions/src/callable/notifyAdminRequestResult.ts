import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { db, messaging } from "../utils/firebase";
import { requireAuth } from "../utils/callableWrapper";

interface NotifyAdminRequestResultData {
  groupId: string;
  requesterId: string;
  approved: boolean;
}

interface UserData {
  displayName?: string;
  fcmTokens?: string[];
  notificationSettings?: {
    allowPushNotifications?: boolean;
  };
}

/**
 * Callable function to send notification to a user when their admin request is approved or denied
 */
export const notifyAdminRequestResult = onCall(
  async (request: CallableRequest<NotifyAdminRequestResultData>) => {
    const { groupId, requesterId, approved } = request.data;
    const callerId = requireAuth(request);

    if (!groupId || !requesterId) {
      throw new HttpsError(
        "invalid-argument",
        "Group ID and requester ID are required.",
      );
    }

    try {
      // Verify caller is an admin of the group
      const groupDoc = await db.collection("groups").doc(groupId).get();
      if (!groupDoc.exists) {
        throw new HttpsError("not-found", "Group not found.");
      }

      const groupData = groupDoc.data()!;
      const groupName = groupData.name || "the group";

      if (!groupData.admins?.includes(callerId)) {
        throw new HttpsError(
          "permission-denied",
          "Only group admins can send this notification.",
        );
      }

      // Get requester's FCM tokens
      const requesterDoc = await db.collection("users").doc(requesterId).get();
      if (!requesterDoc.exists) {
        logger.warn(`Requester ${requesterId} not found`);
        return { success: false, message: "Requester not found" };
      }

      const requesterData = requesterDoc.data() as UserData;
      const pushEnabled =
        requesterData.notificationSettings?.allowPushNotifications !== false;

      if (!pushEnabled || !requesterData.fcmTokens?.length) {
        logger.info("Requester has no eligible FCM tokens");
        return { success: true, message: "No FCM tokens to send to" };
      }

      const title = approved
        ? "✅ Admin Request Approved"
        : "❌ Admin Request Denied";
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

      logger.info(
        `Sent admin request result notification to ${requesterId}: ${
          approved ? "approved" : "denied"
        } (${response.successCount} sent, ${response.failureCount} failed)`,
      );

      return {
        success: true,
        successCount: response.successCount,
        failureCount: response.failureCount,
      };
    } catch (error: any) {
      logger.error("Error sending admin request result notification:", error);
      throw new HttpsError(
        "internal",
        error.message || "Failed to send notification.",
      );
    }
  },
);
