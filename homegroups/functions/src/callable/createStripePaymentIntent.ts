import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { db } from "../utils/firebase";
import { stripe, PLATFORM_FEE_PERCENT } from "../utils/stripe";
import * as admin from "firebase-admin";
import { Donation } from "../entities/Group";
import { requireAuth } from "../utils/callableWrapper";

interface PaymentIntentData {
  groupId: string;
  amount: number; // Expect amount in cents
}

/**
 * Creates a Stripe Payment Intent for a donation to a specific group.
 */
const MAX_DONATION_CENTS = 100_000; // $1,000

export const createStripePaymentIntent = onCall(
  async (request: CallableRequest<PaymentIntentData>) => {
    const { groupId, amount } = request.data;

    if (!stripe) {
      throw new HttpsError(
        "internal",
        "Stripe configuration missing on the server.",
      );
    }
    const userId = requireAuth(request);
    const userEmail = request.auth?.token.email;
    if (
      !groupId ||
      typeof amount !== "number" ||
      amount < 50 ||
      amount > MAX_DONATION_CENTS
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Amount must be between $0.50 and $1,000.",
      );
    }

    try {
      const groupDoc = await db.collection("groups").doc(groupId).get();
      if (!groupDoc.exists) {
        throw new HttpsError("not-found", "Group not found.");
      }
      const groupName = groupDoc.data()?.name || "Homegroups Group";

      // Get or create Stripe Customer ID for the donating user
      const userDoc = await db.collection("users").doc(userId).get();
      let customerId = userDoc.data()?.stripeCustomerId;
      if (!customerId) {
        logger.info(`Creating Stripe customer for user ${userId}`);
        const customer = await stripe.customers.create({
          email: userEmail,
          name: userDoc.data()?.displayName || undefined,
          metadata: { firebaseUID: userId },
        });
        customerId = customer.id;
        await db.collection("users").doc(userId).update({
          stripeCustomerId: customerId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        logger.info(`Stripe customer ${customerId} created for user ${userId}`);
      }
      // Check if group has a connected account
      const groupData = groupDoc.data();
      const stripeConnectAccountId = groupData?.stripeConnectAccountId;

      // Create PaymentIntent
      const paymentIntentParams: any = {
        amount: amount, // Amount in cents
        currency: "usd",
        customer: customerId,
        automatic_payment_methods: { enabled: true },
        metadata: {
          groupId: groupId,
          userId: userId,
          groupName: groupName,
          type: "group_donation", // Identify this payment's purpose
        },
        description: `7th Tradition / Donation to ${groupName} (ID: ${groupId})`,
        // receipt_email: userEmail, // Optionally send Stripe receipt
      };

      // If group has a connected account, use transfer_data to route funds
      // This keeps the PaymentIntent on the platform so webhooks are received reliably
      if (stripeConnectAccountId) {
        paymentIntentParams.transfer_data = {
          destination: stripeConnectAccountId,
        };
        paymentIntentParams.application_fee_amount = Math.round(
          amount * PLATFORM_FEE_PERCENT,
        );
        logger.info(
          `Creating payment intent with transfer to connected account ${stripeConnectAccountId}`,
        );
      } else {
        logger.info(
          `Creating payment intent for platform account (no connected account)`,
        );
      }

      // Pre-generate the donation document ID so we can use it as the
      // idempotency key for Stripe — client SDKs may retry callable
      // invocations on transient network failure, and without this the
      // donor could be charged twice for the same donation.
      const donationRef = db
        .collection("groups")
        .doc(groupId)
        .collection("donations")
        .doc();

      const paymentIntent = await stripe.paymentIntents.create(
        paymentIntentParams,
        { idempotencyKey: donationRef.id },
      );

      logger.info(
        `Created PaymentIntent ${paymentIntent.id} for group ${groupId}`,
      );

      const donation: Donation = {
        userId: userId,
        amount: amount,
        createdAt: new Date(),
        paymentMethod: "stripe",
        transactionId: paymentIntent.id,
        status: "pending",
      };

      await donationRef.set(donation);

      // Return only the client secret to the frontend
      return {
        clientSecret: paymentIntent.client_secret,
        donationId: donationRef.id,
      };
    } catch (error: any) {
      if (error instanceof HttpsError) {
        throw error;
      }
      logger.error("Error creating Stripe PaymentIntent:", error);
      throw new HttpsError("internal", "Failed to initiate payment.");
    }
  },
);
