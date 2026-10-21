import { logger } from 'firebase-functions';
import { stripe } from './stripe';
import { isResourceMissing } from '../util/stripe';

/**
 * Stripe calls used by account deletion. Kept apart from `api/stripe.ts` so that
 * file does not grow. Every log here carries ids and codes only. A missing
 * object is tolerated and logged as a warning, so an unexpected "already gone"
 * is visible.
 *
 * Billing ids reach deletion from client-writable docs (guest docs, and a user
 * doc its owner can delete and recreate), so an id alone proves nothing. The
 * only ownership proof is `metadata.userId`, which the server sets when it
 * creates a subscription. Billing that is not provably the caller's is never
 * cancelled or deleted. An unverifiable operator subscription stops the
 * deletion (BillingNotVerifiedError) so the user is not told it was cancelled
 * while it keeps billing; an unproven customer is skipped and logged as an
 * error for manual follow-up.
 */

/**
 * The operator's stored subscription could not be tied to their uid, so it was
 * not cancelled. Thrown before the operator step acts, so nothing in that step
 * was removed. Carries ids and a reason only.
 */
export class BillingNotVerifiedError extends Error {
  constructor(
    readonly reason: 'metadata-mismatch' | 'subscription-missing',
    readonly subscriptionId: string,
  ) {
    super(`operator subscription not verified (${reason})`);
    this.name = 'BillingNotVerifiedError';
  }
}

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

type StripeObject = {
  deleted?: boolean;
  metadata?: Record<string, string> | null;
};

/** Retrieves a Stripe object; undefined when Stripe says it does not exist. */
const retrieveOrMissing = async <T>(
  kind: string,
  id: string,
  retrieve: () => Promise<unknown>,
): Promise<T | undefined> => {
  try {
    return (await retrieve()) as T;
  } catch (err) {
    if (!isResourceMissing(err)) throw err;
    logger.warn(`${kind} missing, treated as already gone`, { id, code: stripeCode(err) });
    return undefined;
  }
};

const logNotOwned = (kind: string, uid: string, id: string, reason: string): void =>
  logger.error('accountDeletion.stripe_not_owned', { kind, uid, id, reason });

/**
 * Deletes a resident's rent-autopay customer only when its metadata.userId is
 * the account being deleted. The id comes from guest docs, which a user can
 * create for themselves and house admins can edit, so deleting it unchecked let
 * a user delete someone else's customer and saved card. Email is not proof:
 * verifyUserEmail marks the caller's own Auth email verified without an inbox
 * check. Guest customers are created without metadata today, so they are
 * skipped and logged rather than deleted.
 */
export const deleteGuestCustomer = async (uid: string, customerId: string): Promise<void> => {
  const customer = await retrieveOrMissing<StripeObject>('guest customer', customerId, () =>
    stripe.customers.retrieve(customerId),
  );
  if (!customer || customer.deleted) return;
  if (customer.metadata?.userId !== uid) {
    logNotOwned('guest-customer', uid, customerId, 'metadata-mismatch');
    return;
  }
  await deleteCustomer(customerId);
};

type OperatorSubscription = StripeObject & { customer?: string | { id?: string } | null };

/**
 * Cancels the operator's subscription now and deletes their customer, but only
 * a subscription whose metadata.userId is the account being deleted (every
 * subscription-creation path in api/stripe.ts sets it), and only the customer
 * that subscription bills. The ids come from the user doc, which could carry
 * someone else's ids. A stored subscription that is missing in Stripe or tied
 * to another uid throws BillingNotVerifiedError: it may be the user's own
 * (created without metadata, or a wrong Stripe key) and still billing, so the
 * deletion must not report it cancelled. A customer with no provable
 * subscription is skipped and logged.
 */
export const closeOperatorBilling = async (
  uid: string,
  subscriptionId: string | undefined,
  customerId: string | undefined,
): Promise<void> => {
  if (!subscriptionId) {
    if (customerId) logNotOwned('operator-customer', uid, customerId, 'no-subscription');
    return;
  }
  const subscription = await retrieveOrMissing<OperatorSubscription>(
    'operator subscription',
    subscriptionId,
    () => stripe.subscriptions.retrieve(subscriptionId),
  );
  if (!subscription) {
    logNotOwned('operator-subscription', uid, subscriptionId, 'subscription-missing');
    throw new BillingNotVerifiedError('subscription-missing', subscriptionId);
  }
  if (subscription.metadata?.userId !== uid) {
    logNotOwned('operator-subscription', uid, subscriptionId, 'metadata-mismatch');
    throw new BillingNotVerifiedError('metadata-mismatch', subscriptionId);
  }
  await cancelSubscriptionNow(subscriptionId);
  if (!customerId) return;
  const billed =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
  if (billed !== customerId) {
    logNotOwned('operator-customer', uid, customerId, 'not-subscription-customer');
    return;
  }
  await deleteCustomer(customerId);
};
