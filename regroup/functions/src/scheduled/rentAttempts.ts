/**
 * Rent collection attempt records.
 *
 * One document per charge attempt in `rent-collection-attempts`, written BEFORE
 * the Stripe charge. Repeat-charge protection is derived from these records, NOT
 * from the Stripe idempotency key: Stripe forgets a key after roughly 24 hours,
 * so no key can protect across a gap longer than a day.
 *
 * The guard is IN-FLIGHT AMOUNT, not a calendar period. A guest is skipped when
 * `rentOwed - inFlightCents <= 0`, and charged the difference rather than the
 * gross balance. A calendar key cannot work here for two independent reasons:
 *
 *  - A confirmed `us_bank_account` PaymentIntent reports `processing` and
 *    settles days later, so `rentOwed` is still unreduced across a month
 *    boundary. A period key expires inside the settlement window it has to
 *    cover, and the next period re-charges money already taken.
 *  - There is no rent accrual job in regroup. `rentOwed` is raised by a human
 *    in the mobile guest form, so a calendar month buckets operator edits and
 *    correlates with nothing in the data model.
 *
 * These records are an audit trail, NOT the ledger. The ledger — the `rentOwed`
 * decrement and the `payments` document — is written only by the
 * `payment_intent.succeeded` webhook. `status` here is therefore not a
 * settlement signal.
 *
 * Document ids are Firestore auto-ids. Do NOT key these on a timestamp or any
 * other sequential value: Firestore shards by key range, so lexicographically
 * adjacent keys concentrate writes on one range instead of spreading them.
 * The creation time lives in `createdAt`, which is what ageing reads anyway.
 */

import { logger } from 'firebase-functions';
import { rentCollectionAttemptCollection } from '../api/firestore';

export type RentAttemptStatus = 'pending' | 'awaiting_confirmation' | 'charged' | 'failed';

/** Statuses whose amount is still committed and must suppress a re-charge. */
export const IN_FLIGHT_STATUSES: readonly RentAttemptStatus[] = [
  'pending',
  'awaiting_confirmation',
];

/**
 * How long an in-flight attempt keeps suppressing charges before it is treated
 * as abandoned.
 *
 * Without a cutoff a single undelivered webhook would suppress a resident's
 * rent collection FOREVER — a permanent silent lockout, which is a worse
 * failure than the double charge this guard exists to prevent. 10 days covers
 * ACH's 3–5 business days plus a weekend and a holiday.
 *
 * A stale attempt is logged at ERROR and released. It does not mean no money
 * moved — it means nobody knows, which is what `needsReconciliation` is for.
 */
export const STALE_IN_FLIGHT_MS = 10 * 24 * 60 * 60 * 1000;

/** Minimal shape used so a test double does not have to be a DocumentReference. */
export interface RentAttemptRef {
  id: string;
  update(data: Record<string, unknown>): Promise<unknown>;
}

/**
 * A Stripe card decline is deterministic: no money moved and the PaymentIntent
 * is left in `requires_payment_method`, so the attempt is terminal and its
 * amount must be RELEASED for tomorrow's retry. Any other error (timeout,
 * network, unknown) may have left a real charge behind, so it must stay
 * in-flight and be reconciled — releasing it would permit a double charge.
 */
export function isDeterministicDecline(err: unknown): boolean {
  const e = err as { type?: unknown; raw?: { type?: unknown } } | undefined;
  return e?.type === 'StripeCardError' || e?.raw?.type === 'card_error';
}

/**
 * Cents already committed per guest, keyed by guestId.
 *
 * Single-field `in` query on `status`, which Firestore indexes automatically —
 * unlike the balance-keyed guest selection it cannot be broken by an
 * undeployed composite index. It is also bounded by genuinely in-flight
 * charges rather than by everything that happened this month.
 */
export async function loadInFlightCentsByGuest(now: Date): Promise<Map<string, number>> {
  const snapshot = await rentCollectionAttemptCollection
    .where('status', 'in', IN_FLIGHT_STATUSES as RentAttemptStatus[])
    .get();

  const byGuest = new Map<string, number>();

  for (const doc of snapshot.docs) {
    const data = doc.data() ?? {};
    const guestId = data.guestId as string | undefined;
    const amountCents = data.amountCents as number | undefined;

    if (typeof guestId !== 'string' || !Number.isFinite(amountCents)) {
      logger.error('rentAttempts: malformed in-flight attempt, ignoring', {
        attemptId: doc.id,
      });
      continue;
    }

    const createdAt = Date.parse((data.createdAt as string) ?? '');
    const isStale = !Number.isFinite(createdAt) || now.getTime() - createdAt > STALE_IN_FLIGHT_MS;

    if (isStale) {
      // Released deliberately, but it is NOT resolved — the Stripe outcome is
      // unknown and a human has to settle it.
      logger.error('rentAttempts: in-flight attempt is stale, releasing', {
        attemptId: doc.id,
        guestId,
        createdAt: (data.createdAt as string) ?? null,
      });
      continue;
    }

    byGuest.set(guestId, (byGuest.get(guestId) ?? 0) + (amountCents as number));
  }

  return byGuest;
}

/**
 * Record an attempt before charging. Returns the ref so the outcome can be
 * written back.
 *
 * Ordering is load-bearing: if this write fails no charge happens, and if the
 * charge succeeds while a follow-up write fails, this record is already durable
 * and its amount still counts as in-flight.
 */
export async function recordRentAttempt(params: {
  guestId: string;
  houseId: string;
  amountCents: number;
  nowIso: string;
}): Promise<RentAttemptRef> {
  const { guestId, houseId, amountCents, nowIso } = params;
  const ref = rentCollectionAttemptCollection.doc();

  await ref.create({
    guestId,
    houseId,
    amountCents,
    status: 'pending' as RentAttemptStatus,
    source: 'scheduledRentCollection',
    needsReconciliation: false,
    createdAt: nowIso,
  });

  return ref as unknown as RentAttemptRef;
}

/** Record the Stripe outcome of a recorded attempt. Never throws. */
export async function markRentAttemptCharged(
  ref: RentAttemptRef,
  intent: { id: string; status: string },
  context: { guestId: string },
): Promise<void> {
  // `succeeded` is settled; `processing` (ACH) and `requires_action` are still
  // in flight and must keep suppressing charges until the webhook lands.
  const settled = intent.status === 'succeeded';

  try {
    await ref.update({
      status: (settled ? 'charged' : 'awaiting_confirmation') as RentAttemptStatus,
      paymentIntentId: intent.id,
      stripeStatus: intent.status,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    // The charge is real and the record is already durable and in-flight, so
    // this is recoverable — but it must be loud, not swallowed.
    logger.error('rentAttempts: charged but attempt update failed', {
      ...context,
      attemptId: ref.id,
      intentId: intent.id,
      err: (err as Error)?.message,
    });
  }
}

/**
 * Resolve a thrown charge. A decline terminates the attempt and releases its
 * amount; anything else stays in-flight pending reconciliation. Never throws.
 */
export async function markRentAttemptFailed(
  ref: RentAttemptRef,
  err: unknown,
  context: { guestId: string },
): Promise<void> {
  const declined = isDeterministicDecline(err);

  try {
    await ref.update({
      // Terminal only for a decline. Leaving an unknown outcome `pending` is
      // what stops a timeout that did charge from being charged again.
      status: (declined ? 'failed' : 'pending') as RentAttemptStatus,
      needsReconciliation: !declined,
      failureReason: (err as Error)?.message ?? String(err),
      updatedAt: new Date().toISOString(),
    });
  } catch (updateErr) {
    logger.error('rentAttempts: attempt failure write failed', {
      ...context,
      attemptId: ref.id,
      err: (updateErr as Error)?.message,
    });
  }
}
