import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { auth } from "../utils/firebase";

/**
 * Creates a custom auth token for the authenticated user.
 * This allows the web app to authenticate as the mobile app user
 * for handling payments outside of Apple's IAP system.
 */
export const createWebAuthToken = onCall(
  async (request: CallableRequest<void>) => {
    const userId = request.auth?.uid;

    if (!userId) {
      throw new HttpsError(
        "unauthenticated",
        "User must be logged in to create an auth token.",
      );
    }

    try {
      // Create a custom token that expires in 1 hour
      // The token itself doesn't have an expiry, but we can add custom claims
      const customToken = await auth.createCustomToken(userId, {
        // Add a timestamp to track when token was created
        createdAt: Date.now(),
        // Mark this as a web auth token for audit purposes
        tokenType: "web_auth",
      });

      logger.info(`Created web auth token for user ${userId}`);

      return {
        success: true,
        token: customToken,
        expiresIn: 3600, // Token is valid for 1 hour (Firebase default)
      };
    } catch (error: any) {
      if (error instanceof HttpsError) {
        throw error;
      }
      logger.error(`Error creating web auth token for user ${userId}:`, error);
      throw new HttpsError("internal", "Failed to create authentication token.");
    }
  },
);
