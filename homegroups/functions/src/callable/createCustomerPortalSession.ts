import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { db } from "../utils/firebase";
import { stripe } from "../utils/stripe";
import { APP_BASE_URL } from "../utils/appConfig";

interface CreatePortalSessionData {
  groupId: string;
}

/**
 * Creates a Stripe Customer Portal session for group admins to manage their subscription.
 * Allows viewing invoices, updating payment method, cancelling subscription, etc.
 */
export const createCustomerPortalSession = onCall(
  {
    cpu: 0.5,
    memory: "256MiB",
    timeoutSeconds: 30,
    region: "us-central1",
  },
  async (request: CallableRequest<CreatePortalSessionData>) => {
    const { groupId } = request.data;
    const userId = request.auth?.uid;

    if (!userId) {
      throw new HttpsError("unauthenticated", "User must be logged in.");
    }
    if (!groupId) {
      throw new HttpsError("invalid-argument", "Group ID is required.");
    }

    try {
      const groupRef = db.collection("groups").doc(groupId);
      const groupSnap = await groupRef.get();

      if (!groupSnap.exists) {
        throw new HttpsError("not-found", "Group not found.");
      }

      const groupData = groupSnap.data()!;
      const admins = groupData.admins || [];

      // Verify user is an admin of the group
      if (!admins.includes(userId)) {
        throw new HttpsError(
          "permission-denied",
          "Only group admins can access billing management.",
        );
      }

      const customerId = groupData.stripeCustomerId;
      if (!customerId) {
        throw new HttpsError(
          "failed-precondition",
          "This group does not have a billing account set up.",
        );
      }

      // Create a Customer Portal session
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${APP_BASE_URL}/billing?groupId=${groupId}`,
      });

      logger.info(
        `Created Customer Portal session for group ${groupId}, customer ${customerId}`,
      );

      return {
        success: true,
        url: portalSession.url,
      };
    } catch (error: any) {
      if (error instanceof HttpsError) {
        throw error;
      }

      logger.error(
        `Error creating Customer Portal session for group ${groupId}:`,
        error,
      );

      throw new HttpsError("internal", "Failed to create billing portal session.");
    }
  },
);
