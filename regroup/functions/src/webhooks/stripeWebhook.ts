import * as admin from "firebase-admin";
import Stripe from "stripe";
import { createStripeClient, isResourceMissing } from "../util/stripe";
import { fetchConnectAccountStatus } from "../util/connectAccountStatus";

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
import { Cents } from "../util/money";

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
  rentOwed?: Cents;
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
      // Without createdAt this document falls out of every query: getPaymentHistory
      // orders by it (mobile/src/services/payments.ts:191) and analytics filters
      // on inWindow(toDateStr(createdAt)) (callable/analytics.ts:168), and both
      // exclude a document missing the field. The consequence differs by which
      // key is absent: with a houseId the payment counts toward that house's
      // collected revenue, unattributed to any resident, and trips the
      // duePaymentCount < paymentCount caveat; with a guestId it restores the
      // payment to that resident's history. Collected revenue is a house-level
      // total and the house did receive the money, so counting it is correct.
      // The on-time rate excludes it by design, for want of a dueDate
      // (analytics.ts:187-191).
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return;
  }

  const db = admin.firestore();

  // Stripe amounts are in the currency's smallest unit, NOT always cents: JPY is
  // zero-decimal, so `amount: 50000` is ¥50,000 (about $335), not $500. rentOwed
  // is USD cents and is decremented by this figure with no conversion, so a
  // non-USD payment would clear a far larger balance than it paid. Refuse rather
  // than guess a rate.
  if (paymentIntent.currency !== "usd") {
    logger.error("stripeWebhook: refusing a non-USD payment on the rent ledger", {
      paymentIntentId: paymentIntent.id,
      currency: paymentIntent.currency,
    });
    // The funds are already captured — payment_intent.succeeded fires post-capture.
    // The throw below is permanent, so the event is marked done and Stripe never
    // redelivers: if we do not record the payment here, nothing anywhere records
    // it. Refusing to APPLY the payment and refusing to RECORD it are separate
    // decisions and only the first one is correct.
    //
    // This block must stay terminal. `reconciledAt: null` below is what makes the
    // record visible to the daily sweep, but it also overwrites an operator's
    // resolution timestamp. That is safe only because nothing re-enters here: the
    // PermanentWebhookError is caught in the dispatcher, which falls through to
    // markEventDone, and later deliveries short-circuit in claimEvent. If this
    // path is ever made to retry, make `reconciledAt` conditional first.
    await upsertPaymentDoc(paymentIntent.id, {
      stripePaymentIntentId: paymentIntent.id,
      // Deliberately not `amount`. That field is NOT consistently scaled:
      // stripeWebhook writes dollars, while mobile's recordManualPayment
      // (src/services/payments.ts:263) writes cents, and analytics.ts:172
      // multiplies every row by 100 assuming dollars — so manual payments
      // already report 100x. Tracked separately; do not add to it here.
      // Minor units are unambiguous.
      amountMinorUnits: paymentIntent.amount,
      currency: paymentIntent.currency,
      status: "succeeded",
      houseId,
      guestId,
      rentApplied: false,
      needsManualReconciliation: true,
      refusedReason: "unsupported_currency",
      // Null, not absent: the reconciliation sweep queries reconciledAt == null,
      // which only matches a field that exists. An operator resolves the
      // record by setting this to a timestamp.
      reconciledAt: null,
      // Without createdAt this doc is invisible: analytics filters on
      // inWindow(toDateStr(createdAt)) which is false for undefined, and
      // getPaymentHistory orders by createdAt, which Firestore uses to
      // exclude documents missing the field. A quarantine record nobody can
      // query is not a quarantine record.
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    throw new PermanentWebhookError(
      `Unsupported currency ${paymentIntent.currency} on the rent ledger`,
    );
  }

  const amountDollars = paymentIntent.amount / 100;
  const amountCents = paymentIntent.amount;

  // 1. Write the payment record FIRST, before anything that can fail.
  // Refusing to apply a payment and refusing to record it are separate
  // decisions — the same principle the currency guard above applies. The guest
  // read below propagates on failure (500, claim released, Stripe retries),
  // and across a long outage that window is time the resident's history shows
  // nothing for a captured card. dueDate is not known yet; it rides on the
  // transaction's existing txn.set below, costing no extra write.
  await upsertPaymentDoc(paymentIntent.id, {
    stripePaymentIntentId: paymentIntent.id,
    houseId,
    guestId,
    amount: amountDollars,
    currency: paymentIntent.currency,
    status: "succeeded",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Read the guest once up front so we can both (a) capture the due date active
  // when this payment posted and (b) reuse the snapshot for the rentOwed
  // decrement + notifications below. (#34 on-time rate)
  const guestRef = db.collection("guests").doc(guestId);
  // Let a read failure propagate. It is transient, so isPermanent() is false and
  // the caller returns 500 and releases the claim for Stripe to retry. Swallowing
  // it left guestSnap undefined, which skipped the rentOwed decrement below while
  // the handler still returned successfully — so the event was marked done, Stripe
  // was told 200, and the charge was lost with only a warn to find it by.
  // Retrying is safe: rentApplied lives on paymentRef, which is in the decrement
  // transaction's read set, so concurrent runs conflict and re-run.
  const guestSnap = await guestRef.get();

  // dueDate is the guest's rentDueDate at charge time. This is an approximation:
  // it reflects the due date *active when the payment posted* (the best available
  // signal — no per-charge due-date schedule history exists). Omitted when the
  // guest has no rentDueDate or the read failed.
  const guestDataForDueDate = guestSnap.exists
    ? (guestSnap.data() as GuestDoc)
    : undefined;
  const dueDate =
    typeof guestDataForDueDate?.rentDueDate === "string" &&
    guestDataForDueDate.rentDueDate.length > 0
      ? guestDataForDueDate.rentDueDate
      : undefined;

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

  // 2. Decrement guest rentOwed (integer cents), exactly once per PaymentIntent.
  //
  // FieldValue.increment is atomic against concurrent writers but NOT idempotent:
  // applying it twice for one payment credits the resident twice and the house
  // loses the difference. Stripe can deliver the same event more than once, and
  // a retry after a partial failure would re-enter this handler, so the guard
  // has to live in the data, not in the delivery path.
  //
  // The payments/{paymentIntentId} doc is the marker: a transaction reads it,
  // skips if rentApplied is already set, and otherwise decrements and sets the
  // flag in the same commit. The doc is keyed by PaymentIntent id and is already
  // written by upsertPaymentDoc in step 1 above, so this adds no new collection.
  if (!guestSnap.exists) {
    // A successful read reporting exists:false is permanent — retrying for three
    // days accomplishes nothing. Only a failed READ (above) is retried.
    logger.warn("payment_intent.succeeded: guest not found", { guestId });
    // Quarantine: the payment was captured but rentOwed was never decremented.
    // Without these keys the record is invisible to reportPaymentsNeedingReconciliation.
    // reconciledAt: null is mandatory — the sweep's == null clause matches an
    // existing null field, never a missing one. createdAt was set in step 1.
    //
    // This block must stay terminal. `reconciledAt: null` overwrites an
    // operator's resolution timestamp, which is safe only because nothing
    // re-enters here: the handler falls through to markEventDone and later
    // deliveries short-circuit in claimEvent. If this branch is ever made to
    // throw and retry, make `reconciledAt` conditional first.
    await upsertPaymentDoc(paymentIntent.id, {
      needsManualReconciliation: true,
      refusedReason: "guest_missing",
      reconciledAt: null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } else {
    const guestData = guestSnap.data() as GuestDoc;

    const paymentRef = db.collection("payments").doc(paymentIntent.id);
    const applied = await db.runTransaction(async (txn) => {
      const paymentSnap = await txn.get(paymentRef);
      if (paymentSnap.exists && paymentSnap.get("rentApplied") === true) {
        return false;
      }
      txn.update(guestRef, {
        rentOwed: admin.firestore.FieldValue.increment(-amountCents),
      });
      txn.set(
        paymentRef,
        {
          rentApplied: true,
          rentAppliedAmountCents: amountCents,
          ...(dueDate ? { dueDate } : {}),
        },
        { merge: true },
      );
      return true;
    });

    if (!applied) {
      logger.info(
        "payment_intent.succeeded: rentOwed already applied, skipping",
        { paymentIntentId: paymentIntent.id, guestId },
      );
    }

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

/**
 * account.updated is a TRIGGER, not a source of truth.
 *
 * A v2 account emits both v1 snapshot events and v2 thin events, and the v1
 * `account.updated` snapshot still carries charges_enabled / payouts_enabled —
 * which are false on a perfectly healthy recipient. Reading them off the
 * payload is what let a working house sit at `pending`. So the event tells us
 * *that* something changed and for which account; the authoritative state comes
 * from a v2 read of the recipient capability.
 */
async function handleAccountUpdated(accountId: string): Promise<void> {
  const house = await findHouseByStripeAccountId(accountId);

  if (!house) {
    logger.info("account.updated: no house found for account", {
      accountId,
    });
    return;
  }

  const previousStatus = house.data.stripeStatus;
  const db = admin.firestore();

  let newStatus: HouseDoc["stripeStatus"];
  let chargesEnabled: boolean;
  let payoutsEnabled: boolean;
  let requirements: string[];

  try {
    const accountStatus = await fetchConnectAccountStatus(
      getStripe(),
      accountId,
    );
    newStatus = accountStatus.status;
    // Both columns answer the same question for a recipient: can transfers
    // land? Kept because the mobile client renders a row from each.
    chargesEnabled = accountStatus.transfersEnabled;
    payoutsEnabled = accountStatus.transfersEnabled;
    requirements = Array.from(
      new Set([
        ...accountStatus.currentlyDue,
        ...accountStatus.pastDue,
        ...accountStatus.eventuallyDue,
      ]),
    );
  } catch (err) {
    if (!isResourceMissing(err)) {
      // Transient or unexpected. Rethrow so the dispatcher releases the event
      // for retry rather than recording a status we could not read.
      throw err;
    }
    // The account is genuinely gone. Leaving the house at its previous status
    // would strand it as `active` forever, which is the one state that lets
    // rent collection attempt a transfer into nothing.
    logger.warn("account.updated: account no longer exists, marking house disconnected", {
      accountId,
      previousStatus,
    });
    newStatus = "disconnected";
    chargesEnabled = false;
    payoutsEnabled = false;
    requirements = [];
  }

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

/**
 * A refusal that re-delivery can never fix — a non-USD payment on a USD ledger,
 * say. The idempotency marker stands and Stripe is answered 200, because
 * retrying for three days is noise rather than recovery. Anything else is
 * treated as transient and retried.
 */
export class PermanentWebhookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentWebhookError";
  }
}

/**
 * `instanceof` alone is unreliable across duplicate module instances (src vs the
 * compiled lib), structured clone, or a wrap-and-rethrow, and the misclassification
 * cost is asymmetric: treating a permanent refusal as transient costs three days of
 * harmless retries, while treating a transient failure as permanent loses money.
 */
function isPermanent(err: unknown): boolean {
  return (
    err instanceof PermanentWebhookError ||
    (err as Error)?.name === "PermanentWebhookError"
  );
}

/**
 * How long a `processing` claim is honoured before another delivery may take it
 * over. Comfortably longer than any single invocation, far shorter than Stripe's
 * ~3-day retry horizon, so a crashed invocation self-heals on a later retry.
 */
const CLAIM_STALE_MS = 10 * 60 * 1000;

type ClaimOutcome = "done" | "in_flight" | "claimed";

/**
 * Two-phase idempotency claim.
 *
 * An earlier version marked the event processed up front and deleted the marker
 * if the handler threw. That delete is the weak link: a Firestore outage causes
 * the handler throw AND the delete failure together, leaving the event claimed
 * forever — Stripe's retry then sees a duplicate, gets 200, and the payment is
 * lost exactly as before the fix.
 *
 * So the marker now carries a status instead of merely existing:
 *   - `done`       — finished, or deliberately refused. Later deliveries skip it.
 *   - `processing` — a delivery is working on it. A concurrent delivery backs off
 *                    (500, so Stripe retries later) rather than reporting success.
 *                    Reclaimable once older than CLAIM_STALE_MS.
 *   - `failed`     — the handler threw. Immediately reclaimable.
 *
 * The failure path still writes, but if that write fails the doc simply stays
 * `processing` and becomes reclaimable when it goes stale. The degraded outcome
 * is "retried later" rather than "lost permanently".
 */
async function claimEvent(
  eventId: string,
  eventType: string,
): Promise<ClaimOutcome> {
  const db = admin.firestore();
  const eventRef = db.collection("webhookEvents").doc(eventId);

  return await db.runTransaction(async (txn) => {
    const snap = await txn.get(eventRef);

    if (snap.exists) {
      const status = snap.get("status");

      // Legacy markers predate the status field; treat a bare marker as done so
      // previously-processed events are never replayed.
      if (status === undefined || status === "done") {
        return "done";
      }

      if (status === "processing") {
        const claimedAtMs = snap.get("claimedAtMs");
        const fresh =
          typeof claimedAtMs === "number" &&
          Date.now() - claimedAtMs < CLAIM_STALE_MS;
        if (fresh) {
          return "in_flight";
        }
      }
      // `failed`, or a stale `processing` claim: fall through and reclaim.
    }

    txn.set(eventRef, {
      eventId,
      type: eventType,
      status: "processing",
      claimedAtMs: Date.now(),
      claimedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return "claimed";
  });
}

/** Marks the claim finished so later deliveries skip the event. */
async function markEventDone(eventId: string): Promise<void> {
  try {
    await admin
      .firestore()
      .collection("webhookEvents")
      .doc(eventId)
      .set(
        {
          status: "done",
          doneAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
  } catch (err) {
    // The work succeeded; only the bookkeeping failed. The claim goes stale and
    // a later delivery may reprocess, which the per-payment rentApplied
    // transaction makes safe.
    logger.error("stripeWebhook: failed to mark the event done", {
      eventId,
      err: (err as Error).message,
    });
  }
}

/** Releases the claim after a transient failure so a retry can pick it up. */
async function markEventFailed(eventId: string): Promise<boolean> {
  try {
    await admin
      .firestore()
      .collection("webhookEvents")
      .doc(eventId)
      .set({ status: "failed" }, { merge: true });
    return true;
  } catch (err) {
    // Not fatal: the claim stays `processing` and becomes reclaimable once
    // stale, so the event is retried later rather than lost.
    logger.error("stripeWebhook: failed to release the claim; relying on staleness", {
      eventId,
      err: (err as Error).message,
    });
    return false;
  }
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
    let outcome: ClaimOutcome;
    try {
      outcome = await claimEvent(event.id, event.type);
    } catch (err) {
      // If idempotency check itself fails, we log and continue processing
      // (better to process twice than to miss an event)
      logger.error("stripeWebhook: idempotency check failed", {
        eventId: event.id,
        err: (err as Error).message,
      });
      outcome = "claimed";
    }

    if (outcome === "in_flight") {
      // Another delivery of this same event is mid-flight. Answering 200 here
      // would tell Stripe the work is done while the in-flight attempt may still
      // fail, so ask for a retry instead.
      logger.info("stripeWebhook: event already in flight, asking for a retry", {
        eventId: event.id,
        type: event.type,
      });
      res.status(409).send({ error: "event in flight" });
      return;
    }

    if (outcome === "done") {
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
          await handleAccountUpdated(
            (event.data.object as Stripe.Account).id,
          );
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
      if (!isPermanent(err)) {
        // Transient. The claim was taken before the handler ran, so answering
        // 200 here would lose a real payment permanently.
        const released = await markEventFailed(event.id);
        logger.error("stripeWebhook: event handler threw, released for retry", {
          eventId: event.id,
          type: event.type,
          released,
          err: (err as Error).message,
          stack: (err as Error).stack,
        });
        res.status(500).send({ error: "handler failed" });
        return;
      }
      // Re-delivery can never succeed, so fall through: the claim is marked done
      // below and Stripe is told to stop rather than retry for three days.
      logger.error("stripeWebhook: refused the event", {
        eventId: event.id,
        type: event.type,
        err: (err as Error).message,
      });
    }

    await markEventDone(event.id);
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
    let outcome: ClaimOutcome;
    try {
      outcome = await claimEvent(event.id, event.type);
    } catch (err) {
      logger.error("handleStripeConnectWebhook: idempotency check failed", {
        eventId: event.id,
        err: (err as Error).message,
      });
      outcome = "claimed";
    }

    if (outcome === "in_flight") {
      // Another delivery of this same event is mid-flight. Answering 200 here
      // would tell Stripe the work is done while the in-flight attempt may still
      // fail, so ask for a retry instead.
      logger.info("stripeWebhook: event already in flight, asking for a retry", {
        eventId: event.id,
        type: event.type,
      });
      res.status(409).send({ error: "event in flight" });
      return;
    }

    if (outcome === "done") {
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
          await handleAccountUpdated(
            (event.data.object as Stripe.Account).id,
          );
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
      if (!isPermanent(err)) {
        const released = await markEventFailed(event.id);
        logger.error(
          "handleStripeConnectWebhook: event handler threw, released for retry",
          {
            eventId: event.id,
            type: event.type,
            released,
            err: (err as Error).message,
            stack: (err as Error).stack,
          },
        );
        res.status(500).send({ error: "handler failed" });
        return;
      }
      logger.error("handleStripeConnectWebhook: refused the event", {
        eventId: event.id,
        type: event.type,
        err: (err as Error).message,
      });
    }

    await markEventDone(event.id);
    res.status(200).send({ received: true });
  },
);
