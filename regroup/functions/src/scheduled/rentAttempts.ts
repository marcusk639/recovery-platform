/**
 * Rent collection attempt records.
 *
 * One document per guest per billing period in `rent-collection-attempts`,
 * written BEFORE the Stripe charge. This — not the Stripe idempotency key — is
 * what stops a resident being charged again the next day. Stripe forgets an
 * idempotency key after roughly 24 hours, so widening that key from per-day to
 * per-period buys nothing: past the window the same key string yields a fresh
 * charge. Cross-period protection has to live in Firestore.
 *
 * It is also why a charge can no longer go unrecorded. The only writer of rent
 * payments used to be the `payment_intent.succeeded` webhook, so an
 * unsubscribed or failing webhook meant money moved while `rentOwed` and
 * payment history never did. The collector now records its own attempt and the
 * webhook merely reconciles the outcome.
 */

import { logger } from 'firebase-functions';
import { rentCollectionAttemptCollection } from '../api/firestore';

export type RentAttemptStatus = 'pending' | 'charged' | 'awaiting_confirmation' | 'failed';

/** Minimal shape used so a test double does not have to be a DocumentReference. */
export interface RentAttemptRef {
  id: string;
  update(data: Record<string, unknown>): Promise<unknown>;
}

/** Billing period key, `YYYY-MM` in UTC. One rent charge per guest per period. */
export function billingPeriodFor(date: Date): string {
  return date.toISOString().slice(0, 7);
}

/** Deterministic attempt id — the document's existence is the charge guard. */
export function rentAttemptId(guestId: string, period: string): string {
  return `${guestId}_${period}`;
}

/**
 * Firestore `create()` rejects with ALREADY_EXISTS (gRPC code 6) when the
 * document is already there. That rejection is the race-proof arm of the
 * repeat-charge guard, so it must be told apart from a real write failure.
 */
function isAlreadyExists(err: unknown): boolean {
  const code = (err as { code?: unknown } | undefined)?.code;
  if (code === 6 || code === 'already-exists') {
    return true;
  }
  return /ALREADY_EXISTS/i.test((err as Error | undefined)?.message ?? '');
}

/**
 * Guests already attempted this period. Equality on a single field, which
 * Firestore indexes automatically — so unlike the balance-keyed guest
 * selection, this can never be broken by an undeployed composite index.
 */
export async function loadAttemptedGuestIds(period: string): Promise<Set<string>> {
  const snapshot = await rentCollectionAttemptCollection.where('period', '==', period).get();

  return new Set<string>(
    snapshot.docs
      .map((doc) => doc.data()?.guestId as string | undefined)
      .filter((id): id is string => typeof id === 'string'),
  );
}

/**
 * Claim a guest's billing period before charging. Returns null when the period
 * is already claimed, in which case the caller must NOT charge.
 *
 * Uses `create()` rather than `set()` so the claim is atomic: a concurrent or
 * re-triggered run loses the race with ALREADY_EXISTS instead of charging a
 * second time.
 */
export async function claimRentPeriod(params: {
  guestId: string;
  houseId: string;
  period: string;
  amountCents: number;
  nowIso: string;
}): Promise<RentAttemptRef | null> {
  const { guestId, houseId, period, amountCents, nowIso } = params;
  const ref = rentCollectionAttemptCollection.doc(rentAttemptId(guestId, period));

  try {
    await ref.create({
      guestId,
      houseId,
      period,
      amountCents,
      status: 'pending' as RentAttemptStatus,
      source: 'scheduledRentCollection',
      createdAt: nowIso,
    });
  } catch (err) {
    if (isAlreadyExists(err)) {
      logger.info('rentAttempts: period already claimed, skipping', {
        guestId,
        period,
      });
      return null;
    }
    throw err;
  }

  return ref as unknown as RentAttemptRef;
}

/** Record the Stripe outcome of a claimed attempt. Never throws. */
export async function markRentAttemptCharged(
  ref: RentAttemptRef,
  intent: { id: string; status: string },
  context: { guestId: string; period: string },
): Promise<void> {
  const succeeded = intent.status === 'succeeded';
  try {
    await ref.update({
      status: (succeeded ? 'charged' : 'awaiting_confirmation') as RentAttemptStatus,
      paymentIntentId: intent.id,
      stripeStatus: intent.status,
      needsReconciliation: !succeeded,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    // The charge is real and the `pending` record is already durable, so this
    // is recoverable — but it must be loud, not swallowed.
    logger.error('rentAttempts: charged but attempt update failed', {
      ...context,
      intentId: intent.id,
      err: (err as Error)?.message,
    });
  }
}

/**
 * Flag a thrown charge for reconciliation. A thrown create does NOT prove no
 * charge happened — a timeout can leave a real PaymentIntent behind — so the
 * period stays claimed, because the safe direction is not charging twice.
 */
export async function markRentAttemptFailed(
  ref: RentAttemptRef,
  err: unknown,
  context: { guestId: string; period: string },
): Promise<void> {
  try {
    await ref.update({
      status: 'failed' as RentAttemptStatus,
      needsReconciliation: true,
      failureReason: (err as Error)?.message ?? String(err),
      updatedAt: new Date().toISOString(),
    });
  } catch (updateErr) {
    logger.error('rentAttempts: attempt failure write failed', {
      ...context,
      err: (updateErr as Error)?.message,
    });
  }
}
