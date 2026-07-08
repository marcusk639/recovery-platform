import * as functions from "firebase-functions";
import { Response } from "express";
import {
  stripe,
  webhookSecret,
  connectWebhookSecret,
  NonRetriableError,
} from "../utils/stripe";
import Stripe from "stripe";
import {
  handleCheckoutSessionCompleted,
  handleInvoicePaymentSucceeded,
  handleInvoicePaymentFailed,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
  handleIntergroupSubscriptionUpdated,
  handleIntergroupSubscriptionDeleted,
  handleTrialWillEnd,
  handlePaymentIntentSucceeded,
  handlePaymentIntentFailed,
  handleDisputeCreated,
} from "../utils/stripeUtils";
import { db } from "../utils/firebase";
import * as admin from "firebase-admin";

/**
 * Platform Webhook Handler
 * Handles events from your main Stripe account (subscriptions, checkout sessions)
 */
export const stripeWebhook = functions.https.onRequest(
  {
    cpu: 1,
    memory: "512MiB",
    timeoutSeconds: 60,
    region: "us-central1",
  },
  async (req, res) => {
    await handleWebhook(req, res, webhookSecret, false);
  },
);

/**
 * Connect Webhook Handler
 * Handles events from connected Stripe accounts (donations to groups)
 */
export const stripeConnectWebhook = functions.https.onRequest(
  {
    cpu: 1,
    memory: "512MiB",
    timeoutSeconds: 60,
    region: "us-central1",
  },
  async (req, res) => {
    await handleWebhook(req, res, connectWebhookSecret, true);
  },
);

/**
 * Unified webhook handler for both platform and Connect events
 */
async function handleWebhook(
  req: functions.https.Request,
  res: Response,
  secret: string | undefined,
  isConnectWebhook: boolean,
): Promise<void> {
  const webhookType = isConnectWebhook ? "Connect" : "Platform";

  if (!secret) {
    functions.logger.error(
      `CRITICAL: Stripe ${webhookType} webhook secret not configured.`,
    );
    res.status(500).send({
      received: false,
      error: `${webhookType} webhook secret not configured`,
      processed: false,
    });
    return;
  }

  const sig = req.headers["stripe-signature"] as string;
  const connectedAccountId = req.headers["stripe-account"] as
    string | undefined;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.rawBody, sig, secret);
  } catch (err: any) {
    functions.logger.error(
      `${webhookType} webhook signature verification failed`,
    );
    res.status(400).send(`Webhook Error: invalid signature`);
    return;
  }

  const logPrefix = connectedAccountId
    ? `[${webhookType}:${connectedAccountId}]`
    : `[${webhookType}]`;

  functions.logger.info(`${logPrefix} Received Stripe event: ${event.type}`);

  // Atomic idempotency guard: create() fails if the doc already exists,
  // preventing duplicate processing when Stripe delivers the same event twice concurrently.
  const processedRef = db.collection("processed_stripe_events").doc(event.id);
  try {
    await processedRef.create({
      eventType: event.type,
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
      status: "processing",
    });
  } catch (err: any) {
    if (err.code === 6) {
      // ALREADY_EXISTS — duplicate delivery
      functions.logger.info(`${logPrefix} Duplicate event, skipping`);
      res.status(200).send({ received: true, duplicate: true });
      return;
    }
    // Firestore unavailable — proceed and risk a duplicate rather than drop the event
    functions.logger.warn(
      `${logPrefix} Could not claim idempotency lock, proceeding`,
    );
  }

  // Handle the event
  try {
    await processEvent(event, connectedAccountId, logPrefix);
    await processedRef.update({ status: "processed" }).catch(() => {});
    res.status(200).send({ received: true });
  } catch (error: any) {
    functions.logger.error(
      `${logPrefix} Error handling webhook ${event.type}:`,
      error,
    );

    // Delete the lock so Stripe can retry on transient failures
    await processedRef.delete().catch(() => {});

    if (error instanceof NonRetriableError) {
      functions.logger.warn(
        `${logPrefix} Non-retriable error for ${event.type}, acknowledging`,
      );
      res.status(200).send({
        received: true,
        error: "Non-retriable error",
        retriable: false,
      });
      return;
    }

    res.status(500).send({ error: "Webhook handler failed." });
  }
}

/**
 * Process a Stripe event by type
 */
async function processEvent(
  event: Stripe.Event,
  connectedAccountId: string | undefined,
  logPrefix: string,
): Promise<void> {
  switch (event.type) {
    // --- Checkout & Subscription Events (Platform) ---
    case "checkout.session.completed":
      await handleCheckoutSessionCompleted(
        event.data.object as Stripe.Checkout.Session,
      );
      break;

    case "invoice.payment_succeeded":
      await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
      break;

    case "invoice.payment_failed":
      await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
      break;

    case "customer.subscription.updated":
      await handleSubscriptionUpdated(
        event.data.object as Stripe.Subscription,
        (event.data as any).previous_attributes,
      );
      await handleIntergroupSubscriptionUpdated(
        event.data.object as Stripe.Subscription,
      );
      break;

    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
      await handleIntergroupSubscriptionDeleted(
        event.data.object as Stripe.Subscription,
      );
      break;

    case "customer.subscription.trial_will_end":
      await handleTrialWillEnd(event.data.object as Stripe.Subscription);
      break;

    // --- Payment Events (Platform & Connect) ---
    case "payment_intent.succeeded":
      await handlePaymentIntentSucceeded(
        event.data.object as Stripe.PaymentIntent,
        connectedAccountId,
      );
      break;

    case "payment_intent.payment_failed":
      await handlePaymentIntentFailed(
        event.data.object as Stripe.PaymentIntent,
        connectedAccountId,
      );
      break;

    // --- Dispute Events ---
    case "charge.dispute.created":
      await handleDisputeCreated(event.data.object as Stripe.Dispute);
      break;

    // --- Informational Events (log only) ---
    case "invoice.upcoming":
      const upcomingInvoice = event.data.object as Stripe.Invoice & {
        subscription?: string | { id: string };
      };
      const upcomingSubId =
        typeof upcomingInvoice.subscription === "string"
          ? upcomingInvoice.subscription
          : upcomingInvoice.subscription?.id || "unknown";
      functions.logger.info(
        `${logPrefix} Upcoming invoice for subscription ${upcomingSubId}: ` +
          `$${(upcomingInvoice.amount_due || 0) / 100}`,
      );
      break;

    case "charge.succeeded":
      const charge = event.data.object as Stripe.Charge;
      functions.logger.info(
        `${logPrefix} Charge succeeded: ${charge.id}, amount=$${
          charge.amount / 100
        }`,
      );
      break;

    case "charge.failed":
      const failedCharge = event.data.object as Stripe.Charge;
      functions.logger.warn(
        `${logPrefix} Charge failed: ${failedCharge.id}, reason=${failedCharge.failure_message}`,
      );
      break;

    default:
      functions.logger.info(`${logPrefix} Unhandled event type: ${event.type}`);
  }
}
