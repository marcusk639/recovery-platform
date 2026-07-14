import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { db, messaging } from "../utils/firebase";
import * as admin from "firebase-admin";
import { requireAuth } from "../utils/callableWrapper";

interface CompleteTreasurerHandoffData {
  groupId: string;
}

/**
 * Cloud function to complete a treasurer handoff.
 * Only the target user of the pending handoff can complete it.
 */
export const completeTreasurerHandoff = onCall(
  async (request: CallableRequest<CompleteTreasurerHandoffData>) => {
    const data = request.data;
    const currentUserId = requireAuth(request);

    // Validate input
    if (!data || !data.groupId) {
      throw new HttpsError("invalid-argument", "Missing required groupId.");
    }

    const { groupId } = data;

    logger.info(
      `Completing treasurer handoff for group ${groupId} by user ${currentUserId}`,
    );

    try {
      const groupRef = db.collection("groups").doc(groupId);

      // Use a transaction to ensure atomic updates
      const result = await db.runTransaction(async (transaction) => {
        const groupSnap = await transaction.get(groupRef);

        if (!groupSnap.exists) {
          throw new HttpsError("not-found", "Group not found.");
        }

        const groupData = groupSnap.data();
        const pendingHandoff = groupData?.pendingTreasurerHandoff;

        // Verify there's a pending handoff
        if (!pendingHandoff) {
          throw new HttpsError(
            "failed-precondition",
            "No pending treasurer handoff found.",
          );
        }

        // Verify the current user is the target of the handoff
        if (pendingHandoff.toUserId !== currentUserId) {
          throw new HttpsError(
            "permission-denied",
            "Only the designated new treasurer can accept the handoff.",
          );
        }

        const { fromUserId, toUserId, fromUserName, toUserName } =
          pendingHandoff;
        let treasurers = groupData?.treasurers || [];

        // Remove old treasurer
        treasurers = treasurers.filter((id: string) => id !== fromUserId);

        // Add new treasurer (if not already in array)
        if (!treasurers.includes(toUserId)) {
          treasurers.push(toUserId);
        }

        // Update the group
        transaction.update(groupRef, {
          treasurers,
          pendingTreasurerHandoff: admin.firestore.FieldValue.delete(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Create audit log entry
        const auditRef = db
          .collection("groups")
          .doc(groupId)
          .collection("auditLog")
          .doc();

        transaction.set(auditRef, {
          type: "treasurer_handoff_completed",
          fromUserId,
          fromUserName,
          toUserId,
          toUserName,
          performedBy: currentUserId,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });

        return {
          fromUserId,
          fromUserName,
          toUserId,
          toUserName,
          groupName: groupData?.name || "the group",
        };
      });

      // Send notification to the old treasurer
      const fromUserSnap = await db
        .collection("users")
        .doc(result.fromUserId)
        .get();
      const fromUserData = fromUserSnap.data();

      if (
        fromUserData?.fcmTokens &&
        Array.isArray(fromUserData.fcmTokens) &&
        fromUserData.fcmTokens.length > 0
      ) {
        try {
          await messaging.sendEachForMulticast({
            tokens: fromUserData.fcmTokens,
            notification: {
              title: "Treasurer Role Transferred",
              body: `${result.toUserName} has accepted the treasurer role for ${result.groupName}.`,
            },
            data: {
              type: "treasurer_handoff",
              groupId: groupId,
              action: "completed",
            },
          });
        } catch (notifyError) {
          logger.warn(
            "Failed to send handoff completion notification:",
            notifyError,
          );
        }
      }

      logger.info(
        `Treasurer handoff completed successfully for group ${groupId}: ${result.fromUserId} -> ${result.toUserId}`,
      );

      return {
        success: true,
        message: "Treasurer role has been transferred successfully.",
        newTreasurerId: result.toUserId,
        newTreasurerName: result.toUserName,
      };
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }
      logger.error("Error completing treasurer handoff:", error);
      throw new HttpsError("internal", "Failed to complete treasurer handoff.");
    }
  },
);
