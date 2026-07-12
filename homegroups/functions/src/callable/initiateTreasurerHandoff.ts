import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { db, messaging } from "../utils/firebase";
import * as admin from "firebase-admin";
import { requireAuth } from "../utils/callableWrapper";

interface InitiateTreasurerHandoffData {
  groupId: string;
  toUserId: string;
  message?: string;
}

/**
 * Cloud function to initiate a treasurer handoff.
 * Only the current treasurer can initiate a handoff.
 */
export const initiateTreasurerHandoff = onCall(
  async (request: CallableRequest<InitiateTreasurerHandoffData>) => {
    const data = request.data;
    const fromUserId = requireAuth(request);

    // Validate input
    if (!data || !data.groupId || !data.toUserId) {
      throw new HttpsError(
        "invalid-argument",
        "Missing required data (groupId, toUserId).",
      );
    }

    const { groupId, toUserId, message } = data;

    // Cannot transfer to yourself
    if (fromUserId === toUserId) {
      throw new HttpsError(
        "invalid-argument",
        "Cannot transfer treasurer role to yourself.",
      );
    }

    logger.info(
      `Initiating treasurer handoff for group ${groupId}: ${fromUserId} -> ${toUserId}`,
    );

    try {
      const groupRef = db.collection("groups").doc(groupId);
      const groupSnap = await groupRef.get();

      if (!groupSnap.exists) {
        throw new HttpsError("not-found", "Group not found.");
      }

      const groupData = groupSnap.data();
      const treasurers = groupData?.treasurers || [];

      // Verify current user is a treasurer
      if (!treasurers.includes(fromUserId)) {
        throw new HttpsError(
          "permission-denied",
          "Only the current treasurer can initiate a handoff.",
        );
      }

      // Check if there's already a pending handoff
      if (groupData?.pendingTreasurerHandoff) {
        throw new HttpsError(
          "failed-precondition",
          "There is already a pending treasurer handoff. Please cancel it first.",
        );
      }

      // Verify the target user is a member of the group
      const memberSnap = await db
        .collection("members")
        .where("groupId", "==", groupId)
        .where("userId", "==", toUserId)
        .limit(1)
        .get();

      if (memberSnap.empty) {
        throw new HttpsError(
          "failed-precondition",
          "The selected user must be a member of the group.",
        );
      }

      // Get user names for the notification
      const [fromUserSnap, toUserSnap] = await Promise.all([
        db.collection("users").doc(fromUserId).get(),
        db.collection("users").doc(toUserId).get(),
      ]);

      const fromUserName =
        fromUserSnap.data()?.displayName || "Current Treasurer";
      const toUserName = toUserSnap.data()?.displayName || "New Treasurer";

      // Create the pending handoff
      const pendingHandoff = {
        fromUserId,
        fromUserName,
        toUserId,
        toUserName,
        initiatedAt: admin.firestore.FieldValue.serverTimestamp(),
        message: message || null,
      };

      await groupRef.update({
        pendingTreasurerHandoff: pendingHandoff,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Send notification to the target user
      const toUserData = toUserSnap.data();
      if (
        toUserData?.fcmTokens &&
        Array.isArray(toUserData.fcmTokens) &&
        toUserData.fcmTokens.length > 0
      ) {
        const groupName = groupData?.name || "your group";

        try {
          await messaging.sendEachForMulticast({
            tokens: toUserData.fcmTokens,
            notification: {
              title: "Treasurer Role Transfer",
              body: `${fromUserName} wants to transfer the treasurer role to you in ${groupName}.`,
            },
            data: {
              type: "treasurer_handoff",
              groupId: groupId,
              action: "pending",
            },
          });
        } catch (notifyError) {
          logger.warn("Failed to send handoff notification:", notifyError);
        }
      }

      logger.info(
        `Treasurer handoff initiated successfully for group ${groupId}`,
      );

      return {
        success: true,
        pendingHandoff: {
          fromUserId,
          fromUserName,
          toUserId,
          toUserName,
          message: message || null,
        },
      };
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }
      logger.error("Error initiating treasurer handoff:", error);
      throw new HttpsError("internal", "Failed to initiate treasurer handoff.");
    }
  },
);
