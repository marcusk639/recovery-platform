import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { db, messaging } from "../utils/firebase";
import * as admin from "firebase-admin";
import { requireAuth } from "../utils/callableWrapper";

interface CancelTreasurerHandoffData {
  groupId: string;
}

/**
 * Cloud function to cancel a treasurer handoff.
 * Either the current treasurer (initiator) or the target user can cancel.
 */
export const cancelTreasurerHandoff = onCall(
  async (request: CallableRequest<CancelTreasurerHandoffData>) => {
    const data = request.data;
    const currentUserId = requireAuth(request);

    // Validate input
    if (!data || !data.groupId) {
      throw new HttpsError("invalid-argument", "Missing required groupId.");
    }

    const { groupId } = data;

    logger.info(
      `Cancelling treasurer handoff for group ${groupId} by user ${currentUserId}`,
    );

    try {
      const groupRef = db.collection("groups").doc(groupId);
      const groupSnap = await groupRef.get();

      if (!groupSnap.exists) {
        throw new HttpsError("not-found", "Group not found.");
      }

      const groupData = groupSnap.data();
      const pendingHandoff = groupData?.pendingTreasurerHandoff;

      // Verify there's a pending handoff
      if (!pendingHandoff) {
        throw new HttpsError(
          "failed-precondition",
          "No pending treasurer handoff to cancel.",
        );
      }

      const { fromUserId, toUserId, fromUserName, toUserName } = pendingHandoff;

      // Verify the current user is either the initiator or the target
      if (currentUserId !== fromUserId && currentUserId !== toUserId) {
        throw new HttpsError(
          "permission-denied",
          "Only the current treasurer or the designated new treasurer can cancel the handoff.",
        );
      }

      // Clear the pending handoff
      await groupRef.update({
        pendingTreasurerHandoff: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Create audit log entry
      const auditRef = db
        .collection("groups")
        .doc(groupId)
        .collection("auditLog")
        .doc();

      await auditRef.set({
        type: "treasurer_handoff_cancelled",
        fromUserId,
        fromUserName,
        toUserId,
        toUserName,
        cancelledBy: currentUserId,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Send notification to the other party
      const notifyUserId = currentUserId === fromUserId ? toUserId : fromUserId;
      const cancellerName =
        currentUserId === fromUserId ? fromUserName : toUserName;

      const notifyUserSnap = await db
        .collection("users")
        .doc(notifyUserId)
        .get();
      const notifyUserData = notifyUserSnap.data();

      if (
        notifyUserData?.fcmTokens &&
        Array.isArray(notifyUserData.fcmTokens) &&
        notifyUserData.fcmTokens.length > 0
      ) {
        const groupName = groupData?.name || "the group";
        const action = currentUserId === fromUserId ? "withdrawn" : "declined";

        try {
          await messaging.sendEachForMulticast({
            tokens: notifyUserData.fcmTokens,
            notification: {
              title: "Treasurer Transfer Cancelled",
              body: `${cancellerName} has ${action} the treasurer role transfer for ${groupName}.`,
            },
            data: {
              type: "treasurer_handoff",
              groupId: groupId,
              action: "cancelled",
            },
          });
        } catch (notifyError) {
          logger.warn(
            "Failed to send handoff cancellation notification:",
            notifyError,
          );
        }
      }

      logger.info(
        `Treasurer handoff cancelled successfully for group ${groupId} by ${currentUserId}`,
      );

      return {
        success: true,
        message:
          currentUserId === fromUserId
            ? "Treasurer transfer has been withdrawn."
            : "Treasurer transfer has been declined.",
      };
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }
      logger.error("Error cancelling treasurer handoff:", error);
      throw new HttpsError("internal", "Failed to cancel treasurer handoff.");
    }
  },
);
