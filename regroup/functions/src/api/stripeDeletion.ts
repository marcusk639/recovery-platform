import * as admin from 'firebase-admin';
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

type GuestCustomer = {
  deleted?: boolean;
  email?: string | null;
  metadata?: Record<string, string> | null;
};

/**
 * Stripe ties the customer to this account: metadata.userId is the uid, or
 * the customer's email is this account's verified Firebase Auth email (Auth
 * emails are unique, and verified means the account holder controls it).
 */
const isOwnedBy = async (uid: string, customer: GuestCustomer): Promise<boolean> => {
  if (customer.metadata?.userId === uid) return true;
  const email = customer.email?.trim().toLowerCase();
  if (!email) return false;
  const account = await admin.auth().getUser(uid);
  return account.emailVerified === true && account.email?.trim().toLowerCase() === email;
};

/**
 * Deletes a resident's rent-autopay customer, but only one Stripe ties to the
 * account being deleted. The id comes from guest docs, which a user can create
 * for themselves (signup) and house admins can edit, so the id alone proves
 * nothing: deleting it unchecked let a user delete someone else's customer and
 * saved card by copying its id into a guest doc of their own. A customer not
 * tied to this account is skipped and logged with ids only, never deleted.
 */
export const deleteGuestCustomer = async (uid: string, customerId: string): Promise<void> => {
  let customer: GuestCustomer;
  try {
    customer = (await stripe.customers.retrieve(customerId)) as GuestCustomer;
  } catch (err) {
    if (!isResourceMissing(err)) throw err;
    logger.warn('deleteGuestCustomer: customer missing, treated as deleted', {
      customerId,
      code: stripeCode(err),
    });
    return;
  }
  if (customer.deleted) return;
  if (!(await isOwnedBy(uid, customer))) {
    logger.warn('deleteGuestCustomer: customer not tied to this account, skipped', {
      uid,
      customerId,
    });
    return;
  }
  await deleteCustomer(customerId);
};
