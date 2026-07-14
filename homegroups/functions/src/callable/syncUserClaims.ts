import * as functions from "firebase-functions";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { db, auth } from "../utils/firebase";
import { requireAuth } from "../utils/callableWrapper";

interface MemberData {
  userId: string;
  groupId: string;
  isAdmin: boolean;
  isTreasurer: boolean;
  roles?: string[];
}

interface CustomClaims {
  superAdmin?: boolean;
  memberGroups: string[];
  adminGroups: string[];
  treasurerGroups: string[];
}

interface SyncClaimsRequest {
  targetUserId?: string; // Optional: for super admins to sync another user's claims
}

interface SyncClaimsResponse {
  success: boolean;
  claims: CustomClaims;
  message: string;
}

/**
 * Callable function to manually refresh/sync custom claims for a user
 * Can be called by a user to refresh their own claims, or by a super admin to refresh another user's claims
 */
export const syncUserClaims = onCall<SyncClaimsRequest>(
  { cors: true },
  async (request): Promise<SyncClaimsResponse> => {
    // Ensure user is authenticated
    const callerUid = requireAuth(request);
    const targetUserId = request.data?.targetUserId || callerUid;

    // If targeting a different user, caller must be a super admin
    if (targetUserId !== callerUid) {
      const callerToken = request.auth?.token;
      if (!callerToken?.superAdmin) {
        throw new HttpsError(
          "permission-denied",
          "Only super admins can sync claims for other users",
        );
      }
    }

    functions.logger.info(
      `Syncing claims for user ${targetUserId} (requested by ${callerUid})`,
    );

    try {
      // Get all member documents for this user
      const membersSnapshot = await db
        .collection("members")
        .where("userId", "==", targetUserId)
        .get();

      // Initialize claims structure
      const claims: CustomClaims = {
        memberGroups: [],
        adminGroups: [],
        treasurerGroups: [],
      };

      // Build claims from all memberships
      membersSnapshot.docs.forEach((doc) => {
        const data = doc.data() as MemberData;
        const groupId = data.groupId;

        if (groupId) {
          // Add to memberGroups
          claims.memberGroups.push(groupId);

          // Check admin status
          if (data.isAdmin === true || data.roles?.includes("admin")) {
            claims.adminGroups.push(groupId);
          }

          // Check treasurer status
          if (data.isTreasurer === true || data.roles?.includes("treasurer")) {
            claims.treasurerGroups.push(groupId);
          }
        }
      });

      // Get existing claims to preserve superAdmin status
      const user = await auth.getUser(targetUserId);
      const existingClaims = user.customClaims || {};

      // Merge with existing claims (preserve superAdmin)
      const newClaims: CustomClaims = {
        ...claims,
        superAdmin: existingClaims.superAdmin || false,
      };

      // Check claims size (1000 byte limit)
      const claimsJson = JSON.stringify(newClaims);
      if (claimsJson.length > 1000) {
        functions.logger.warn(
          `User ${targetUserId} claims exceed 1000 bytes. Truncating memberGroups.`,
        );
        // Prioritize admin/treasurer groups, truncate memberGroups
        newClaims.memberGroups = [];
      }

      // Set the claims
      await auth.setCustomUserClaims(targetUserId, newClaims);

      functions.logger.info(
        `Successfully synced claims for user ${targetUserId}: ` +
          `memberGroups=${claims.memberGroups.length}, ` +
          `adminGroups=${claims.adminGroups.length}, ` +
          `treasurerGroups=${claims.treasurerGroups.length}`,
      );

      return {
        success: true,
        claims: newClaims,
        message: `Claims synced successfully. Token refresh required to apply changes.`,
      };
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }
      functions.logger.error(
        `Error syncing claims for user ${targetUserId}:`,
        error,
      );
      throw new HttpsError("internal", "Failed to sync claims");
    }
  },
);
