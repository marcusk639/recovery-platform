import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { db } from "../utils/firebase";
import * as admin from "firebase-admin";
import { assertGroupActive } from "../utils/subscriptionGuard";

interface BanUserData {
  userId: string;
  userName: string;
  groupId?: string;
  reason: string;
  durationDays?: number;
  reportId?: string;
}

interface BanUserResult {
  success: boolean;
  banId: string;
  message: string;
}

/**
 * Cloud function to ban a user from a group or the entire platform
 * Only group admins (for group bans) or super admins (for platform bans) can call this
 */
export const banUser = onCall(
  async (request: CallableRequest<BanUserData>): Promise<BanUserResult> => {
    const data = request.data;
    const context = request.auth;

    // Verify caller is authenticated
    if (!context) {
      throw new HttpsError(
        "unauthenticated",
        "User must be authenticated to ban users.",
      );
    }

    const callerId = context.uid;

    // Validate required fields
    if (!data.userId || !data.userName || !data.reason) {
      throw new HttpsError(
        "invalid-argument",
        "Missing required fields: userId, userName, and reason are required.",
      );
    }

    // Prevent self-ban
    if (data.userId === callerId) {
      throw new HttpsError("invalid-argument", "Users cannot ban themselves.");
    }

    try {
      // Check if caller has permission to ban
      let hasPermission = false;
      let callerName = "Admin";

      if (data.groupId) {
        // Group-specific ban - check if caller is group admin
        const groupDoc = await db.collection("groups").doc(data.groupId).get();

        if (!groupDoc.exists) {
          throw new HttpsError("not-found", "Group not found.");
        }

        const groupData = groupDoc.data()!;
        const admins = groupData?.admins || [];
        hasPermission = admins.includes(callerId);

        if (!hasPermission) {
          throw new HttpsError(
            "permission-denied",
            "Only group admins can ban users from the group.",
          );
        }

        assertGroupActive(groupData);
      } else {
        // Platform-wide ban - check if caller is super admin (via JWT claim)
        hasPermission = request.auth?.token?.superAdmin === true;

        if (!hasPermission) {
          throw new HttpsError(
            "permission-denied",
            "Only super admins can issue platform-wide bans.",
          );
        }
      }

      // Get caller's name
      const callerDoc = await db.collection("users").doc(callerId).get();
      if (callerDoc.exists) {
        callerName = callerDoc.data()?.displayName || "Admin";
      }

      // Calculate expiry date
      let expiresAt: admin.firestore.Timestamp | null = null;
      if (data.durationDays) {
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + data.durationDays);
        expiresAt = admin.firestore.Timestamp.fromDate(expiryDate);
      }

      // Look up the target user's name server-side to prevent caller-supplied name injection
      const targetUserDoc = await db.collection("users").doc(data.userId).get();
      const resolvedUserName =
        targetUserDoc.data()?.displayName || data.userName || "Unknown User";

      // Create the ban record
      const banRef = db.collection("user_bans").doc();
      const banData = {
        id: banRef.id,
        userId: data.userId,
        userName: resolvedUserName,
        groupId: data.groupId || null,
        bannedBy: callerId,
        bannedByName: callerName,
        reason: data.reason,
        reportId: data.reportId || null,
        bannedAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt,
        isActive: true,
      };

      await banRef.set(banData);

      logger.info(`User ${data.userId} banned by ${callerId}`, {
        banId: banRef.id,
        groupId: data.groupId || "platform-wide",
        durationDays: data.durationDays || "permanent",
      });

      // If this is a group ban, remove user from the group
      if (data.groupId) {
        try {
          // Remove from members collection (uses ${groupId}_${userId} doc ID format)
          const memberDocId = `${data.groupId}_${data.userId}`;
          const memberRef = db.collection("members").doc(memberDocId);
          const memberDoc = await memberRef.get();

          if (memberDoc.exists) {
            await memberRef.delete();
          }

          // Update group member count
          const groupRef = db.collection("groups").doc(data.groupId);
          await groupRef.update({
            memberCount: admin.firestore.FieldValue.increment(-1),
          });

          // Remove group from user's homeGroups
          const userRef = db.collection("users").doc(data.userId);
          await userRef.update({
            homeGroups: admin.firestore.FieldValue.arrayRemove(data.groupId),
          });

          logger.info(
            `Removed banned user ${data.userId} from group ${data.groupId}`,
          );
        } catch (removeError) {
          logger.warn(
            `Failed to remove banned user from group: ${removeError}`,
          );
          // Continue even if removal fails - the ban is still in place
        }
      }

      return {
        success: true,
        banId: banRef.id,
        message: `User ${resolvedUserName} has been banned${
          data.groupId ? " from the group" : " from the platform"
        }${
          data.durationDays ? ` for ${data.durationDays} days` : " permanently"
        }.`,
      };
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }

      logger.error("Error banning user:", error);

      throw new HttpsError(
        "internal",
        "An error occurred while banning the user.",
      );
    }
  },
);
