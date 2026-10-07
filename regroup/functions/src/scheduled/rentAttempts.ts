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
/** What the in-flight pass found: amounts still committed, plus the abandoned. */
export interface InFlightScan {
  byGuest: Map<string, number>;
  /**
   * Attempts released by the staleness cutoff. Released is NOT resolved — the
   * Stripe outcome is unknown, so these must be FLAGGED, not just dropped.
   */
  staleRefs: RentAttemptRef[];
}

export async function loadInFlightCentsByGuest(now: Date): Promise<InFlightScan> {
  const snapshot = await rentCollectionAttemptCollection
    .where('status', 'in', IN_FLIGHT_STATUSES as RentAttemptStatus[])
    .get();

  const byGuest = new Map<string, number>();
  const staleRefs: RentAttemptRef[] = [];

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
      // unknown and a human has to settle it. Collect the ref so the caller can
      // set needsReconciliation; this branch used to only log, which left the
      // reader permanently blind to the one case it exists for.
      logger.error('rentAttempts: in-flight attempt is stale, releasing', {
        attemptId: doc.id,
        guestId,
        createdAt: (data.createdAt as string) ?? null,
      });
      if (data.needsReconciliation !== true) {
        staleRefs.push(doc.ref as unknown as RentAttemptRef);
      }
      continue;
    }

    byGuest.set(guestId, (byGuest.get(guestId) ?? 0) + (amountCents as number));
  }

  return { byGuest, staleRefs };
}

/**
 * Mark released-but-unresolved attempts for reconciliation.
 *
 * Separate from the scan on purpose: the scan is a read, this is a write, and
 * conflating them is how the staleness branch ended up logging without ever
 * recording anything. Never throws — a failed flag must not stop collection.
 */
export async function flagStaleForReconciliation(
  refs: readonly RentAttemptRef[],
): Promise<number> {
  let flagged = 0;
  for (const ref of refs) {
    try {
      await ref.update({
        needsReconciliation: true,
        staleReleasedAt: new Date().toISOString(),
      });
      flagged += 1;
    } catch (err) {
      logger.error('rentAttempts: could not flag stale attempt', {
        attemptId: ref.id,
        err: (err as Error)?.message,
      });
    }
  }
  return flagged;
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

/**
 * Surface attempts whose Stripe outcome is unknown.
 *
 * `needsReconciliation` is set when a charge threw for a reason that is NOT a
 * deterministic decline — a timeout may have left a real PaymentIntent behind.
 * Until this existed the flag had no reader anywhere: no alert, no UI, no retry
 * job, so an unresolved charge was recorded and then never mentioned again.
 *
 * Logged at ERROR so a Cloud Logging alert can fire on it. Deliberately does
 * NOT throw: a permanently red scheduled job gets ignored, which would
 * reproduce the same silence this is meant to break, just from the other side.
 */
export async function reportAttemptsNeedingReconciliation(): Promise<number> {
  const flagged = rentCollectionAttemptCollection.where(
    'needsReconciliation',
    '==',
    true,
  );

  // count() for the exact total, a limited select() for the sample, so payload
  // stays flat as the collection grows. An unbounded .get() here would fetch
  // every flagged doc body on every daily run.
  const total = (await flagged.count().get()).data().count;
  if (total === 0) {
    return 0;
  }

  const sample = await flagged.select('guestId', 'status').limit(20).get();

  logger.error('rentAttempts: attempts need reconciliation', {
    count: total,
    sampled: sample.size,
    // Ids and status only — never names or amounts per resident.
    attempts: sample.docs.map((doc) => ({
      attemptId: doc.id,
      guestId: (doc.data() ?? {}).guestId ?? null,
      status: (doc.data() ?? {}).status ?? null,
    })),
  });

  return total;
}

/** Rent periods, as trailing windows. Deliberately NOT calendar boundaries. */
export const PERIOD_MS: Record<'weekly' | 'monthly', number> = {
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

/** Statuses that consume period quota: the money was asked for, settled or not. */
const QUOTA_STATUSES: readonly RentAttemptStatus[] = [
  'pending',
  'awaiting_confirmation',
  'charged',
];

/**
 * Cents already charged per guest within a trailing window.
 *
 * This is the FREQUENCY bound, and it is a separate guard from the amount cap.
 * An amount cap alone is worthless: capping each charge while leaving the daily
 * cadence intact collects the same total in more debits, which is exactly how
 * the previous attempt at this failed review.
 *
 * `charged` counts here but NOT in the in-flight scan, and that difference is
 * the whole point. In-flight answers "is this debt already being collected" and
 * must release once money lands. Quota answers "has this resident already paid
 * this period" and must not.
 *
 * A trailing window rather than a calendar month because a calendar boundary is
 * precisely what an ACH settlement slips across — the bug that killed the
 * `{guestId}_{YYYY-MM}` key.
 *
 * Queries on `createdAt` alone (a single-field range, auto-indexed) and filters
 * status in memory. Adding status to the query would need a composite index, and
 * an undeployed composite index is how this feature was broken for months.
 */
export async function loadChargedInWindowByGuest(
  now: Date,
  windowMs: number,
): Promise<Map<string, number>> {
  const cutoff = new Date(now.getTime() - windowMs).toISOString();
  const snapshot = await rentCollectionAttemptCollection
    .where('createdAt', '>=', cutoff)
    .get();

  const byGuest = new Map<string, number>();

  for (const doc of snapshot.docs) {
    const data = doc.data() ?? {};
    const guestId = data.guestId as string | undefined;
    const amountCents = data.amountCents as number | undefined;
    const status = data.status as RentAttemptStatus | undefined;

    if (
      typeof guestId !== 'string' ||
      !Number.isFinite(amountCents) ||
      status === undefined ||
      !QUOTA_STATUSES.includes(status)
    ) {
      continue;
    }

    byGuest.set(guestId, (byGuest.get(guestId) ?? 0) + (amountCents as number));
  }

  return byGuest;
}
