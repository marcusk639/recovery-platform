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
} from "../utils/stripe";
import * as admin from "firebase-admin";
import { requireAuth } from "../utils/callableWrapper";

interface ReactivateSubscriptionData {
  groupId: string;
  paymentMethodId?: string; // Optional: new payment method to use
}

/**
 * Reactivates a canceled subscription for a group.
 * If the subscription was canceled but not yet expired, it resumes.
 * If the subscription is fully canceled, it creates a new one.
 */
export const reactivateGroupSubscription = onCall(
  {
    cpu: 0.5,
    memory: "512MiB",
    timeoutSeconds: 60,
    region: "us-central1",
  },
  async (request: CallableRequest<ReactivateSubscriptionData>) => {
    const { groupId, paymentMethodId } = request.data;
    const userId = requireAuth(request);

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

      // Verify user is an admin
      if (!admins.includes(userId)) {
        throw new HttpsError(
          "permission-denied",
          "Only group admins can reactivate subscriptions.",
        );
      }

      let customerId = groupData.stripeCustomerId;
      const existingSubscriptionId = groupData.stripeSubscriptionId;
      const subscriptionStatus = groupData.subscriptionStatus;

      // Check if existing customer is still valid (not deleted in Stripe)
      if (customerId) {
        const customer = await stripe.customers.retrieve(customerId);
        if (customer.deleted) {
          // Customer was deleted in Stripe — clear stale ID so we recreate
          logger.warn(
            `Stripe customer ${customerId} for group ${groupId} is deleted; clearing stale ID`,
          );
          await groupRef.update({
            stripeCustomerId: admin.firestore.FieldValue.delete(),
          });
          customerId = undefined;
        } else if (
          !paymentMethodId &&
          !(customer as any).invoice_settings?.default_payment_method
        ) {
          throw new HttpsError(
            "failed-precondition",
            "No payment method on file. Please add a payment method in the billing portal first.",
          );
        }
      }

      // If no customer exists, we need a payment method to create one
      if (!customerId && !paymentMethodId) {
        throw new HttpsError(
          "failed-precondition",
          "A payment method is required to create a new subscription.",
        );
      }

      let finalCustomerId = customerId;
      let newSubscription;

      // If there's an existing subscription that's just set to cancel at period end,
      // we can resume it instead of creating a new one
      if (existingSubscriptionId && subscriptionStatus !== "canceled") {
        try {
          const existingSub = await stripe.subscriptions.retrieve(
            existingSubscriptionId,
          );

          if (
            existingSub.cancel_at_period_end &&
            (existingSub.status === "active" ||
              existingSub.status === "trialing")
          ) {
            // Resume the subscription by removing cancel_at_period_end
            newSubscription = await stripe.subscriptions.update(
              existingSubscriptionId,
              {
                cancel_at_period_end: false,
              },
            );

            logger.info(
              `Resumed subscription ${existingSubscriptionId} for group ${groupId}`,
            );

            await groupRef.update({
              subscriptionStatus: newSubscription.status,
              subscriptionCancelAtPeriodEnd: false,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            return {
              success: true,
              action: "resumed",
              subscriptionId: newSubscription.id,
              subscriptionStatus: newSubscription.status,
            };
          }
        } catch (err: any) {
          // Only fall through to "create new" when the subscription genuinely
          // doesn't exist in Stripe. All other errors (network, auth, rate
          // limit) must surface so the client can retry intelligently rather
          // than us creating a duplicate subscription.
          if (err?.code !== "resource_missing") {
            logger.error(
              `Error retrieving existing subscription ${existingSubscriptionId} for group ${groupId}:`,
              err,
            );
            throw new HttpsError(
              "internal",
              "Could not check subscription status. Please try again.",
            );
          }
          logger.info(
            `Existing subscription ${existingSubscriptionId} not found in Stripe (resource_missing), creating new one`,
          );
        }
      }

      // Idempotency-key day stamp: same-day retries dedupe, next-day attempts
      // create a fresh resource. Users reaching this callable have already
      // failed once, making double-tap more likely.
      const day = new Date().toISOString().split("T")[0];

      // Create a new customer if needed
      if (!finalCustomerId) {
        const userRef = db.collection("users").doc(userId);
        const userSnap = await userRef.get();
        const userData = userSnap.data();
        const userEmail = userData?.email;

        if (!userEmail) {
          throw new HttpsError(
            "failed-precondition",
            "User email is required to create a subscription.",
          );
        }

        const customer = await stripe.customers.create(
          {
            email: userEmail,
            name: userData?.displayName || groupData.name,
            metadata: { groupId, userId },
            payment_method: paymentMethodId,
            invoice_settings: {
              default_payment_method: paymentMethodId,
            },
          },
          {
            idempotencyKey: `reactivate-${groupId}-${userId}-customer-${day}`,
          },
        );
        finalCustomerId = customer.id;

        logger.info(
          `Created new Stripe customer ${finalCustomerId} for group ${groupId}`,
        );
      } else if (paymentMethodId) {
        // Attach new payment method to existing customer
        await stripe.paymentMethods.attach(paymentMethodId, {
          customer: finalCustomerId,
        });
        await stripe.customers.update(finalCustomerId, {
          invoice_settings: {
            default_payment_method: paymentMethodId,
          },
        });

        logger.info(
          `Attached payment method ${paymentMethodId} to customer ${finalCustomerId}`,
        );
      }

      // Get the default price for the group product
      const groupPriceId = await getDefaultPriceForProduct(productIdGroup);
      logger.info(
        `Using group price ${groupPriceId} from product ${productIdGroup}`,
      );

      // Create new subscription
      newSubscription = await stripe.subscriptions.create(
        {
          customer: finalCustomerId,
          items: [
            {
              price: groupPriceId,
              quantity: 1, // Flat rate
            },
          ],
          metadata: {
            groupId,
            userId,
          },
          trial_period_days: 0, // No trial for reactivation
          default_payment_method: paymentMethodId,
          expand: ["latest_invoice.payment_intent"],
        },
        {
          idempotencyKey: `reactivate-${groupId}-${userId}-subscription-${day}`,
        },
      );

      logger.info(
        `Created new subscription ${newSubscription.id} for group ${groupId}`,
      );

      // Update group document
      await groupRef.update({
        stripeCustomerId: finalCustomerId,
        stripeSubscriptionId: newSubscription.id,
        subscriptionStatus: newSubscription.status,
        stripeSubscriptionItemId: newSubscription.items.data[0]?.id,
        stripePriceIdGroup: groupPriceId,
        stripeProductIdGroup: productIdGroup,
        subscriptionCancelAtPeriodEnd: false,
        subscriptionExpiresAt: newSubscription.current_period_end
          ? admin.firestore.Timestamp.fromMillis(
              newSubscription.current_period_end * 1000,
            )
          : null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        success: true,
        action: "created",
        subscriptionId: newSubscription.id,
        subscriptionStatus: newSubscription.status,
      };
    } catch (error: any) {
      if (error instanceof HttpsError) {
        throw error;
      }

      logger.error(
        `Error reactivating subscription for group ${groupId}:`,
        error,
      );

      throw new HttpsError("internal", "Failed to reactivate subscription.");
    }
  },
);
