import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { stripe } from "../utils/stripe";

interface GetStripeAccountMetricsData {
  accountId?: string;
  startDate?: string; // ISO date string
  endDate?: string; // ISO date string
}

export const getStripeAccountMetrics = onCall(
  {
    cpu: 0.5,
    memory: "256MiB",
    timeoutSeconds: 60,
    region: "us-central1",
  },
  async (request: CallableRequest<GetStripeAccountMetricsData>) => {
    const userId = request.auth?.uid;
    const { accountId, startDate, endDate } = request.data;

    if (!userId) {
      throw new HttpsError("unauthenticated", "User must be logged in.");
    }

    if (request.auth?.token?.superAdmin !== true) {
      throw new HttpsError("permission-denied", "Requires super admin access.");
    }

    if (accountId !== undefined && !/^acct_[A-Za-z0-9]+$/.test(accountId)) {
      throw new HttpsError("invalid-argument", "Invalid accountId format.");
    }

    const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T[\d:.Z+-]+)?$/;
    if (startDate && !ISO_DATE_RE.test(startDate)) {
      throw new HttpsError(
        "invalid-argument",
        "startDate must be a valid ISO date string.",
      );
    }
    if (endDate && !ISO_DATE_RE.test(endDate)) {
      throw new HttpsError(
        "invalid-argument",
        "endDate must be a valid ISO date string.",
      );
    }

    try {
      const results: any = {};

      // Set default date range (last 30 days)
      const end = endDate ? new Date(endDate) : new Date();
      const start = startDate
        ? new Date(startDate)
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        throw new HttpsError(
          "invalid-argument",
          "startDate or endDate is not a valid calendar date.",
        );
      }

      if (start >= end) {
        throw new HttpsError(
          "invalid-argument",
          "startDate must be before endDate.",
        );
      }

      const stripeAccount = accountId ? { stripeAccount: accountId } : {};

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

      // Get balance
      results.balance = await stripe.balance.retrieve(stripeAccount);

      // Get charges in date range
      const charges = await stripe.charges.list({
        created: {
          gte: Math.floor(start.getTime() / 1000),
          lte: Math.floor(end.getTime() / 1000),
        },
        limit: 100,
        ...stripeAccount,
      });

      // Calculate charge metrics
      const successfulCharges = charges.data.filter(
        (charge) => charge.status === "succeeded",
      );
      const failedCharges = charges.data.filter(
        (charge) => charge.status === "failed",
      );

      results.charges = {
        total: charges.data.length,
        successful: successfulCharges.length,
        failed: failedCharges.length,
        totalAmount: successfulCharges.reduce(
          (sum, charge) => sum + charge.amount,
          0,
        ),
        averageAmount:
          successfulCharges.length > 0
            ? successfulCharges.reduce(
                (sum, charge) => sum + charge.amount,
                0,
              ) / successfulCharges.length
            : 0,
      };

      // Get customers
      const customers = await stripe.customers.list({
        created: {
          gte: Math.floor(start.getTime() / 1000),
          lte: Math.floor(end.getTime() / 1000),
        },
        limit: 100,
        ...stripeAccount,
      });

      results.customers = {
        total: customers.data.length,
      };

      // Get subscriptions
      const subscriptions = await stripe.subscriptions.list({
        created: {
          gte: Math.floor(start.getTime() / 1000),
          lte: Math.floor(end.getTime() / 1000),
        },
        limit: 100,
        ...stripeAccount,
      });

      const activeSubscriptions = subscriptions.data.filter(
        (sub) => sub.status === "active",
      );
      const trialingSubscriptions = subscriptions.data.filter(
        (sub) => sub.status === "trialing",
      );
      const canceledSubscriptions = subscriptions.data.filter(
        (sub) => sub.status === "canceled",
      );

      results.subscriptions = {
        total: subscriptions.data.length,
        active: activeSubscriptions.length,
        trialing: trialingSubscriptions.length,
        canceled: canceledSubscriptions.length,
      };

      // Get products and prices
      const products = await stripe.products.list({
        limit: 100,
        ...stripeAccount,
      });

      const prices = await stripe.prices.list({
        limit: 100,
        ...stripeAccount,
      });

      results.products = {
        total: products.data.length,
      };

      results.prices = {
        total: prices.data.length,
      };

      // Calculate summary metrics
      results.summary = {
        dateRange: {
          start: start.toISOString(),
          end: end.toISOString(),
        },
        totalRevenue: results.charges.totalAmount,
        totalCustomers: results.customers.total,
        activeSubscriptions: results.subscriptions.active,
        trialingSubscriptions: results.subscriptions.trialing,
        successRate:
          results.charges.total > 0
            ? (results.charges.successful / results.charges.total) * 100
            : 0,
      };

      return {
        success: true,
        data: results,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      if (error instanceof HttpsError) {
        throw error;
      }

      logger.error("Error retrieving Stripe account metrics", {
        error: error?.message,
      });

      throw new HttpsError(
        "internal",
        "Failed to retrieve Stripe account metrics.",
      );
    }
  },
);
