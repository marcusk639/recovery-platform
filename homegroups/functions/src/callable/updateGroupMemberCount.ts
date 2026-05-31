import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { db } from "../utils/firebase";
// Note: Removed updateSubscriptionQuantity import - using flat rate pricing, member count doesn't affect subscription cost
import * as admin from "firebase-admin";

interface UpdateMemberCountData {
  groupId: string;
  newMemberCount: number;
}

export const updateGroupMemberCount = onCall(
  async (request: CallableRequest<UpdateMemberCountData>) => {
    const { groupId, newMemberCount } = request.data;
    const userId = request.auth?.uid;

    if (!userId) {
      throw new HttpsError("unauthenticated", "User must be logged in.");
    }
    if (!groupId || newMemberCount === undefined || newMemberCount < 0) {
      throw new HttpsError(
        "invalid-argument",
        "Invalid groupId or member count.",
      );
    }

    try {
      const groupRef = db.collection("groups").doc(groupId);
      const groupSnap = await groupRef.get();

      if (!groupSnap.exists) {
        throw new HttpsError("not-found", "Group not found.");
      }

      const groupData = groupSnap.data()!;
      const admins = groupData.admins || [];

      if (!admins.includes(userId)) {
        throw new HttpsError(
          "permission-denied",
          "Only group admins can update member count.",
        );
      }

      const currentMemberCount = groupData.memberCount || 0;

      if (currentMemberCount === newMemberCount) {
        return {
          success: true,
          message: "Member count unchanged",
          currentMemberCount,
          newMemberCount,
        };
      }

      // Update the member count in Firestore
      // Note: Subscription uses flat rate pricing, so member count changes don't affect cost
      await groupRef.update({
        memberCount: newMemberCount,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      logger.info(
        `Updated member count for group ${groupId} from ${currentMemberCount} to ${newMemberCount}`,
      );

      return {
        success: true,
        message: "Member count updated successfully",
        currentMemberCount,
        newMemberCount,
        // Note: Subscription cost is flat rate ($12/year), not per-member
      };
    } catch (error: any) {
      if (error instanceof HttpsError) {
        throw error;
      }

      logger.error(`Error updating member count for group ${groupId}:`, error);

      throw new HttpsError("internal", "Failed to update member count.");
    }
  },
);
