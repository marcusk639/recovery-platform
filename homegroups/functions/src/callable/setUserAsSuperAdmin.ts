import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { db, auth } from "../utils/firebase";
import * as admin from "firebase-admin";

// Define the expected data type for the request
interface SetAdminData {
  userIdToPromote: string;
  remove?: boolean; // If true, removes superAdmin status
}

export const setUserAsSuperAdmin = onCall(
  async (request: CallableRequest<SetAdminData>) => {
    // Use request.auth for v2 callable functions signature
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Unauthorized");
    }

    // Verify the caller has permission
    const callerUid = request.auth.uid;
    const callerSnapshot = await auth.getUser(callerUid);
    const callerCustomClaims = callerSnapshot.customClaims || {};

    if (!callerCustomClaims.superAdmin) {
      throw new HttpsError(
        "permission-denied",
        "Only super admins can manage other super admins",
      );
    }

    // Get the user ID to promote from request.data
    const { userIdToPromote, remove } = request.data;
    if (!userIdToPromote) {
      throw new HttpsError(
        "invalid-argument",
        "User ID to promote is required in data",
      );
    }

    // Prevent self-demotion
    if (remove && userIdToPromote === callerUid) {
      throw new HttpsError(
        "invalid-argument",
        "Cannot remove your own superAdmin status",
      );
    }

    try {
      // Get existing claims to preserve them
      const targetUser = await auth.getUser(userIdToPromote);
      const existingClaims = targetUser.customClaims || {};

      // Update only the superAdmin claim, preserving all others
      const newClaims = {
        ...existingClaims,
        superAdmin: !remove, // true to add, false to remove
      };

      // Set custom user claims (preserving existing claims)
      await auth.setCustomUserClaims(userIdToPromote, newClaims);

      // Update Firestore document
      await db
        .collection("users")
        .doc(userIdToPromote)
        .update({
          role: remove ? "user" : "superAdmin",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

      // Force token refresh
      await auth.revokeRefreshTokens(userIdToPromote);

      const action = remove ? "demoted from" : "promoted to";
      return {
        success: true,
        message: `User ${userIdToPromote} ${action} super admin`,
      };
    } catch (error: any) {
      if (error instanceof HttpsError) {
        throw error;
      }
      logger.error(
        `Error updating superAdmin for user ${userIdToPromote}:`,
        error,
      );
      throw new HttpsError("internal", "Failed to update user");
    }
  },
);
