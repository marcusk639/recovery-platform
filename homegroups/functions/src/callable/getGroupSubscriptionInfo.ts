import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { db } from "../utils/firebase";
import { stripe } from "../utils/stripe";
import { getSubscriptionCost } from "../utils/stripeUtils";
import { requireAuth } from "../utils/callableWrapper";

interface GetSubscriptionInfoData {
  groupId: string;
}

export const getGroupSubscriptionInfo = onCall(
  async (request: CallableRequest<GetSubscriptionInfoData>) => {
    const { groupId } = request.data;
    const userId = requireAuth(request);

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
          "Only group admins can view subscription information.",
        );
      }

      const memberCount = groupData.memberCount || 0;
      const subscriptionId = groupData.stripeSubscriptionId;
      const subscriptionStatus = groupData.subscriptionStatus;
      const stripeCustomerId = groupData.stripeCustomerId;

      let subscriptionDetails = null;
      let customerDetails = null;

      // Get subscription details from Stripe if subscription exists
      if (subscriptionId) {
        try {
          const subscription = await stripe.subscriptions.retrieve(
            subscriptionId,
            {
              expand: ["items", "latest_invoice"],
            },
          );

          subscriptionDetails = {
            id: subscription.id,
            status: subscription.status,
            currentPeriodStart: (subscription as any).current_period_start,
            currentPeriodEnd: (subscription as any).current_period_end,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            items: subscription.items.data.map((item) => ({
              id: item.id,
              priceId: item.price.id,
              quantity: item.quantity,
              unitAmount: item.price.unit_amount,
              currentPeriodStart: item.current_period_start,
              currentPeriodEnd: item.current_period_end,
            })),
            latestInvoice: subscription.latest_invoice
              ? {
                  id: (subscription.latest_invoice as any).id,
                  amountPaid: (subscription.latest_invoice as any).amount_paid,
                  status: (subscription.latest_invoice as any).status,
                }
              : null,
          };
        } catch (stripeError) {
          logger.error(
            `Error fetching subscription ${subscriptionId}:`,
            stripeError,
          );
        }
      }

      // Get customer details from Stripe if customer exists
      if (stripeCustomerId) {
        try {
          const customer = await stripe.customers.retrieve(stripeCustomerId);
          customerDetails = {
            id: customer.id,
            email: (customer as any).email,
            name: (customer as any).name,
          };
        } catch (stripeError) {
          logger.error(
            `Error fetching customer ${stripeCustomerId}:`,
            stripeError,
          );
        }
      }

      // Get subscription cost (flat rate, annual)
      const annualCost = await getSubscriptionCost(groupId);

      return {
        groupId,
        memberCount,
        subscriptionStatus,
        annualCost, // Flat rate: $12/year
        subscriptionDetails,
        customerDetails,
        hasActiveSubscription: subscriptionStatus === "active",
        canCreateSubscription:
          !subscriptionId || subscriptionStatus === "canceled",
      };
    } catch (error: any) {
      if (error instanceof HttpsError) {
        throw error;
      }

      logger.error(
        `Error getting subscription info for group ${groupId}:`,
        error,
      );

      throw new HttpsError(
        "internal",
        "Failed to get subscription information.",
      );
    }
  },
);
