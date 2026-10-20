import { logger } from 'firebase-functions';
import { stripe } from './stripe';
import { isResourceMissing } from '../util/stripe';

/**
 * Stripe calls used by account deletion. Kept apart from `api/stripe.ts` so that
 * file does not grow. Every tolerated failure is logged as a warning with the
 * Stripe id and error code only, so an unexpected "already gone" is visible.
 */

const ENDED_SUBSCRIPTION_STATUSES = new Set(['canceled', 'incomplete_expired']);

const stripeCode = (err: unknown): unknown => (err as { code?: unknown } | undefined)?.code;

/**
 * Cancels a subscription immediately (no period-end grace). A subscription
 * that no longer exists is treated as already cancelled, as is one Stripe
 * refuses to cancel (invalid request) because it has already ended. Safe to
 * call for a subscription that is already cancelled.
 */
export const cancelSubscriptionNow = async (subscriptionId: string): Promise<void> => {
  try {
    await stripe.subscriptions.cancel(subscriptionId);
  } catch (err) {
    if (isResourceMissing(err)) {
      logger.warn('cancelSubscriptionNow: subscription missing, treated as cancelled', {
        subscriptionId,
        code: stripeCode(err),
      });
      return;
    }
    if ((err as { type?: unknown })?.type !== 'StripeInvalidRequestError') throw err;
    let status: string | undefined;
    try {
      status = (await stripe.subscriptions.retrieve(subscriptionId)).status;
    } catch {
      throw err;
    }
    if (!ENDED_SUBSCRIPTION_STATUSES.has(status)) throw err;
    logger.warn('cancelSubscriptionNow: subscription already ended, treated as cancelled', {
      subscriptionId,
      code: stripeCode(err),
    });
  }
};

/**
 * Deletes a Stripe customer. A customer that no longer exists is treated as
 * already deleted.
 */
export const deleteCustomer = async (customerId: string): Promise<void> => {
  try {
    await stripe.customers.del(customerId);
  } catch (err) {
    if (!isResourceMissing(err)) throw err;
    logger.warn('deleteCustomer: customer missing, treated as deleted', {
      customerId,
      code: stripeCode(err),
    });
  }
};
