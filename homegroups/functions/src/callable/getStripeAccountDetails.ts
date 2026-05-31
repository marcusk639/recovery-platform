import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { stripe } from "../utils/stripe";

interface GetStripeAccountDetailsData {
  accountId?: string; // Optional: for connected accounts
  includeBalance?: boolean;
  includeCharges?: boolean;
  includeCustomers?: boolean;
  includeSubscriptions?: boolean;
  includeProducts?: boolean;
  includePrices?: boolean;
}

export const getStripeAccountDetails = onCall(
  async (request: CallableRequest<GetStripeAccountDetailsData>) => {
    const userId = request.auth?.uid;
    const {
      accountId,
      includeBalance = true,
      includeCharges = false,
      includeCustomers = false,
      includeSubscriptions = false,
      includeProducts = false,
      includePrices = false,
    } = request.data;

    if (!userId) {
      throw new HttpsError("unauthenticated", "User must be logged in.");
    }

    if (request.auth?.token?.superAdmin !== true) {
      throw new HttpsError("permission-denied", "Requires super admin access.");
    }

    if (accountId !== undefined && !/^acct_[A-Za-z0-9]+$/.test(accountId)) {
      throw new HttpsError("invalid-argument", "Invalid accountId format.");
    }

    try {
      const results: any = {};

      // Get account information — project to safe fields only (no individual PII, SSN, tax IDs)
      const rawAccount = accountId
        ? await stripe.accounts.retrieve(accountId)
        : await stripe.accounts.retrieve();
      results.account = {
        id: rawAccount.id,
        type: rawAccount.type,
        country: rawAccount.country,
        default_currency: rawAccount.default_currency,
        email: rawAccount.email,
        business_type: rawAccount.business_type,
        charges_enabled: rawAccount.charges_enabled,
        payouts_enabled: rawAccount.payouts_enabled,
        details_submitted: rawAccount.details_submitted,
        created: rawAccount.created,
        capabilities: rawAccount.capabilities || {},
        requirements: rawAccount.requirements || {},
      };

      // Get account balance if requested
      if (includeBalance) {
        if (accountId) {
          results.balance = await stripe.balance.retrieve({
            stripeAccount: accountId,
          });
        } else {
          results.balance = await stripe.balance.retrieve();
        }
      }

      // Get recent charges if requested
      if (includeCharges) {
        const charges = await stripe.charges.list({
          limit: 20,
          ...(accountId && { stripeAccount: accountId }),
        });
        results.charges = charges.data.map((charge) => ({
          id: charge.id,
          amount: charge.amount,
          currency: charge.currency,
          status: charge.status,
          created: charge.created,
          description: charge.description,
        }));
      }

      // Get customers if requested
      if (includeCustomers) {
        const customers = await stripe.customers.list({
          limit: 20,
          ...(accountId && { stripeAccount: accountId }),
        });
        results.customers = customers.data.map((customer) => ({
          id: customer.id,
          email: customer.email,
          name: customer.name,
          created: customer.created,
        }));
      }

      // Get subscriptions if requested
      if (includeSubscriptions) {
        const subscriptions = await stripe.subscriptions.list({
          limit: 20,
          ...(accountId && { stripeAccount: accountId }),
        });
        results.subscriptions = subscriptions.data.map((sub) => ({
          id: sub.id,
          status: sub.status,
          customer: sub.customer,
          created: sub.created,
        }));
      }

      // Get products if requested
      if (includeProducts) {
        const products = await stripe.products.list({
          limit: 20,
          ...(accountId && { stripeAccount: accountId }),
        });
        results.products = products.data.map((p) => ({
          id: p.id,
          name: p.name,
          active: p.active,
          created: p.created,
        }));
      }

      // Get prices if requested
      if (includePrices) {
        const prices = await stripe.prices.list({
          limit: 20,
          ...(accountId && { stripeAccount: accountId }),
        });
        results.prices = prices.data.map((p) => ({
          id: p.id,
          product: p.product,
          unitAmount: p.unit_amount,
          currency: p.currency,
          active: p.active,
          recurring: p.recurring,
        }));
      }

      return {
        success: true,
        data: results,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      if (error instanceof HttpsError) {
        throw error;
      }

      logger.error("Error retrieving Stripe account details", {
        error: error?.message,
      });

      throw new HttpsError(
        "internal",
        "Failed to retrieve Stripe account details.",
      );
    }
  },
);
