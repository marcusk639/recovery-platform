/**
 * scheduledRentCollection
 *
 * Daily auto-pay rent collection. Runs at 10 AM UTC. Queries guests with
 * autoPayEnabled === true and rentOwed > 0, then attempts a Stripe
 * PaymentIntent for each. Uses Promise.allSettled so one failure does not stop
 * the rest.
 *
 * Repeat-charge protection lives in `rentAttempts.ts` and is keyed on IN-FLIGHT
 * AMOUNT, not on a calendar period or the Stripe idempotency key — read that
 * file's header before changing anything here. The per-day key only collapses
 * retries of a single invocation. The ledger (`rentOwed`, the `payments`
 * document) is written by the webhook, not here, which is exactly why in-flight
 * charges have to be tracked separately from the balance.
 *
 * Firestore note: equality on one field (autoPayEnabled) combined with a range
 * on another (rentOwed) is permitted, but that pair still needs a composite
 * index — see regroup/mobile/firebase/firestore.indexes.json. Range
 * inequalities on two different fields are not allowed.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import Stripe from 'stripe';
import { guestCollection, houseCollection } from '../api/firestore';
import { STRIPE_SECRET_KEY } from '../config';
import { computeApplicationFee, RentPaymentMethodType } from '../util/rentFee';
import { STRIPE_API_VERSION } from '../util/stripeApiVersion';
import {
  flagStaleForReconciliation,
  loadChargedInWindowByGuest,
  loadInFlightCentsByGuest,
  PERIOD_MS,
  reportAttemptsNeedingReconciliation,
  markRentAttemptCharged,
  markRentAttemptFailed,
  recordRentAttempt,
} from './rentAttempts';

interface AutoPayGuest {
  id: string;
  houseId: string;
  stripeCustomerId: string;
  defaultPaymentMethodId: string;
  rentOwed: number;
  stripeConnectId?: string;
}

export interface RentCollectionSummary {
  /** Guests the selection query matched, before the in-flight subtraction. */
  matchedCount: number;
  /** Guests a charge was actually attempted for. */
  attemptedCount: number;
  /** Attempts that threw. */
  failureCount: number;
  /** Attempts whose Stripe outcome is unknown and awaiting a human. */
  needsReconciliationCount: number;
  /** Guests skipped because their house has no billable rent period. */
  noRentPeriodCount: number;
}

/**
 * Exported for unit testing. Performs the auto-pay collection pass.
 */
/**
 * One period's rent for a house, in CENTS, or null when the house cannot be
 * billed automatically.
 *
 * `house.monthlyRent` / `weeklyRent` are stored in DOLLARS — this is the one
 * place that conversion happens. Do NOT add a per-guest cents field: an earlier
 * attempt did, and a cap hand-entered as 500 for a $500 rent became a $5.00 cap.
 *
 * `rentFrequency` defaults to 'both', which means "resident chooses" — not an
 * answer a charge can act on. So 'both' is NOT billable, deliberately: auto-pay
 * requires the house to have committed to a period.
 */
export function periodRentCents(house: {
  rentFrequency?: string;
  monthlyRent?: number;
  weeklyRent?: number;
}): { cents: number; windowMs: number } | null {
  const freq = house.rentFrequency;
  if (freq !== 'weekly' && freq !== 'monthly') {
    return null;
  }
  const dollars = freq === 'weekly' ? house.weeklyRent : house.monthlyRent;
  if (!Number.isFinite(dollars) || (dollars as number) <= 0) {
    return null;
  }
  return { cents: Math.round((dollars as number) * 100), windowMs: PERIOD_MS[freq] };
}

export async function runRentCollection(): Promise<RentCollectionSummary> {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: STRIPE_API_VERSION,
  });

  const now = new Date();

  // Order matters. Scan in-flight first so the staleness cutoff can FLAG what
  // it releases, then sweep, so an attempt abandoned today is reported today
  // rather than a run later. Both run BEFORE the guest query, because the early
  // returns below would otherwise skip them on a day with nothing to charge.
  const { byGuest: inFlightByGuest, staleRefs } = await loadInFlightCentsByGuest(now);
  await flagStaleForReconciliation(staleRefs);
  const needsReconciliationCount = await reportAttemptsNeedingReconciliation();

  const snapshot = await guestCollection
    .where('autoPayEnabled', '==', true)
    .where('rentOwed', '>', 0)
    .get();

  if (snapshot.empty) {
    logger.info('scheduledRentCollection: no auto-pay guests with rent owed');
    return {
      matchedCount: 0,
      attemptedCount: 0,
      failureCount: 0,
      needsReconciliationCount,
      noRentPeriodCount: 0,
    };
  }

  const today = now.toISOString().split('T')[0];

  // Subtract money already committed for this guest. Selection is balance-keyed
  // and the balance only moves when the webhook lands, so without this the same
  // resident re-matches every run — and for ACH the balance stays unreduced for
  // days, long after any idempotency key has expired.

  // The billable period and its rent live on the HOUSE, not the guest.
  const houseIds = [
    ...new Set(
      snapshot.docs
        .map((doc) => (doc.data() ?? {}).houseId as string | undefined)
        .filter((id): id is string => typeof id === 'string'),
    ),
  ];
  const houses = new Map<string, Record<string, unknown>>();
  for (const id of houseIds) {
    const houseSnap = await houseCollection.doc(id).get();
    if (houseSnap.exists) {
      houses.set(id, (houseSnap.data() ?? {}) as Record<string, unknown>);
    }
  }

  // One quota query covering the widest period in play; each guest is then
  // measured against its own window.
  const chargedInWindow = await loadChargedInWindowByGuest(now, PERIOD_MS.monthly);

  let noRentPeriodCount = 0;

  const due = snapshot.docs
    .map((doc) => {
      const data = doc.data() ?? {};
      const rentOwed = data.rentOwed as number | undefined;
      const owed = Number.isFinite(rentOwed) ? (rentOwed as number) : 0;
      const outstanding = Math.round(owed - (inFlightByGuest.get(doc.id) ?? 0));

      const period = periodRentCents(
        (houses.get((data.houseId as string) ?? '') ?? {}) as never,
      );
      if (!period) {
        if (outstanding > 0) {
          noRentPeriodCount += 1;
          logger.error(
            'scheduledRentCollection: house has no billable rent period, skipping',
            { guestId: doc.id, houseId: (data.houseId as string) ?? null },
          );
        }
        return { doc, dueCents: 0 };
      }

      // Two independent guards. The cap bounds ONE charge; the quota bounds the
      // PERIOD. Without the quota, capping each charge merely spreads the same
      // total across consecutive days.
      const remainingQuota = period.cents - (chargedInWindow.get(doc.id) ?? 0);
      const dueCents = Math.min(outstanding, remainingQuota);

      if (dueCents <= 0 && outstanding > 0) {
        logger.info('scheduledRentCollection: period quota already used', {
          guestId: doc.id,
          outstandingCents: outstanding,
        });
      } else if (outstanding > dueCents) {
        logger.info(
          'scheduledRentCollection: charging one period; arrears NOT collected',
          {
            guestId: doc.id,
            chargingCents: dueCents,
            arrearsCents: outstanding - dueCents,
          },
        );
      }

      return { doc, dueCents };
    })
    .filter((entry) => entry.dueCents > 0);

  if (due.length === 0) {
    logger.info('scheduledRentCollection: nothing due beyond in-flight charges', {
      matchedCount: snapshot.size,
    });
    return {
      matchedCount: snapshot.size,
      attemptedCount: 0,
      failureCount: 0,
      needsReconciliationCount,
      noRentPeriodCount,
    };
  }

  const results = await Promise.allSettled(
    due.map(async ({ doc, dueCents }) => {
      const guest: AutoPayGuest = {
        id: doc.id,
        ...doc.data(),
      } as AutoPayGuest;

      if (!guest.defaultPaymentMethodId || !guest.stripeCustomerId) {
        logger.warn('scheduledRentCollection: guest missing payment info', {
          guestId: guest.id,
        });
        return;
      }

      // rentOwed is stored as integer cents, but the Firestore doc is read with
      // an unchecked cast. Guard against legacy/float/non-numeric values —
      // Stripe rejects a non-integer or non-positive `amount`, which would
      // otherwise reject inside this promise and be swallowed by the aggregate
      // failure handler below (a silently uncollected rent). Log + skip.
      if (!Number.isFinite(guest.rentOwed) || guest.rentOwed <= 0) {
        logger.error('scheduledRentCollection: invalid rentOwed, skipping', {
          guestId: guest.id,
        });
        return;
      }
      // Charge what is actually outstanding, not the gross balance: part of it
      // may already be in flight.
      const amountCents = dueCents;
      const idempotencyKey = `auto-rent-${guest.id}-${today}`;

      // Record BEFORE touching Stripe. If this write fails no charge happens,
      // and if the charge succeeds while a follow-up write fails the record is
      // already durable and its amount still counts as in-flight.
      const attemptRef = await recordRentAttempt({
        guestId: guest.id,
        houseId: guest.houseId,
        amountCents,
        nowIso: now.toISOString(),
      });

      // The platform application fee only applies to Connect transfers. When
      // present, derive the method-aware fee (P-1/P-2): look up the stored
      // default method's type so ACH vs card is priced correctly; legacy
      // houses stay on the flat 2% via the allow-list (P-3).
      let transferParams: Partial<Stripe.PaymentIntentCreateParams> = {};
      if (guest.stripeConnectId) {
        // The method type only affects the (cents-level) fee. If the lookup
        // fails (deleted method, rate limit, transient network), fall back to
        // pricing as a card rather than skipping the whole rent charge.
        let paymentMethodType: RentPaymentMethodType = 'card';
        try {
          const method = await stripe.paymentMethods.retrieve(guest.defaultPaymentMethodId);
          paymentMethodType = method.type === 'us_bank_account' ? 'us_bank_account' : 'card';
        } catch (err) {
          logger.warn(
            'scheduledRentCollection: payment method lookup failed, ' + 'defaulting to card fee',
            { guestId: guest.id, err: (err as Error)?.message },
          );
        }
        transferParams = {
          transfer_data: { destination: guest.stripeConnectId },
          application_fee_amount: computeApplicationFee({
            amountCents,
            paymentMethodType,
          }),
        };
      }

      let intent: Stripe.PaymentIntent;
      try {
        intent = await stripe.paymentIntents.create(
          {
            amount: amountCents,
            currency: 'usd',
            customer: guest.stripeCustomerId,
            payment_method: guest.defaultPaymentMethodId,
            confirm: true,
            off_session: true,
            metadata: {
              guestId: guest.id,
              houseId: guest.houseId,
              // Lets the webhook reconcile the record this run created rather
              // than having to author one.
              rentAttemptId: attemptRef.id,
            },
            ...transferParams,
          },
          { idempotencyKey },
        );
      } catch (err) {
        await markRentAttemptFailed(attemptRef, err, { guestId: guest.id });
        throw err;
      }

      await markRentAttemptCharged(attemptRef, intent, { guestId: guest.id });

      logger.info('scheduledRentCollection: payment created', {
        guestId: guest.id,
        intentId: intent.id,
        status: intent.status,
      });
    }),
  );

  // Surface each failed charge with its guest id and sanitized reason so a
  // declined/errored auto-pay can be followed up — an aggregate count alone
  // hides which resident's rent went uncollected and why.
  let failureCount = 0;
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      failureCount += 1;
      logger.error('scheduledRentCollection: charge failed', {
        guestId: due[index].doc.id,
        reason: (result.reason as Error)?.message ?? String(result.reason),
      });
    }
  });
  if (failureCount > 0) {
    logger.error('scheduledRentCollection: some payments failed', {
      failureCount,
      attemptedCount: due.length,
      matchedCount: snapshot.size,
    });
  }

  return {
    matchedCount: snapshot.size,
    attemptedCount: due.length,
    failureCount,
    needsReconciliationCount,
    noRentPeriodCount,
  };
}

export const scheduledRentCollection = onSchedule(
  {
    schedule: '0 10 * * *',
    timeZone: 'UTC',
    secrets: [STRIPE_SECRET_KEY],
  },
  async (_event) => {
    logger.info('scheduledRentCollection: starting daily run');
    const summary = await runRentCollection();

    // Rethrow so Cloud Scheduler records a FAILURE. Logging alone left the job
    // reporting SUCCESS while every single charge failed, which is the state
    // that let this go unnoticed.
    if (summary.failureCount > 0) {
      throw new Error(
        `scheduledRentCollection: ${summary.failureCount} of ` +
          `${summary.attemptedCount} auto-pay charges failed`,
      );
    }
  },
);
