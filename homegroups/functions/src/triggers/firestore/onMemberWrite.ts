import * as functions from "firebase-functions";
import * as functionsV1 from "firebase-functions/v1";
import { db, auth } from "../../utils/firebase";

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

/**
 * Rebuilds custom claims for a user based on all their member documents
 * This ensures claims are always in sync with actual membership data
 */
async function rebuildUserClaims(userId: string): Promise<void> {
  functions.logger.info(`Rebuilding custom claims for user ${userId}`);

  try {
    // Get all member documents for this user
    const membersSnapshot = await db
      .collection("members")
      .where("userId", "==", userId)
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
    const user = await auth.getUser(userId);
    const existingClaims = user.customClaims || {};

    // Merge with existing claims (preserve superAdmin)
    const newClaims: CustomClaims = {
      ...claims,
      superAdmin: existingClaims.superAdmin || false,
    };

    // Check claims size (1000 byte limit)
    const claimsJson = JSON.stringify(newClaims);
    if (claimsJson.length > 800) {
      functions.logger.warn(
        `User ${userId} claims approaching limit: ${claimsJson.length} bytes`
      );
    }

    if (claimsJson.length > 1000) {
      // If claims exceed limit, prioritize admin/treasurer groups and truncate memberGroups
      functions.logger.error(
        `User ${userId} claims exceed 1000 byte limit. Truncating memberGroups.`
      );
      // Keep only unique admin and treasurer groups, limit memberGroups
      const prioritizedClaims: CustomClaims = {
        superAdmin: newClaims.superAdmin,
        adminGroups: newClaims.adminGroups,
        treasurerGroups: newClaims.treasurerGroups,
        memberGroups: [], // Will be checked via document read in rules
      };
      await auth.setCustomUserClaims(userId, prioritizedClaims);
      functions.logger.info(
        `Set truncated claims for user ${userId}: ${JSON.stringify(prioritizedClaims)}`
      );
      return;
    }

    // Set the claims
    await auth.setCustomUserClaims(userId, newClaims);

    functions.logger.info(
      `Successfully set claims for user ${userId}: memberGroups=${claims.memberGroups.length}, adminGroups=${claims.adminGroups.length}, treasurerGroups=${claims.treasurerGroups.length}`
    );
  } catch (error) {
    functions.logger.error(`Error rebuilding claims for user ${userId}:`, error);
    throw error;
  }
}

/**
 * Cloud Function triggered when a member document is created, updated, or deleted
 * Syncs custom claims for the affected user
 */
export const onMemberWrite = functionsV1.firestore
  .document("members/{memberId}")
  .onWrite(async (change, context) => {
    const { memberId } = context.params;

    // Determine the userId from the document data or ID
    let userId: string | null = null;

    if (change.after.exists) {
      // Document was created or updated
      const afterData = change.after.data() as MemberData;
      userId = afterData.userId;
    } else if (change.before.exists) {
      // Document was deleted
      const beforeData = change.before.data() as MemberData;
      userId = beforeData.userId;
    }

    // Fallback: extract userId from document ID (format: {groupId}_{userId})
    if (!userId) {
      const parts = memberId.split("_");
      if (parts.length >= 2) {
        // Join all parts after the first one in case userId contains underscores
        userId = parts.slice(1).join("_");
      }
    }

    if (!userId) {
      functions.logger.error(
        `Could not determine userId from member document ${memberId}`
      );
      return null;
    }

    // Check if relevant fields changed (optimization)
    if (change.before.exists && change.after.exists) {
      const before = change.before.data() as MemberData;
      const after = change.after.data() as MemberData;

      // Only rebuild claims if role-related fields changed
      const roleChanged =
        before.isAdmin !== after.isAdmin ||
        before.isTreasurer !== after.isTreasurer ||
        JSON.stringify(before.roles || []) !== JSON.stringify(after.roles || []);

      if (!roleChanged) {
        functions.logger.debug(
          `No role changes detected for member ${memberId}. Skipping claims rebuild.`
        );
        return null;
      }
    }

    // Rebuild claims for this user
    await rebuildUserClaims(userId);

    return null;
  });

/**
 * Export the rebuildUserClaims function for use by other functions
 */
export { rebuildUserClaims };

