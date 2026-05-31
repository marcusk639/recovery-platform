import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { db } from "../utils/firebase";
import { stripe } from "../utils/stripe";

interface SetupPaymentMethodData {
  groupId: string;
}

export const setupSubscriptionPaymentMethod = onCall(
  async (request: CallableRequest<SetupPaymentMethodData>) => {
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

      if (!admins.includes(userId)) {
        throw new HttpsError(
          "permission-denied",
          "Only group admins can set up payment methods.",
        );
      }

      const subscriptionId = groupData.stripeSubscriptionId;
      if (!subscriptionId) {
        throw new HttpsError(
          "failed-precondition",
          "Group does not have a subscription.",
        );
      }

      // Get the subscription from Stripe
      const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ["latest_invoice.payment_intent"],
      });

      // Check if subscription is in a state that needs payment method
      if (subscription.status === "active") {
        throw new HttpsError(
          "failed-precondition",
          "Subscription is already active and does not need payment method setup.",
        );
      }

      if (subscription.status === "trialing") {
        // Create a setup intent for future payments
        const setupIntent = await stripe.setupIntents.create({
          customer: groupData.stripeCustomerId,
          usage: "off_session", // For future payments
          metadata: {
            groupId: groupId,
            subscriptionId: subscriptionId,
          },
        });

        return {
          success: true,
          setupIntentId: setupIntent.id,
          clientSecret: setupIntent.client_secret,
          subscriptionStatus: subscription.status,
          trialEnd: subscription.trial_end,
          message: "Payment method setup required before trial ends.",
        };
      }

      if (
        subscription.status === "incomplete" ||
        subscription.status === "past_due"
      ) {
        // Get the latest invoice and its payment intent
        const latestInvoice = subscription.latest_invoice as any;
        if (latestInvoice && latestInvoice.payment_intent) {
          const paymentIntent = latestInvoice.payment_intent;

          return {
            success: true,
            paymentIntentId: paymentIntent.id,
            clientSecret: paymentIntent.client_secret,
            subscriptionStatus: subscription.status,
            message: "Payment method required to activate subscription.",
          };
        }
      }

      throw new HttpsError(
        "failed-precondition",
        `Subscription status '${subscription.status}' does not require payment method setup.`,
      );
    } catch (error: any) {
      if (error instanceof HttpsError) {
        throw error;
      }

      logger.error(
        `Error setting up payment method for group ${groupId}:`,
        error,
      );

      throw new HttpsError("internal", "Failed to set up payment method.");
    }
  },
);
