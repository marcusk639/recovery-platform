/**
 * Payment Service
 *
 * Handles rent payment operations for guests/residents.
 * Calls Firebase Cloud Functions for Stripe payment intents,
 * reads/writes the 'payments' Firestore collection, and provides
 * CF-backed listing for the payments dashboard.
 */
import { firestore, functions } from '../../firebase-setup';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Legacy Firestore-backed rent payment record written by recordRentPayment. */
export interface RentPayment {
  id: string;
  guestId: string;
  houseId: string;
  /** Amount in US cents (e.g., 50000 = $500.00). Matches Stripe convention. */
  amount: number;
  status: 'pending' | 'succeeded' | 'failed' | 'resolved_offline';
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
  status: 'succeeded' | 'pending' | 'failed';
  description: string;
  createdAt: string;
  receiptUrl?: string;
}

export interface HousePaymentRecord extends PaymentRecord {
  guestId: string | null;
  houseId: string;
}

// ─── Firestore collection ─────────────────────────────────────────────────────

export const paymentsCollection = firestore.collection('payments');

// ─── Legacy Firestore-backed service functions ────────────────────────────────

/**
 * Call the 'createPaymentIntent' Cloud Function to initiate a Stripe payment.
 *
 * @param guestId - Firestore guest document ID
 * @param houseId - Firestore house document ID
 * @param amountInCents - Payment amount in US cents (e.g., 50000 for $500.00).
 *   Stripe requires amounts in the smallest currency unit.
 */
export async function createRentPaymentIntent(
  guestId: string,
  houseId: string,
  amountInCents: number,
): Promise<CreatePaymentIntentResult> {
  if (!Number.isInteger(amountInCents) || amountInCents <= 0) {
    throw new Error(
      `Invalid payment amount: ${amountInCents}. Must be a positive integer (cents).`,
    );
  }
  if (amountInCents > 10000000) {
    // $100,000 cap — sanity check against accidental dollar-vs-cent errors
    throw new Error(
      `Payment amount ${amountInCents} exceeds maximum (10000000 cents / $100,000).`,
    );
  }
  const response = await functions.httpsCallable('createPaymentIntent')({
    guestId,
    houseId,
    amount: amountInCents,
  });
  const data = response.data as CreatePaymentIntentResult;
  return data;
}

/**
 * Write an optimistic payment record to Firestore immediately after the
 * guest initiates the payment flow.  The actual status update (pending →
 * completed / failed) will arrive via a Stripe webhook handled by a Cloud
 * Function.
 */
export async function recordRentPayment(
  guestId: string,
  houseId: string,
  amount: number,
  description: string = 'Rent Payment',
  stripePaymentIntentId?: string,
): Promise<RentPayment> {
  const docRef = paymentsCollection.doc();
  const payment: RentPayment = {
    id: docRef.id,
    guestId,
    houseId,
    amount,
    status: 'pending',
    createdAt: new Date().toISOString(),
    description,
    stripePaymentIntentId,
  };
  await docRef.set(payment);
  return payment;
}

/**
 * Fetch payment history for a guest from the 'payments' Firestore collection.
 * Results are sorted newest-first.
 */
export async function getPaymentHistory(
  guestId: string,
  limit = 100,
): Promise<RentPayment[]> {
  const snapshot = await paymentsCollection
    .where('guestId', '==', guestId)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  if (!snapshot.docs.length) {
    return [];
  }
  return snapshot.docs.map(doc => doc.data() as RentPayment);
}

// ─── CF-backed service functions ──────────────────────────────────────────────

/**
 * @param amountInCents - Amount in US cents (e.g., 50000 for $500.00)
 */
export async function createPaymentIntent(
  amountInCents: number,
  guestId: string,
  houseId: string,
  description?: string,
): Promise<{ clientSecret: string }> {
  if (!Number.isInteger(amountInCents) || amountInCents <= 0) {
    throw new Error(
      `Invalid payment amount: ${amountInCents}. Must be a positive integer (cents).`,
    );
  }
  const result = await functions.httpsCallable('createPaymentIntent')({
    amount: amountInCents,
    guestId,
    houseId,
    description,
  });
  return result.data as { clientSecret: string };
}

export async function listPayments(
  guestId: string,
  houseId: string,
  limit = 20,
): Promise<PaymentRecord[]> {
  const result = await functions.httpsCallable('listPayments')({
    guestId,
    houseId,
    limit,
  });
  return (result.data as any).payments;
}

export async function listHousePayments(
  houseId: string,
  limit = 100,
): Promise<HousePaymentRecord[]> {
  const result = await functions.httpsCallable('listHousePayments')({
    houseId,
    limit,
  });
  return (result.data as any).payments;
}

/**
 * Write a manual (cash/check/Venmo/Zelle) payment record directly to Firestore.
 * Unlike Stripe-backed payments, these are immediately marked as succeeded.
 *
 * @param amountInCents - Amount in US cents (e.g., 50000 for $500.00).
 *   Callers must convert from dollars before calling this function.
 */
export async function recordManualPayment(
  guestId: string,
  houseId: string,
  amountInCents: number,
  method: 'Cash' | 'Check' | 'Venmo' | 'Zelle',
  notes: string = '',
): Promise<HousePaymentRecord> {
  if (!Number.isInteger(amountInCents) || amountInCents <= 0) {
    throw new Error(
      `Invalid payment amount: ${amountInCents}. Must be a positive integer (cents).`,
    );
  }
  const docRef = paymentsCollection.doc();
  const record: HousePaymentRecord = {
    id: docRef.id,
    guestId,
    houseId,
    amount: amountInCents,
    currency: 'usd',
    status: 'succeeded',
    description: `Manual Payment — ${method}${notes ? `: ${notes}` : ''}`,
    createdAt: new Date().toISOString(),
  };
  await docRef.set(record);
  return record;
}

/**
 * Mark a failed rent payment as resolved via cash/check/Venmo/Zelle.
 * Updates the payment status to 'resolved_offline' and records the resolution timestamp.
 */
export async function markPaymentResolvedOffline(
  paymentId: string,
): Promise<void> {
  await paymentsCollection.doc(paymentId).update({
    status: 'resolved_offline',
    resolvedAt: new Date().toISOString(),
  });
}
