import * as admin from "firebase-admin";
import Stripe from "stripe";
import { createStripeClient } from "../util/stripe";

// Lazily instantiated to avoid constructing the Stripe client at module load
// (Firebase source analysis loads modules without secrets bound, so eager
// `createStripeClient()` would throw on an empty key). Memoized on first use.
let _stripe: Stripe | undefined;
const getStripe = (): Stripe => (_stripe ??= createStripeClient());
import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import {
  SENDGRID_API_KEY,
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
  STRIPE_CONNECT_WEBHOOK_SECRET,
  STRIPE_TEST_WEBHOOK_SECRET,
  STRIPE_CONNECT_TEST_WEBHOOK_SECRET,
} from "../config";
import {
  webhookSecretCandidates,
  type WebhookSecretCandidate,
} from "../util/stripeWebhookSecrets";
import { verifyStripeWebhook } from "../util/verifyStripeWebhook";
import { sendFcmToHouseAdmins } from "../util/notifications";
import { sendEmail, regroupEmail } from "../util/email";
import type { SubscriptionDoc } from "../api/firestore";

// ---------------------------------------------------------------------------
// Firestore data-model types
// ---------------------------------------------------------------------------

interface HouseDoc {
  stripeAccountId: string;
  stripeStatus:
    | "active"
    | "pending"
    | "restricted"
    | "disconnected"
    | "not_connected";
  stripeChargesEnabled: boolean;
  stripePayoutsEnabled: boolean;
  stripeRequirements?: string[];
}

interface GuestDoc {
  houseId: string;
  userId: string;
  firstName: string;
  lastName: string;
  rentOwed?: number;
  rentDueDate?: string; // YYYY-MM-DD (optional live field)
  email?: string;
}

// SubscriptionDoc is the shared shape of a `subscriptions` collection doc,
// defined in ../api/firestore (and seeded there by createOperatorSubscription).

interface UserDoc {
  // Canonical per-user FCM token field (see entities/User.ts and util/notifications.ts).
  messagingToken?: string[];
}

// ---------------------------------------------------------------------------
// Helper — extract subscription ID from invoice (API 2026-01-28.clover)
//
// In the 2026-01-28.clover API version, Invoice.subscription was removed.
// The subscription reference is now nested under invoice.parent.subscription_details.
// ---------------------------------------------------------------------------

function getSubscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const parent = invoice.parent;
  if (!parent) return null;
  if (parent.type !== "subscription_details") return null;
  const subDetails = parent.subscription_details;
  if (!subDetails) return null;
  const sub = subDetails.subscription;
  if (!sub) return null;
  return typeof sub === "string" ? sub : sub.id;
}

// ---------------------------------------------------------------------------
// Helper — send FCM notification to a single Firebase user
// ---------------------------------------------------------------------------

async function sendFcmToUser(
  userId: string,
  title: string,
  body: string,
): Promise<void> {
  try {
    const db = admin.firestore();
    const userSnap = await db.collection("users").doc(userId).get();
    if (!userSnap.exists) return;

    const userData = userSnap.data() as UserDoc;
    const tokens: string[] = userData.messagingToken ?? [];
    if (tokens.length === 0) return;

    const messaging = admin.messaging();
    const sendPromises = tokens.map((token) =>
      messaging
        .send({ token, notification: { title, body } })
        .catch((err: Error) => {
          logger.warn("FCM send failed for token", { token, err: err.message });
        }),
    );
    await Promise.all(sendPromises);
  } catch (err) {
    // Notification failures must never surface as fatal errors
    logger.warn("sendFcmToUser error (non-fatal)", {
      userId,
      err: (err as Error).message,
    });
  }
}

// ---------------------------------------------------------------------------
// Helper — find a house document by stripeAccountId (used for Connect events)
// ---------------------------------------------------------------------------

async function findHouseByStripeAccountId(
  accountId: string,
): Promise<{ id: string; data: HouseDoc } | null> {
  try {
    const db = admin.firestore();
    const snap = await db
      .collection("houses")
      .where("stripeAccountId", "==", accountId)
      .limit(1)
      .get();

    if (snap.empty) return null;

    const doc = snap.docs[0];
    return { id: doc.id, data: doc.data() as HouseDoc };
  } catch (err) {
    logger.error("findHouseByStripeAccountId error", {
      accountId,
      err: (err as Error).message,
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helper — resolve the operator UID from a Stripe Subscription object.
//
// Strategy (B10/W12):
//   1. Read userId from Stripe subscription metadata (set at creation time).
//   2. If missing, fall back to a Firestore query on the subscriptions collection.
// ---------------------------------------------------------------------------

async function resolveOperatorUid(
  subscription: Stripe.Subscription,
): Promise<string | null> {
  // Fast path: userId stored in Stripe metadata by createOperatorSubscription (W12)
  const uidFromMeta = subscription.metadata?.userId;
  if (uidFromMeta) return uidFromMeta;

  // Slow path: query subscriptions collection by stripeSubscriptionId
  try {
    const db = admin.firestore();
    const snap = await db
      .collection("subscriptions")
      .where("stripeSubscriptionId", "==", subscription.id)
      .limit(1)
      .get();
    if (!snap.empty) {
      const doc = snap.docs[0].data() as SubscriptionDoc;
      if (doc.userId) return doc.userId;
    }
  } catch (err) {
    logger.warn("resolveOperatorUid: subscriptions query failed", {
      subscriptionId: subscription.id,
      err: (err as Error).message,
    });
  }

  // Last resort: query users collection by subscriptionId
  try {
    const db = admin.firestore();
    const snap = await db
      .collection("users")
      .where("subscriptionMetadata.subscriptionId", "==", subscription.id)
      .limit(1)
      .get();
    if (!snap.empty) {
      return snap.docs[0].id;
    }
  } catch (err) {
    logger.warn("resolveOperatorUid: users query failed", {
      subscriptionId: subscription.id,
      err: (err as Error).message,
    });
  }

  logger.warn("resolveOperatorUid: could not resolve operator uid", {
    subscriptionId: subscription.id,
  });
  return null;
}

// ---------------------------------------------------------------------------
// Helper — update subscriptionStatus (and optionally guestGraceEndsAt) on
// all house documents owned by the given operator.
//
// B10: Guests read house.subscriptionStatus and house.guestGraceEndsAt to
// determine access, so every subscription webhook must propagate to houses.
// ---------------------------------------------------------------------------

type HouseSubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "unpaid";

async function updateHouseSubscriptionStatus(
  operatorUid: string,
  status: HouseSubscriptionStatus,
  guestGraceEndsAt?: string | admin.firestore.FieldValue,
): Promise<void> {
  const db = admin.firestore();

  // Query houses by adminIds (preferred) — a single array-contains query.
  // If the operator is only in the legacy adminId field, a second query picks them up.
  const [byAdminIds, byAdminId] = await Promise.all([
    db
      .collection("houses")
      .where("adminIds", "array-contains", operatorUid)
      .get(),
    db.collection("houses").where("adminId", "==", operatorUid).get(),
  ]);

  // Deduplicate by document ID
  const docMap = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  byAdminIds.docs.forEach((d) => docMap.set(d.id, d));
  byAdminId.docs.forEach((d) => docMap.set(d.id, d));

  if (docMap.size === 0) {
    logger.warn("updateHouseSubscriptionStatus: no houses found for operator", {
      operatorUid,
      status,
    });
    return;
  }

  const batch = db.batch();

  for (const doc of docMap.values()) {
    const update: Record<string, unknown> = {
      subscriptionStatus: status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (guestGraceEndsAt !== undefined) {
      update.guestGraceEndsAt = guestGraceEndsAt;
    }
    batch.update(
      doc.ref,
      update as FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>,
    );
  }

  await batch.commit();

  logger.info("updateHouseSubscriptionStatus: updated houses", {
    operatorUid,
    status,
    houseCount: docMap.size,
    guestGraceEndsAt: guestGraceEndsAt ?? "(no change)",
  });
}

// ---------------------------------------------------------------------------
// Helper — upsert the payments document for a given PaymentIntent
// ---------------------------------------------------------------------------

async function upsertPaymentDoc(
  paymentIntentId: string,
  fields: Record<string, unknown>,
): Promise<void> {
  const db = admin.firestore();
  await db
    .collection("payments")
    .doc(paymentIntentId)
    .set(fields, { merge: true });
}

// ---------------------------------------------------------------------------
// Event handler: payment_intent.succeeded
// ---------------------------------------------------------------------------

async function handlePaymentIntentSucceeded(
  paymentIntent: Stripe.PaymentIntent,
): Promise<void> {
  const { guestId, houseId } = paymentIntent.metadata ?? {};

  if (!guestId || !houseId) {
    logger.warn("payment_intent.succeeded: missing metadata", {
      paymentIntentId: paymentIntent.id,
      metadata: paymentIntent.metadata,
    });
    // Still write a partial payment doc so ops can investigate
    await upsertPaymentDoc(paymentIntent.id, {
      stripePaymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount / 100,
      currency: paymentIntent.currency,
      status: "succeeded",
      houseId: houseId ?? null,
      guestId: guestId ?? null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return;
  }

  const db = admin.firestore();
  const amountDollars = paymentIntent.amount / 100;
  // paymentIntent.amount is already in cents (Stripe always uses cents)
  const amountCents = paymentIntent.amount;

  // Read the guest once up front so we can both (a) capture the due date active
  // when this payment posted and (b) reuse the snapshot for the rentOwed
  // decrement + notifications below. (#34 on-time rate)
  const guestRef = db.collection("guests").doc(guestId);
  let guestSnap: FirebaseFirestore.DocumentSnapshot | undefined;
  try {
    guestSnap = await guestRef.get();
  } catch (err) {
    // Never block payment recording on a guest read failure.
    logger.warn("payment_intent.succeeded: guest read failed (non-fatal)", {
      guestId,
      err: (err as Error).message,
    });
  }

  // dueDate is the guest's rentDueDate at charge time. This is an approximation:
  // it reflects the due date *active when the payment posted* (the best available
  // signal — no per-charge due-date schedule history exists). Omitted when the
  // guest has no rentDueDate or the read failed.
  const guestDataForDueDate = guestSnap?.exists
    ? (guestSnap.data() as GuestDoc)
    : undefined;
  const dueDate =
    typeof guestDataForDueDate?.rentDueDate === "string" &&
    guestDataForDueDate.rentDueDate.length > 0
      ? guestDataForDueDate.rentDueDate
      : undefined;

  // 1. Write / update payment document
  await upsertPaymentDoc(paymentIntent.id, {
    stripePaymentIntentId: paymentIntent.id,
    houseId,
    guestId,
    amount: amountDollars,
    currency: paymentIntent.currency,
    status: "succeeded",
    ...(dueDate ? { dueDate } : {}),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // 1b. Reconcile the auto-pay attempt record. The scheduled collector authors
  // that record at charge time; this only confirms the outcome, so a missing id
  // means a resident-initiated payment, not an error. Non-fatal: never let a
  // reconciliation write block the rentOwed decrement below.
  const rentAttemptId = paymentIntent.metadata?.rentAttemptId;
  if (rentAttemptId) {
    try {
      await db
        .collection("rent-collection-attempts")
        .doc(rentAttemptId)
        .set(
          {
            status: "charged",
            paymentIntentId: paymentIntent.id,
            needsReconciliation: false,
            reconciledAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
    } catch (err) {
      logger.error("payment_intent.succeeded: rent attempt reconcile failed", {
        rentAttemptId,
        err: (err as Error).message,
      });
    }
  }

  // 2. Atomically decrement guest rentOwed (integer cents) — eliminates read-modify-write race
  if (!guestSnap || !guestSnap.exists) {
    logger.warn("payment_intent.succeeded: guest not found", { guestId });
  } else {
    const guestData = guestSnap.data() as GuestDoc;

    await guestRef.update({
      rentOwed: admin.firestore.FieldValue.increment(-amountCents),
    });

    // 3. Notify the guest
    await sendFcmToUser(
      guestData.userId,
      "Payment Received",
      `Your payment of $${amountDollars.toFixed(2)} was received.`,
    );

    // 4. Notify house admins
    const guestName = `${guestData.firstName} ${guestData.lastName}`;
    await sendFcmToHouseAdmins(
      houseId,
      "Rent Payment Received",
      `Resident ${guestName} paid $${amountDollars.toFixed(2)} rent.`,
    );

    // 5. Send email receipt to guest (non-fatal)
    if (guestData.email) {
      try {
        const amountFormatted = amountDollars.toFixed(2);
        await sendEmail({
          from: regroupEmail,
          to: guestData.email,
          subject: "Payment Received — Regroup",
          text: `Hi ${guestData.firstName},\n\nYour rent payment of $${amountFormatted} has been received.\n\nThank you,\nRegroup`,
          html: `<p>Hi ${guestData.firstName},</p><p>Your rent payment of <strong>$${amountFormatted}</strong> has been received.</p><p>Thank you,<br>Regroup</p>`,
        });
      } catch (emailError) {
        logger.warn(
          "handlePaymentIntentSucceeded: email send failed (non-fatal)",
          { emailError },
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Event handler: payment_intent.payment_failed
// ---------------------------------------------------------------------------

async function handlePaymentIntentFailed(
  paymentIntent: Stripe.PaymentIntent,
): Promise<void> {
  const { guestId, houseId } = paymentIntent.metadata ?? {};

  const lastError = paymentIntent.last_payment_error;
  const failureCode = lastError?.code ?? "unknown";
  const failureMessage = lastError?.message ?? "Payment failed";
  const amountDollars = paymentIntent.amount / 100;

  logger.error("payment_intent.payment_failed", {
    paymentIntentId: paymentIntent.id,
    failureCode,
    failureMessage,
    guestId,
    houseId,
  });

  // 1. Update payment document with failure details
  await upsertPaymentDoc(paymentIntent.id, {
    stripePaymentIntentId: paymentIntent.id,
    houseId: houseId ?? null,
    guestId: guestId ?? null,
    amount: amountDollars,
    currency: paymentIntent.currency,
    status: "failed",
    failureCode,
    failureMessage,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  if (!guestId || !houseId) {
    logger.warn(
      "payment_intent.payment_failed: missing metadata, skipping notifications",
      { paymentIntentId: paymentIntent.id },
    );
    return;
  }

  const db = admin.firestore();
  const guestSnap = await db.collection("guests").doc(guestId).get();

  if (!guestSnap.exists) {
    logger.warn("payment_intent.payment_failed: guest not found", { guestId });
    return;
  }

  const guestData = guestSnap.data() as GuestDoc;
  const guestName = `${guestData.firstName} ${guestData.lastName}`;

  // Build context-aware user message based on failure code
  let userMessage: string;
  switch (failureCode) {
    case "card_declined": {
      const declineReason = lastError?.decline_code ?? "unknown reason";
      userMessage = `Your payment of $${amountDollars.toFixed(
        2,
      )} was declined (${declineReason}). Please update your payment method.`;
      break;
    }
    case "insufficient_funds":
      userMessage = `Your payment of $${amountDollars.toFixed(
        2,
      )} failed due to insufficient funds. Consider paying via ACH bank transfer.`;
      break;
    case "authentication_required":
      userMessage = `Your payment of $${amountDollars.toFixed(
        2,
      )} requires additional authentication. Please re-authenticate your card.`;
      break;
    default:
      userMessage = `Your payment of $${amountDollars.toFixed(
        2,
      )} failed: ${failureMessage}`;
  }

  // 2. Notify guest
  await sendFcmToUser(guestData.userId, "Payment Failed", userMessage);

  // 3. Notify house admins
  await sendFcmToHouseAdmins(
    houseId,
    "Payment Failed",
    `Payment of $${amountDollars.toFixed(
      2,
    )} from ${guestName} failed (${failureCode}).`,
  );
}

// ---------------------------------------------------------------------------
// Event handler: charge.dispute.created
// ---------------------------------------------------------------------------

async function handleDisputeCreated(
  dispute: Stripe.Dispute,
  stripeClient: Stripe,
): Promise<void> {
  const chargeId =
    typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;

  if (!chargeId) {
    logger.warn("charge.dispute.created: no charge id", {
      disputeId: dispute.id,
    });
    return;
  }

  // Retrieve the charge to get the associated PaymentIntent
  let paymentIntentId: string | null = null;
  let houseId: string | null = null;

  try {
    const charge = await stripeClient.charges.retrieve(chargeId);
    if (typeof charge.payment_intent === "string") {
      paymentIntentId = charge.payment_intent;
    } else if (charge.payment_intent) {
      paymentIntentId = charge.payment_intent.id;
    }
    houseId = charge.metadata?.houseId ?? null;
  } catch (err) {
    logger.warn("charge.dispute.created: could not retrieve charge", {
      chargeId,
      err: (err as Error).message,
    });
  }

  // Mark payment document as disputed
  if (paymentIntentId) {
    const db = admin.firestore();
    await db.collection("payments").doc(paymentIntentId).set(
      {
        disputed: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  // Notify house admins if we know which house this belongs to
  if (houseId) {
    await sendFcmToHouseAdmins(
      houseId,
      "Payment Dispute Filed",
      `A payment dispute has been filed for a charge of $${(
        dispute.amount / 100
      ).toFixed(2)}. Please respond promptly.`,
    );
  } else {
    logger.warn(
      "charge.dispute.created: could not determine houseId for notification",
      { disputeId: dispute.id },
    );
  }
}

// ---------------------------------------------------------------------------
// Event handler: charge.refunded (and charge.refund.updated)
//
// Records the cumulative refunded amount on the payment doc so analytics can net
// refunds out of gross collected (#35). Stripe's `charge.amount_refunded` is the
// running total of all refunds against the charge (in cents), so a plain merge
// is correct even when multiple refunds occur. The charge carries a reference to
// the originating PaymentIntent, which is our payments doc id.
// ---------------------------------------------------------------------------

async function handleChargeRefunded(charge: Stripe.Charge): Promise<void> {
  const paymentIntentId =
    typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : (charge.payment_intent?.id ?? null);

  if (!paymentIntentId) {
    logger.warn("charge.refunded: no payment_intent on charge — no-op", {
      chargeId: charge.id,
    });
    return;
  }

  // charge.amount_refunded is the cumulative refunded total in cents.
  const refundedAmountCents = charge.amount_refunded ?? 0;

  await upsertPaymentDoc(paymentIntentId, {
    refundedAmountCents,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  logger.info("charge.refunded: recorded refund on payment doc", {
    paymentIntentId,
    refundedAmountCents,
  });
}

// ---------------------------------------------------------------------------
// Event handler: invoice.payment_succeeded
//
// Note: In Stripe API 2026-01-28.clover, invoice.subscription is removed.
// The subscription ID is now at invoice.parent.subscription_details.subscription.
// ---------------------------------------------------------------------------

async function handleInvoicePaymentSucceeded(
  invoice: Stripe.Invoice,
  stripeClient: Stripe,
): Promise<void> {
  const stripeSubscriptionId = getSubscriptionIdFromInvoice(invoice);

  if (!stripeSubscriptionId) {
    logger.warn("invoice.payment_succeeded: no subscription on invoice", {
      invoiceId: invoice.id,
    });
    return;
  }

  const db = admin.firestore();
  const subSnap = await db
    .collection("subscriptions")
    .where("stripeSubscriptionId", "==", stripeSubscriptionId)
    .limit(1)
    .get();

  if (subSnap.empty) {
    logger.warn("invoice.payment_succeeded: subscription not found", {
      stripeSubscriptionId,
    });
    return;
  }

  // Derive period end from the invoice line items (most accurate source in new API)
  const currentPeriodEnd =
    invoice.lines?.data?.[0]?.period?.end != null
      ? new Date(invoice.lines.data[0].period.end * 1000).toISOString()
      : new Date().toISOString();

  // W11: include lastUpdatedAt
  await subSnap.docs[0].ref.update({
    status: "active",
    currentPeriodEnd,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  logger.info("Subscription renewal succeeded", {
    stripeSubscriptionId,
    currentPeriodEnd,
  });

  // B10: propagate active status to all operator houses; clear grace period
  try {
    const subscription =
      await stripeClient.subscriptions.retrieve(stripeSubscriptionId);
    const operatorUid = await resolveOperatorUid(subscription);
    if (operatorUid) {
      await updateHouseSubscriptionStatus(
        operatorUid,
        "active",
        admin.firestore.FieldValue.delete(),
      );
    } else {
      logger.warn(
        "invoice.payment_succeeded: could not resolve operator uid for house update",
        { stripeSubscriptionId },
      );
    }
  } catch (err) {
    logger.error(
      "invoice.payment_succeeded: failed to update house subscription status",
      { stripeSubscriptionId, err: (err as Error).message },
    );
  }
}

// ---------------------------------------------------------------------------
// Event handler: invoice.payment_failed
// ---------------------------------------------------------------------------

async function handleInvoicePaymentFailed(
  invoice: Stripe.Invoice,
): Promise<void> {
  const stripeSubscriptionId = getSubscriptionIdFromInvoice(invoice);

  if (!stripeSubscriptionId) {
    logger.warn("invoice.payment_failed: no subscription on invoice", {
      invoiceId: invoice.id,
    });
    return;
  }

  const db = admin.firestore();
  const subSnap = await db
    .collection("subscriptions")
    .where("stripeSubscriptionId", "==", stripeSubscriptionId)
    .limit(1)
    .get();

  if (subSnap.empty) {
    logger.warn("invoice.payment_failed: subscription not found", {
      stripeSubscriptionId,
    });
    return;
  }

  const attemptCount: number = invoice.attempt_count ?? 1;
  const newStatus = attemptCount >= 3 ? "unpaid" : "past_due";

  const nextPaymentAttempt: number | null =
    invoice.next_payment_attempt ?? null;

  await subSnap.docs[0].ref.update({
    status: newStatus,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const subData = subSnap.docs[0].data() as SubscriptionDoc;

  let notifBody = `Your Regroup subscription payment failed.`;
  if (nextPaymentAttempt != null) {
    const retryDate = new Date(nextPaymentAttempt * 1000).toLocaleDateString();
    notifBody += ` Next retry: ${retryDate}.`;
  }
  if (newStatus === "unpaid") {
    notifBody += ` Your subscription is now unpaid. Please update your billing information immediately.`;
  }

  await sendFcmToHouseAdmins(
    subData.houseId,
    "Subscription Payment Failed",
    notifBody,
  );

  // B10: propagate past_due / unpaid status to all operator houses;
  // set guestGraceEndsAt to 48 hours from now to give guests time to resolve.
  if (subData.userId) {
    const graceEndsAt = new Date(
      Date.now() + 48 * 60 * 60 * 1000,
    ).toISOString();
    await updateHouseSubscriptionStatus(
      subData.userId,
      newStatus as HouseSubscriptionStatus,
      graceEndsAt,
    );
  } else {
    logger.warn(
      "invoice.payment_failed: userId missing from subscription doc, skipping house update",
      {
        stripeSubscriptionId,
      },
    );
  }
}

// ---------------------------------------------------------------------------
// Event handler: customer.subscription.deleted
// ---------------------------------------------------------------------------

async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription,
): Promise<void> {
  const db = admin.firestore();
  const subSnap = await db
    .collection("subscriptions")
    .where("stripeSubscriptionId", "==", subscription.id)
    .limit(1)
    .get();

  if (subSnap.empty) {
    logger.warn("customer.subscription.deleted: subscription not found", {
      stripeSubscriptionId: subscription.id,
    });
    return;
  }

  const canceledAt = subscription.canceled_at
    ? new Date(subscription.canceled_at * 1000).toISOString()
    : new Date().toISOString();

  await subSnap.docs[0].ref.update({
    status: "canceled",
    canceledAt,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const subData = subSnap.docs[0].data() as SubscriptionDoc;

  await sendFcmToHouseAdmins(
    subData.houseId,
    "Subscription Canceled",
    `Your Regroup subscription has been canceled as of ${canceledAt}. Contact support to reactivate.`,
  );

  // B10: propagate canceled status to all operator houses.
  const operatorUid = await resolveOperatorUid(subscription);
  if (operatorUid) {
    await updateHouseSubscriptionStatus(operatorUid, "canceled");
  } else {
    logger.warn(
      "customer.subscription.deleted: could not resolve operator uid for house update",
      { stripeSubscriptionId: subscription.id },
    );
  }
}

// ---------------------------------------------------------------------------
// Event handler: customer.subscription.updated
//
// Note: In Stripe API 2026-01-28.clover, Subscription.current_period_end was
// removed. We store the billing_cycle_anchor as a proxy for period info,
// or fall back to ISO date derived from the existing value in Firestore.
// ---------------------------------------------------------------------------

async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription,
): Promise<void> {
  const db = admin.firestore();
  const subSnap = await db
    .collection("subscriptions")
    .where("stripeSubscriptionId", "==", subscription.id)
    .limit(1)
    .get();

  if (subSnap.empty) {
    logger.warn("customer.subscription.updated: subscription not found", {
      stripeSubscriptionId: subscription.id,
    });
    return;
  }

  const doc = subSnap.docs[0];
  const previousData = doc.data() as SubscriptionDoc;

  const newStatus = subscription.status as SubscriptionDoc["status"];

  // billing_cycle_anchor is the best available date reference in the new API
  // for when the next billing cycle starts.
  const currentPeriodEnd = new Date(
    subscription.billing_cycle_anchor * 1000,
  ).toISOString();
  const planId = subscription.items.data[0]?.price?.id ?? previousData.planId;
  const guestCount = parseInt(
    (subscription.metadata?.guestCount as string | undefined) ??
      String(previousData.guestCount),
    10,
  );

  await doc.ref.update({
    status: newStatus,
    currentPeriodEnd,
    planId,
    guestCount: isNaN(guestCount) ? previousData.guestCount : guestCount,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Notify admin if subscription transitioned to past_due
  if (newStatus === "past_due" && previousData.status !== "past_due") {
    await sendFcmToHouseAdmins(
      previousData.houseId,
      "Subscription Past Due",
      "Your Regroup subscription is now past due. Please update your payment method to avoid service interruption.",
    );
  }

  // B10: propagate subscription status changes to all operator houses.
  const operatorUid = await resolveOperatorUid(subscription);
  if (operatorUid) {
    await updateHouseSubscriptionStatus(
      operatorUid,
      newStatus as HouseSubscriptionStatus,
    );
  } else {
    logger.warn(
      "customer.subscription.updated: could not resolve operator uid for house update",
      { stripeSubscriptionId: subscription.id },
    );
  }
}

// ---------------------------------------------------------------------------
// Event handler: account.updated (Stripe Connect)
// ---------------------------------------------------------------------------

async function handleAccountUpdated(account: Stripe.Account): Promise<void> {
  const house = await findHouseByStripeAccountId(account.id);

  if (!house) {
    logger.info("account.updated: no house found for account", {
      accountId: account.id,
    });
    return;
  }

  const chargesEnabled = account.charges_enabled === true;
  const payoutsEnabled = account.payouts_enabled === true;

  let newStatus: HouseDoc["stripeStatus"];
  if (chargesEnabled && payoutsEnabled) {
    newStatus = "active";
  } else if (
    account.requirements?.disabled_reason ||
    (account.requirements?.currently_due &&
      account.requirements.currently_due.length > 0)
  ) {
    newStatus = "restricted";
  } else {
    newStatus = "pending";
  }

  const previousStatus = house.data.stripeStatus;

  const requirements: string[] = [
    ...(account.requirements?.currently_due ?? []),
    ...(account.requirements?.eventually_due ?? []),
  ];

  const db = admin.firestore();
  await db.collection("houses").doc(house.id).update({
    stripeStatus: newStatus,
    stripeChargesEnabled: chargesEnabled,
    stripePayoutsEnabled: payoutsEnabled,
    stripeRequirements: requirements,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Notify if account went from active to restricted
  if (previousStatus === "active" && newStatus === "restricted") {
    await sendFcmToHouseAdmins(
      house.id,
      "Stripe Account Restricted",
      "Your Stripe account has been restricted. Please complete the required verification steps to restore payment processing.",
    );
  }
}

// ---------------------------------------------------------------------------
// Event handler: payout.failed (Stripe Connect)
// ---------------------------------------------------------------------------

async function handlePayoutFailed(
  payout: Stripe.Payout,
  accountId: string | undefined,
): Promise<void> {
  // accountId comes from event.account (the connected account)
  if (!accountId) {
    logger.warn("payout.failed: no account id on event");
    return;
  }

  const house = await findHouseByStripeAccountId(accountId);
  if (!house) {
    logger.warn("payout.failed: no house found for account", { accountId });
    return;
  }

  const amountDollars = payout.amount / 100;
  const reason =
    payout.failure_message ?? payout.failure_code ?? "Unknown reason";

  await sendFcmToHouseAdmins(
    house.id,
    "Payout Failed",
    `A payout of $${amountDollars.toFixed(
      2,
    )} to your bank account failed: ${reason}. Please check your Stripe dashboard.`,
  );
}

// ---------------------------------------------------------------------------
// Idempotency — wrapped in a Firestore transaction to prevent race conditions
// Returns true if this event was already processed (skip further handling)
// ---------------------------------------------------------------------------

async function checkAndMarkEventProcessed(
  eventId: string,
  eventType: string,
): Promise<boolean> {
  const db = admin.firestore();
  const eventRef = db.collection("webhookEvents").doc(eventId);

  return await db.runTransaction(async (txn) => {
    const snap = await txn.get(eventRef);
    if (snap.exists) {
      return true; // already processed
    }
    txn.set(eventRef, {
      eventId,
      type: eventType,
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return false; // not yet processed
  });
}

// ---------------------------------------------------------------------------
// Main exported webhook handler
// ---------------------------------------------------------------------------

export const stripeWebhook = onRequest(
  {
    secrets: [
      STRIPE_SECRET_KEY,
      STRIPE_WEBHOOK_SECRET,
      STRIPE_TEST_WEBHOOK_SECRET,
      SENDGRID_API_KEY,
    ],
  },
  async (req, res) => {
    // Only accept POST
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    // -------------------------------------------------------------------------
    // 2. Signature verification (CRITICAL — uses raw body)
    // -------------------------------------------------------------------------
    const sig = req.headers["stripe-signature"];

    if (!sig) {
      logger.warn("stripeWebhook: missing stripe-signature header");
      res.status(400).send("Webhook Error: Missing stripe-signature header");
      return;
    }

    // Resolved after the request is validated. No secret configured at all is
    // server misconfiguration, so it answers 500 — which Stripe retries — rather
    // than letting constructEvent report it as a bad signature and blame the
    // sender.
    let candidates: WebhookSecretCandidate[];
    try {
      candidates = webhookSecretCandidates("platform");
    } catch (err) {
      logger.error("stripeWebhook: webhook secret unavailable", {
        err: (err as Error).message,
      });
      res.status(500).send("Webhook Error: endpoint not configured");
      return;
    }

    // Selection then mode authorization — util/verifyStripeWebhook.ts owns why,
    // util/stripeWebhookSecrets.ts owns why there is a list at all.
    // req.rawBody is provided by Firebase Cloud Functions for onRequest handlers.
    const verification = verifyStripeWebhook({
      stripe: getStripe(),
      rawBody: req.rawBody,
      signature: sig,
      candidates,
    });

    if (!verification.ok) {
      // Full detail server-side, one sanitized sentence to the caller. The
      // response must not reveal which secrets are configured, which one
      // verified, or what mode this deployment runs in.
      logger.warn(`stripeWebhook: rejected (${verification.reason})`, {
        ...verification.detail,
      });
      res.status(400).send("Webhook Error: signature verification failed");
      return;
    }

    const event = verification.event;

    // INFO, not debug: neighbouring lifecycle lines are INFO and failures WARN,
    // so at a default severity>=DEFAULT Logs Explorer filter a debug line here
    // would drop exactly the record of which mode's secret verified.
    logger.info("stripeWebhook: signature verified", {
      verifiedWith: verification.verifiedWith,
      mode: verification.mode,
    });

    // -------------------------------------------------------------------------
    // 3. Idempotency check (transaction-safe)
    // -------------------------------------------------------------------------
    let alreadyProcessed: boolean;
    try {
      alreadyProcessed = await checkAndMarkEventProcessed(event.id, event.type);
    } catch (err) {
      // If idempotency check itself fails, we log and continue processing
      // (better to process twice than to miss an event)
      logger.error("stripeWebhook: idempotency check failed", {
        eventId: event.id,
        err: (err as Error).message,
      });
      alreadyProcessed = false;
    }

    if (alreadyProcessed) {
      logger.info("stripeWebhook: duplicate event ignored", {
        eventId: event.id,
        type: event.type,
      });
      res.status(200).send({ received: true, duplicate: true });
      return;
    }

    // -------------------------------------------------------------------------
    // 4. Route to event-specific handler
    // -------------------------------------------------------------------------
    logger.info("stripeWebhook: processing event", {
      eventId: event.id,
      type: event.type,
    });

    try {
      switch (event.type) {
        // --- Payment events (Stripe Connect) ---
        case "payment_intent.succeeded":
          await handlePaymentIntentSucceeded(
            event.data.object as Stripe.PaymentIntent,
          );
          break;

        case "payment_intent.payment_failed":
          await handlePaymentIntentFailed(
            event.data.object as Stripe.PaymentIntent,
          );
          break;

        case "charge.dispute.created":
          await handleDisputeCreated(
            event.data.object as Stripe.Dispute,
            getStripe(),
          );
          break;

        case "charge.refunded":
          await handleChargeRefunded(event.data.object as Stripe.Charge);
          break;

        // --- Subscription events (RATS platform) ---
        case "invoice.payment_succeeded":
          await handleInvoicePaymentSucceeded(
            event.data.object as Stripe.Invoice,
            getStripe(),
          );
          break;

        case "invoice.payment_failed":
          await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
          break;

        case "customer.subscription.deleted":
          await handleSubscriptionDeleted(
            event.data.object as Stripe.Subscription,
          );
          break;

        case "customer.subscription.updated":
          await handleSubscriptionUpdated(
            event.data.object as Stripe.Subscription,
          );
          break;

        // --- Stripe Connect account events ---
        case "account.updated":
          await handleAccountUpdated(event.data.object as Stripe.Account);
          break;

        case "payout.failed":
          await handlePayoutFailed(
            event.data.object as Stripe.Payout,
            event.account ?? undefined,
          );
          break;

        default:
          logger.info("stripeWebhook: unhandled event type (ignored)", {
            type: event.type,
          });
      }
    } catch (err) {
      // Per Stripe best practices: return 200 so Stripe does not retry infinitely.
      // The idempotency record has already been written, so we log the error for
      // ops investigation without triggering a retry storm.
      logger.error("stripeWebhook: event handler threw an error", {
        eventId: event.id,
        type: event.type,
        err: (err as Error).message,
        stack: (err as Error).stack,
      });
    }

    res.status(200).send({ received: true });
  },
);

// ---------------------------------------------------------------------------
// handleStripeConnectWebhook
//
// Receives Stripe Connect account events sent to a separate webhook endpoint.
// Uses STRIPE_CONNECT_WEBHOOK_SECRET (distinct from the platform webhook secret)
// so Connect events are verified and routed independently.
//
// Handled event types:
//   account.updated              — syncs Connect account status to Firestore
//   account.application.deauthorized — marks house Stripe account as disconnected
// ---------------------------------------------------------------------------

async function handleAccountDeauthorized(accountId: string): Promise<void> {
  const house = await findHouseByStripeAccountId(accountId);
  if (!house) {
    logger.warn(
      "account.application.deauthorized: no house found for account",
      { accountId },
    );
    return;
  }

  const db = admin.firestore();
  await db
    .collection("houses")
    .doc(house.id)
    .update({
      stripeStatus: "disconnected" as HouseDoc["stripeStatus"],
      stripeChargesEnabled: false,
      stripePayoutsEnabled: false,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

  logger.info(
    "account.application.deauthorized: house Stripe account disconnected",
    {
      accountId,
      houseId: house.id,
    },
  );
}

export const handleStripeConnectWebhook = onRequest(
  {
    secrets: [
      STRIPE_SECRET_KEY,
      STRIPE_CONNECT_WEBHOOK_SECRET,
      STRIPE_CONNECT_TEST_WEBHOOK_SECRET,
    ],
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const sig = req.headers["stripe-signature"];
    if (!sig) {
      logger.warn(
        "handleStripeConnectWebhook: missing stripe-signature header",
      );
      res.status(400).send("Webhook Error: Missing stripe-signature header");
      return;
    }
    let connectCandidates: WebhookSecretCandidate[];
    try {
      connectCandidates = webhookSecretCandidates("connect");
    } catch (err) {
      logger.error("handleStripeConnectWebhook: webhook secret unavailable", {
        err: (err as Error).message,
      });
      res.status(500).send("Webhook Error: endpoint not configured");
      return;
    }

    // Same helper, same guarantees as the platform handler above.
    const verification = verifyStripeWebhook({
      stripe: getStripe(),
      rawBody: req.rawBody,
      signature: sig,
      candidates: connectCandidates,
    });

    if (!verification.ok) {
      logger.warn(
        `handleStripeConnectWebhook: rejected (${verification.reason})`,
        { ...verification.detail },
      );
      res.status(400).send("Webhook Error: signature verification failed");
      return;
    }

    const event = verification.event;

    logger.info("handleStripeConnectWebhook: signature verified", {
      verifiedWith: verification.verifiedWith,
      mode: verification.mode,
    });

    logger.info("handleStripeConnectWebhook: processing Connect event", {
      eventId: event.id,
      type: event.type,
    });

    // Idempotency check (transaction-safe) — Stripe retries Connect events, and
    // replaying account.application.deauthorized after a reconnect would wrongly
    // disconnect a re-onboarded account. Mirrors the platform webhook handler.
    let alreadyProcessed: boolean;
    try {
      alreadyProcessed = await checkAndMarkEventProcessed(event.id, event.type);
    } catch (err) {
      logger.error("handleStripeConnectWebhook: idempotency check failed", {
        eventId: event.id,
        err: (err as Error).message,
      });
      alreadyProcessed = false;
    }

    if (alreadyProcessed) {
      logger.info("handleStripeConnectWebhook: duplicate event ignored", {
        eventId: event.id,
        type: event.type,
      });
      res.status(200).send({ received: true, duplicate: true });
      return;
    }

    try {
      switch (event.type) {
        case "account.updated":
          await handleAccountUpdated(event.data.object as Stripe.Account);
          break;

        case "account.application.deauthorized":
          // For Connect deauthorization, the connected account ID is on
          // event.account (not the data object, which is a Stripe.Application).
          await handleAccountDeauthorized(event.account ?? "");
          break;

        default:
          logger.info(
            "handleStripeConnectWebhook: unhandled Connect event type (ignored)",
            {
              type: event.type,
            },
          );
      }
    } catch (err) {
      logger.error("handleStripeConnectWebhook: event handler threw an error", {
        eventId: event.id,
        type: event.type,
        err: (err as Error).message,
        stack: (err as Error).stack,
      });
    }

    res.status(200).send({ received: true });
  },
);
