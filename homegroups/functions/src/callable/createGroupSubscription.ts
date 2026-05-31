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
  TRIAL_PERIOD_DAYS,
} from "../utils/stripe";
import { getMultiGroupPriceId } from "./getMultiGroupPricing";
import * as admin from "firebase-admin";

const MAX_TRIALS_PER_YEAR = 2;
const TWELVE_MONTHS_MS = 365 * 24 * 60 * 60 * 1000;

export async function checkAndRecordTrial(userId: string): Promise<void> {
  const firestoreDb = admin.firestore();
  const ref = firestoreDb.collection("userTrialHistory").doc(userId);
  const now = Date.now();
  const cutoff = now - TWELVE_MONTHS_MS;

  await firestoreDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const recentTrials: number[] = snap.exists
      ? (snap.data()?.trials ?? []).filter((t: number) => t > cutoff)
      : [];

    if (recentTrials.length >= MAX_TRIALS_PER_YEAR) {
      throw new HttpsError(
        "resource-exhausted",
        "Maximum of 2 free trials per year reached. Please subscribe to continue.",
      );
    }

    // Write only the pruned recent window + new timestamp to keep the array bounded
    tx.set(ref, { trials: [...recentTrials, now] }, { merge: false });
  });
  // Log after the transaction commits — logging inside the callback fires on each retry
  logger.info(`Trial recorded for user ${userId}. Recent trials recorded.`);
}

interface CreateSubscriptionData {
  groupId: string;
  /**
   * When true, uses the discounted price for additional groups ($8/year).
   * Falls back to the full price if STRIPE_PRICE_ID_GROUP_ADDITIONAL is not
   * configured. Defaults to false (backward-compatible with existing callers).
   */
  isAdditionalGroup?: boolean;
}

export const createGroupSubscription = onCall(
  {
    cpu: 0.5,
    memory: "512MiB",
    timeoutSeconds: 120,
    region: "us-central1",
  },
  async (request: CallableRequest<CreateSubscriptionData>) => {
    const { groupId, isAdditionalGroup = false } = request.data;
    const userId = request.auth?.uid;

    if (!userId) {
      throw new HttpsError("unauthenticated", "User must be logged in.");
    }
    if (!groupId) {
      throw new HttpsError("invalid-argument", "Group ID is required.");
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
      const admins = groupData.admins || [];

      if (!admins.includes(userId)) {
        throw new HttpsError(
          "permission-denied",
          "Only group admins can create subscriptions.",
        );
      }

      // Check if group already has an active subscription
      if (
        groupData.stripeSubscriptionId &&
        groupData.subscriptionStatus === "active"
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Group already has an active subscription.",
        );
      }

      // Create or get Stripe customer
      let customerId = groupData.stripeCustomerId;
      if (!customerId) {
        logger.info(`Creating Stripe customer for group ${groupId}`);
        const customer = await stripe.customers.create(
          {
            name: groupData.name,
            email: request.auth?.token.email,
            metadata: { groupId: groupId },
          },
          { idempotencyKey: `grp-sub-${groupId}-${userId}-customer` },
        );
        customerId = customer.id;
        // Persist customerId immediately so a downstream failure + retry
        // does not orphan another Stripe customer on the next attempt.
        await groupRef.update({ stripeCustomerId: customerId });
      }

      // Determine which price to use.
      // If isAdditionalGroup is true and the multi-group price is configured,
      // use the discounted price; otherwise fall back to the default product price.
      const multiGroupPriceId = getMultiGroupPriceId();
      const useDiscountedPrice = isAdditionalGroup && !!multiGroupPriceId;
      let groupPriceId: string;
      if (useDiscountedPrice && multiGroupPriceId) {
        groupPriceId = multiGroupPriceId;
        logger.info(
          `Using discounted additional-group price ${groupPriceId} for group ${groupId}`,
        );
      } else {
        groupPriceId = await getDefaultPriceForProduct(productIdGroup);
        logger.info(
          `Using full group price ${groupPriceId} from product ${productIdGroup}`,
        );
      }

      const groupPrice = await stripe.prices.retrieve(groupPriceId);
      assertGroupPriceIsAnnual(groupPrice);

      // Create subscription with trial period (flat rate - quantity is always 1)
      const subscription = await stripe.subscriptions.create(
        {
          customer: customerId,
          items: [
            {
              price: groupPriceId,
              quantity: 1, // Flat rate subscription (no per-member pricing)
            },
          ],
          metadata: {
            groupId: groupId,
            createdBy: userId,
          },
          // Set trial period for new subscriptions
          trial_period_days: TRIAL_PERIOD_DAYS,
          // Don't require payment method immediately
          payment_behavior: "default_incomplete",
          // Allow subscription to be created without payment method
          expand: ["latest_invoice.payment_intent"],
        },
        { idempotencyKey: `grp-sub-${groupId}-${userId}-subscription` },
      );

      // Enforce trial rate limit AFTER successful subscription create so a
      // failed create does not consume a trial. If recording fails after the
      // subscription exists (e.g. quota), log and continue — refusing to record
      // is a softer failure mode than throwing once the subscription is live.
      try {
        await checkAndRecordTrial(userId);
      } catch (trialErr) {
        logger.error(
          `Failed to record trial for user ${userId} after subscription ${subscription.id} created:`,
          trialErr,
        );
      }

      // Update group with subscription info
      await groupRef.update({
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
        subscriptionStatus: subscription.status,
        stripePriceIdGroup: groupPriceId,
        stripeProductIdGroup: productIdGroup,
        stripeSubscriptionItemId: subscription.items.data[0]?.id,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      logger.info(
        `Successfully created subscription ${subscription.id} for group ${groupId} (flat rate)`,
      );

      return {
        success: true,
        subscriptionId: subscription.id,
        customerId: customerId,
        // $8/year for additional groups (when discounted price configured), $12/year otherwise
        annualCost: useDiscountedPrice ? 8 : 12,
        status: subscription.status,
        trialEnd: subscription.trial_end,
      };
    } catch (error: any) {
      if (error instanceof HttpsError) {
        throw error;
      }

      logger.error(`Error creating subscription for group ${groupId}:`, error);

      throw new HttpsError("internal", "Failed to create subscription.");
    }
  },
);
