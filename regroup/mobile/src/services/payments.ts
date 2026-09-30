/**
 * Payment Service
 *
 * Handles rent payment operations for guests/residents.
 * Calls Firebase Cloud Functions for Stripe payment intents,
 * reads/writes the 'payments' Firestore collection, and provides
 * CF-backed listing for the payments dashboard.
 */
import { firestore, functions } from "../../firebase-setup";
import FirebaseFirestore from "@react-native-firebase/firestore";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Legacy Firestore-backed rent payment record written by recordRentPayment. */
export interface RentPayment {
  id: string;
  guestId: string;
  houseId: string;
  /** Amount in US cents (e.g., 50000 = $500.00). Matches Stripe convention. */
  amount: number;
  status: "pending" | "succeeded" | "failed" | "resolved_offline";
  createdAt: string;
  stripePaymentIntentId?: string;
  description?: string; // e.g. 'Monthly Rent', 'Chore Fee'
}

/** Result returned by the 'createPaymentIntent' Cloud Function. */
export interface CreatePaymentIntentResult {
  clientSecret: string;
  /** @deprecated Server does not return this field. Kept for PaymentWebView compat. */
  paymentUrl?: string;
  /** @deprecated Server does not return this field. */
  paymentIntentId?: string;
}

/** CF-backed payment record used by the payments dashboard. */
export interface PaymentRecord {
  id: string;
  amount: number;
  currency: string;
  status: "succeeded" | "pending" | "failed";
  description: string;
  createdAt: string;
  receiptUrl?: string;
}

export interface HousePaymentRecord extends PaymentRecord {
  guestId: string | null;
  houseId: string;
}

// ─── Firestore collection ─────────────────────────────────────────────────────

export const paymentsCollection = firestore.collection("payments");

// ─── Legacy Firestore-backed service functions ────────────────────────────────

/**
 * Call the 'createPaymentIntent' Cloud Function to initiate a Stripe payment.
 *
 * @param guestId - Firestore guest document ID
 * @param houseId - Firestore house document ID
 * @param amountInCents - Payment amount in US cents (e.g., 50000 for $500.00).
 *   Stripe requires amounts in the smallest currency unit.
 */
/** $100,000. Sanity bound against accidental dollar-vs-cent errors. */
export const MAX_PAYMENT_CENTS = 10000000;

export interface CreateRentPaymentIntentParams {
  guestId: string;
  houseId: string;
  /** Amount in US cents (e.g. 50000 for $500.00). */
  amountInCents: number;
  description?: string;
}

/**
 * Create a Stripe PaymentIntent for a resident rent payment.
 *
 * Takes an object rather than positional arguments deliberately. This replaced
 * two wrappers over the same `createPaymentIntent` callable whose argument
 * orders disagreed — (guestId, houseId, amount) versus (amount, guestId,
 * houseId) — so a call written against one and resolved against the other
 * passed an id as the amount. An object makes that class of error impossible.
 */
export async function createRentPaymentIntent({
  guestId,
  houseId,
  amountInCents,
  description,
}: CreateRentPaymentIntentParams): Promise<CreatePaymentIntentResult> {
  if (!Number.isInteger(amountInCents) || amountInCents <= 0) {
    throw new Error(
      `Invalid payment amount: ${amountInCents}. Must be a positive integer (cents).`
    );
  }
  if (amountInCents > MAX_PAYMENT_CENTS) {
    throw new Error(
      `Payment amount ${amountInCents} exceeds maximum (${MAX_PAYMENT_CENTS} cents / $100,000).`
    );
  }
  const response = await functions.httpsCallable("createPaymentIntent")({
    amount: amountInCents,
    guestId,
    houseId,
    description,
  });
  return response.data as CreatePaymentIntentResult;
}

/**
 * Write an optimistic payment record to Firestore immediately after the
 * guest initiates the payment flow.  The actual status update (pending →
 * completed / failed) will arrive via a Stripe webhook handled by a Cloud
 * Function.
 *
 * When `stripePaymentIntentId` is provided, the record is written at
 * `payments/{stripePaymentIntentId}` — the same document ID the webhook's
 * `upsertPaymentDoc` writes to (see functions/src/webhooks/stripeWebhook.ts).
 * This is deliberate, not incidental: it lets the webhook's `set(..., {merge:
 * true})` land on this exact optimistic record and turn it into the
 * authoritative one, instead of creating a second, permanently-orphaned
 * "pending" document that never gets reconciled with the real payment.
 *
 * Hardened 2026-07-07: this used to be a plain `docRef.set(payment)` with a
 * hardcoded `status: "pending"` — not `{merge: true}`, and with no read of
 * the existing doc first. `presentPaymentSheet()` resolving on the client
 * only proves Stripe confirmed the charge; it races the webhook, which can
 * land first and mark this same doc "succeeded". The old plain `set()` would
 * then overwrite the whole document back to "pending", clobbering any
 * webhook-only fields (e.g. receiptUrl) — a paid charge would show
 * perpetually pending. Now runs in a transaction: if the webhook already
 * moved the status past "pending", leave it alone entirely.
 */
export async function recordRentPayment(
  guestId: string,
  houseId: string,
  amount: number,
  description: string = "Rent Payment",
  stripePaymentIntentId?: string
): Promise<RentPayment> {
  const docRef = stripePaymentIntentId
    ? paymentsCollection.doc(stripePaymentIntentId)
    : paymentsCollection.doc();

  return firestore.runTransaction(async (transaction) => {
    const snap = await transaction.get(docRef);
    const existing = snap.exists ? (snap.data() as RentPayment) : undefined;

    if (existing && existing.status !== "pending") {
      // The webhook already made this record authoritative — don't
      // downgrade it back to pending.
      return existing;
    }

    const payment: RentPayment = {
      id: docRef.id,
      guestId,
      houseId,
      amount,
      status: "pending",
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      description,
      stripePaymentIntentId,
    };
    transaction.set(docRef, payment, { merge: true });
    return payment;
  });
}

/**
 * Extracts the Stripe PaymentIntent ID from a PaymentIntent client secret.
 * Client secrets are always formatted as `{paymentIntentId}_secret_{secret}`
 * — this is a stable, documented part of Stripe's client-secret format, not
 * an implementation detail that could silently change.
 */
export function paymentIntentIdFromClientSecret(clientSecret: string): string {
  return clientSecret.split("_secret_")[0];
}

/**
 * Fetch payment history for a guest from the 'payments' Firestore collection.
 * Results are sorted newest-first.
 */
export async function getPaymentHistory(
  guestId: string,
  limit = 100
): Promise<RentPayment[]> {
  const snapshot = await paymentsCollection
    .where("guestId", "==", guestId)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  if (!snapshot.docs.length) {
    return [];
  }
  return snapshot.docs.map((doc) => doc.data() as RentPayment);
}

// ─── CF-backed service functions ──────────────────────────────────────────────

/**
 * @param amountInCents - Amount in US cents (e.g., 50000 for $500.00)
 */
export async function listPayments(
  guestId: string,
  houseId: string,
  limit = 20
): Promise<PaymentRecord[]> {
  const result = await functions.httpsCallable("listPayments")({
    guestId,
    houseId,
    limit,
  });
  return (result.data as any).payments;
}

export async function listHousePayments(
  houseId: string,
  limit = 100
): Promise<HousePaymentRecord[]> {
  const result = await functions.httpsCallable("listHousePayments")({
    houseId,
    limit,
  });
  return (result.data as any).payments;
}

/**
 * Write a manual (cash/check/Venmo/Zelle) payment record directly to Firestore,
 * and decrement the guest's rentOwed balance to match.
 *
 * Hardened 2026-07-05: this function used to only write the `payments` doc —
 * it never touched `guests.rentOwed`, unlike the Stripe webhook path
 * (functions/src/webhooks/stripeWebhook.ts's handlePaymentIntentSucceeded),
 * which does `rentOwed: FieldValue.increment(-amountCents)`. A resident whose
 * cash/check payment was recorded by staff stayed listed as "Overdue"
 * forever. The decrement below matches the webhook's exact convention
 * (rentOwed only, not choreFees — consistent with how the existing Stripe
 * path already treats a single combined charge).
 *
 * @param amountInCents - Amount in US cents (e.g., 50000 for $500.00).
 *   Callers must convert from dollars before calling this function.
 */
export async function recordManualPayment(
  guestId: string,
  houseId: string,
  amountInCents: number,
  method: "Cash" | "Check" | "Venmo" | "Zelle",
  notes: string = ""
): Promise<HousePaymentRecord> {
  if (!Number.isInteger(amountInCents) || amountInCents <= 0) {
    throw new Error(
      `Invalid payment amount: ${amountInCents}. Must be a positive integer (cents).`
    );
  }
  const docRef = paymentsCollection.doc();
  const record: HousePaymentRecord = {
    id: docRef.id,
    guestId,
    houseId,
    amount: amountInCents,
    currency: "usd",
    status: "succeeded",
    description: `Manual Payment — ${method}${notes ? `: ${notes}` : ""}`,
    createdAt: new Date().toISOString(),
  };
  // Hardened 2026-07-07: the payment doc write and the rentOwed decrement
  // used to be two separate awaits. If the second write failed, staff would
  // have a recorded payment with the resident's balance never decremented —
  // exactly the "stays listed as overdue forever" bug this function exists
  // to fix, just relocated to the failure path. A batch makes both writes
  // succeed or fail together.
  const batch = firestore.batch();
  batch.set(docRef, record);
  batch.update(firestore.collection("guests").doc(guestId), {
    rentOwed: FirebaseFirestore.FieldValue.increment(-amountInCents),
  });
  await batch.commit();
  return record;
}

/**
 * Mark a failed rent payment as resolved via cash/check/Venmo/Zelle.
 * Updates the payment status to 'resolved_offline' and records the resolution timestamp.
 */
export async function markPaymentResolvedOffline(
  paymentId: string
): Promise<void> {
  await paymentsCollection.doc(paymentId).update({
    status: "resolved_offline",
    resolvedAt: new Date().toISOString(),
  });
}
