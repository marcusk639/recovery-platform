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
import { guestCollection } from '../api/firestore';
import { STRIPE_SECRET_KEY } from '../config';
import { computeApplicationFee, RentPaymentMethodType } from '../util/rentFee';
import { STRIPE_API_VERSION } from '../util/stripeApiVersion';
import {
  loadInFlightCentsByGuest,
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
}

/**
 * Exported for unit testing. Performs the auto-pay collection pass.
 */
export async function runRentCollection(): Promise<RentCollectionSummary> {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: STRIPE_API_VERSION,
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

  // Subtract money already committed for this guest. Selection is balance-keyed
  // and the balance only moves when the webhook lands, so without this the same
  // resident re-matches every run — and for ACH the balance stays unreduced for
  // days, long after any idempotency key has expired.
  const inFlightByGuest = await loadInFlightCentsByGuest(now);

  const due = snapshot.docs
    .map((doc) => {
      const rentOwed = (doc.data() ?? {}).rentOwed as number | undefined;
      const owed = Number.isFinite(rentOwed) ? (rentOwed as number) : 0;
      return {
        doc,
        dueCents: Math.round(owed - (inFlightByGuest.get(doc.id) ?? 0)),
      };
    })
    .filter((entry) => entry.dueCents > 0);

  if (due.length === 0) {
    logger.info('scheduledRentCollection: nothing due beyond in-flight charges', {
      matchedCount: snapshot.size,
    });
    return { matchedCount: snapshot.size, attemptedCount: 0, failureCount: 0 };
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
