import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { stripe } from "../utils/stripe";
import { requireAuth } from "../utils/callableWrapper";

export const getStripeAccountInfo = onCall(
  async (request: CallableRequest<{}>) => {
    requireAuth(request);

    if (request.auth?.token?.superAdmin !== true) {
      throw new HttpsError("permission-denied", "Requires super admin access.");
    }

    try {
      // Get account information
      const account = await stripe.accounts.retrieve();

      // Get account balance
      const balance = await stripe.balance.retrieve();

      // Get recent charges (last 10)
      const charges = await stripe.charges.list({
        limit: 10,
      });

      // Get recent customers (last 10)
      const customers = await stripe.customers.list({
        limit: 10,
        expand: ["data.subscriptions"],
      });

      // Get recent subscriptions (last 10)
      const subscriptions = await stripe.subscriptions.list({
        limit: 10,
      });

      // Get account capabilities
      const capabilities = account.capabilities || {};

      // Get account requirements
      const requirements = account.requirements || {};

      return {
        success: true,
        account: {
          id: account.id,
          type: account.type,
          country: account.country,
          default_currency: account.default_currency,
          email: account.email,
          business_type: account.business_type,
          charges_enabled: account.charges_enabled,
          payouts_enabled: account.payouts_enabled,
          details_submitted: account.details_submitted,
          created: account.created,
          capabilities,
          requirements,
        },
        balance: {
          available: balance.available,
          pending: balance.pending,
          instant_available: balance.instant_available,
        },
        recentActivity: {
          charges: charges.data.map((charge) => ({
            id: charge.id,
            amount: charge.amount,
            currency: charge.currency,
            status: charge.status,
            created: charge.created,
            description: charge.description,
          })),
          customers: customers.data.map((customer) => ({
            id: customer.id,
            email: customer.email,
            name: customer.name,
            created: customer.created,
            subscriptions: customer.subscriptions?.data?.length || 0,
          })),
          subscriptions: subscriptions.data.map((subscription) => ({
            id: subscription.id,
            status: subscription.status,
            customer: subscription.customer,
            items: subscription.items.data.map((item) => ({
              id: item.id,
              price: item.price.id,
              quantity: item.quantity,
              currentPeriodStart: item.current_period_start,
              currentPeriodEnd: item.current_period_end,
            })),
          })),
        },
      };
    } catch (error: any) {
      if (error instanceof HttpsError) {
        throw error;
      }

      logger.error("Error retrieving Stripe account info", {
        error: error?.message,
      });

      throw new HttpsError(
        "internal",
        "Failed to retrieve Stripe account information.",
      );
    }
  },
);
