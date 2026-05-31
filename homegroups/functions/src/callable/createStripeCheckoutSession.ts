import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { db } from "../utils/firebase";
import {
  stripe,
  productIdGroup,
  getDefaultPriceForProduct,
  assertGroupPriceIsAnnual,
} from "../utils/stripe";
import * as admin from "firebase-admin"; // For FieldValue

// Hardcoded redirect URLs — never accept these from the client to prevent open redirect attacks.
const SUCCESS_URL =
  "https://homegroups-app.com/subscription/success?session_id={CHECKOUT_SESSION_ID}";
const CANCEL_URL = "https://homegroups-app.com/subscription/cancel";

interface CreateCheckoutData {
  groupId: string;
}

export const createStripeCheckoutSession = onCall(
  {
    cpu: 0.5,
    memory: "512MiB",
    timeoutSeconds: 120,
    region: "us-central1",
  },
  async (request: CallableRequest<CreateCheckoutData>) => {
    const { groupId } = request.data;
    const userId = request.auth?.uid;

    if (!userId) {
      throw new HttpsError("unauthenticated", "User must be logged in.");
    }
    if (!groupId) {
      throw new HttpsError("invalid-argument", "Missing required parameters.");
    }
    if (!productIdGroup) {
      throw new HttpsError(
        "failed-precondition",
        "Stripe product ID for groups is not configured.",
      );
    }

    try {
      const groupRef = db.collection("groups").doc(groupId);
      const groupSnap = await groupRef.get();

      if (!groupSnap.exists) {
        throw new HttpsError("not-found", "Group not found.");
      }
      const groupData = groupSnap.data()!;

      const admins = groupData.admins || groupData.adminUids || [];
      if (!admins.includes(userId)) {
        throw new HttpsError(
          "permission-denied",
          "Only group admins can manage subscriptions.",
        );
      }

      let customerId = groupData.stripeCustomerId;
      if (!customerId) {
        logger.info(`Creating Stripe customer for group ${groupId}`);
        const customer = await stripe.customers.create({
          name: groupData.name,
          email: request.auth?.token.email,
          metadata: { groupId: groupId },
        });
        customerId = customer.id;
        await groupRef.update({ stripeCustomerId: customerId });
        logger.info(
          `Stripe customer ${customerId} created for group ${groupId}`,
        );
      } else {
        logger.info(
          `Using existing Stripe customer ${customerId} for group ${groupId}`,
        );
      }

      // Fetch the correct group subscription price from the product definition.
      const groupPriceId = await getDefaultPriceForProduct(productIdGroup);
      logger.info(
        `Using group price ${groupPriceId} from product ${productIdGroup}`,
      );
      const groupPrice = await stripe.prices.retrieve(groupPriceId);
      assertGroupPriceIsAnnual(groupPrice);

      logger.info(
        `Creating Checkout session for customer ${customerId}, group ${groupId} (flat rate)`,
      );
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        customer: customerId,
        line_items: [
          {
            price: groupPriceId,
            quantity: 1, // Flat rate subscription (no per-member pricing)
          },
        ],
        mode: "subscription",
        allow_promotion_codes: true,
        success_url: SUCCESS_URL,
        cancel_url: CANCEL_URL,
        metadata: {
          groupId: groupId,
          userId: userId,
        },
        subscription_data: {
          metadata: {
            groupId: groupId,
          },
        },
      });

      logger.info(
        `Checkout session ${session.id} created for group ${groupId}`,
      );
      return { sessionId: session.id };
    } catch (error: any) {
      if (error instanceof HttpsError) {
        throw error;
      }
      logger.error(
        `Error creating checkout session for group ${groupId}:`,
        error,
      );
      throw new HttpsError("internal", "Failed to create checkout session.");
    }
  },
);
