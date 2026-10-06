/**
 * scheduledRentCollection
 *
 * Daily auto-pay rent collection. Runs at 10 AM UTC. Queries guests with
 * autoPayEnabled === true and rentOwed > 0, then attempts a Stripe
 * PaymentIntent for each. Uses Promise.allSettled so one failure does not stop
 * the rest.
 *
 * Repeat-charge protection and the money record both live in
 * `rentAttempts.ts`, NOT in the Stripe idempotency key — read that file's
 * header before changing anything here. The per-day key only collapses retries
 * of a single invocation.
 *
 * Firestore note: equality on one field (autoPayEnabled) combined with a range
 * on another (rentOwed) is permitted, but that pair still needs a composite
 * index — see regroup/mobile/firebase/firestore.indexes.json. Range
 * inequalities on two different fields are not allowed.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import Stripe from 'stripe';
import { guestCollection, rentCollectionAttemptCollection } from '../api/firestore';
import { STRIPE_SECRET_KEY } from '../config';
import { computeApplicationFee, RentPaymentMethodType } from '../util/rentFee';
import {
  billingPeriodFor,
  claimRentPeriod,
  loadAttemptedGuestIds,
  markRentAttemptCharged,
  markRentAttemptFailed,
} from './rentAttempts';

export { billingPeriodFor, rentAttemptId } from './rentAttempts';

interface AutoPayGuest {
  id: string;
  houseId: string;
  stripeCustomerId: string;
  defaultPaymentMethodId: string;
  rentOwed: number;
  stripeConnectId?: string;
}

export interface RentCollectionSummary {
  /** Guests the selection query matched, before period exclusion. */
  matchedCount: number;
  /** Guests a charge was actually attempted for. */
  attemptedCount: number;
  /** Attempts that threw. */
  failureCount: number;
}

/**
 * Exported for unit testing. Performs the auto-pay collection pass.
 */
export async function runRentCollection(): Promise<RentCollectionSummary> {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2026-01-28.clover' as Stripe.LatestApiVersion,
  });

  const snapshot = await guestCollection
    .where('autoPayEnabled', '==', true)
    .where('rentOwed', '>', 0)
    .get();

  if (snapshot.empty) {
    logger.info('scheduledRentCollection: no auto-pay guests with rent owed');
    return { matchedCount: 0, attemptedCount: 0, failureCount: 0 };
  }

  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const period = billingPeriodFor(now);

  // Exclude guests already charged (or attempted) this period. Selection is
  // balance-keyed and the balance only moves once the webhook lands, so without
  // this exclusion the same resident re-matches every single day.
  const alreadyAttempted = await loadAttemptedGuestIds(period);

  const dueDocs = snapshot.docs.filter((doc) => !alreadyAttempted.has(doc.id));

  if (dueDocs.length === 0) {
    logger.info('scheduledRentCollection: all auto-pay guests already charged', {
      period,
      matchedCount: snapshot.size,
    });
    return { matchedCount: snapshot.size, attemptedCount: 0, failureCount: 0 };
  }

  const results = await Promise.allSettled(
    dueDocs.map(async (doc) => {
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
      const amountCents = Math.round(guest.rentOwed);
      const idempotencyKey = `auto-rent-${guest.id}-${today}`;

      // Claim the billing period BEFORE touching Stripe. Ordering is the whole
      // point: if this write fails no charge happens, and if the charge
      // succeeds while the follow-up write fails the `pending` record is
      // already durable, so the money is never invisible.
      const attemptRef = await claimRentPeriod({
        guestId: guest.id,
        houseId: guest.houseId,
        period,
        amountCents,
        nowIso: now.toISOString(),
      });
      if (!attemptRef) {
        return;
      }

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
              autoPayPeriod: period,
            },
            ...transferParams,
          },
          { idempotencyKey },
        );
      } catch (err) {
        await markRentAttemptFailed(attemptRef, err, {
          guestId: guest.id,
          period,
        });
        throw err;
      }

      await markRentAttemptCharged(attemptRef, intent, {
        guestId: guest.id,
        period,
      });

      logger.info('scheduledRentCollection: payment created', {
        guestId: guest.id,
        intentId: intent.id,
        status: intent.status,
        period,
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
        guestId: dueDocs[index].id,
        reason: (result.reason as Error)?.message ?? String(result.reason),
      });
    }
  });
  if (failureCount > 0) {
    logger.error('scheduledRentCollection: some payments failed', {
      failureCount,
      attemptedCount: dueDocs.length,
      matchedCount: snapshot.size,
    });
  }

  return {
    matchedCount: snapshot.size,
    attemptedCount: dueDocs.length,
    failureCount,
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
