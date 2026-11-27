import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { ratsFirestore, userCollection } from '../api/firestore';
import type { HouseType, TierKey } from '../config';
import { isTierAvailableForSale } from './tierPricing';

/**
 * createOperatorSubscription's guard against billing an account twice (launch
 * item M9). Web checkout runs for a brand-new account and, while signed in, for
 * an existing account that never had a plan. The callable is reachable directly,
 * so the server decides, from the stored user record and never from client data,
 * whether this account may start a NEW Stripe subscription:
 *
 * - any live or restartable subscription is refused: Stripe would bill both;
 * - a canceled tier plan is refused too: Reactivate restarts it, and a new
 *   checkout would hand a lapsed operator a second free trial;
 * - a canceled plan Reactivate can't restart (legacy tier-less, or a tier no
 *   longer for sale) and an incomplete_expired one are allowed: no other route;
 * - a resident or staff account is refused: the app routes it by that role, so
 *   it could never use the plan it paid for.
 *
 * The check and a short checkout lock are one transaction, so two concurrent
 * calls (two tabs, or two plans, whose Stripe idempotency keys differ) cannot
 * both pass. A successful checkout clears the lock, because
 * writeOperatorSubscription replaces subscriptionMetadata; a failed one
 * releases it; a crashed one expires.
 */

export type CheckoutRefusal =
  | 'plan-exists'
  | 'plan-ended'
  | 'not-operator-account'
  | 'no-account'
  | 'checkout-in-progress'
  | 'unrecorded-subscription';

export const CHECKOUT_REFUSAL_MESSAGES: Record<CheckoutRefusal, string> = {
  'plan-exists': 'You already have a plan. Manage it from your account page.',
  'plan-ended': 'Your plan ended. Reactivate it from your account page.',
  'not-operator-account':
    "This account belongs to a resident or house staff member, so it can't hold an operator plan. To run your own house, sign up with a different email address.",
  'no-account': 'We could not find your account. Please sign in again, or contact support.',
  'checkout-in-progress':
    'A checkout for this account is already in progress. Wait a minute, then check your account page before trying again.',
  'unrecorded-subscription':
    "We found a subscription for this account that isn't set up yet. Please contact support before trying again, so you aren't billed twice.",
};

/** Longer than the callable's 60s timeout, so a live checkout always holds it. */
export const CHECKOUT_LOCK_MS = 2 * 60 * 1000;

type StoredUser = {
  isGuest?: unknown;
  isAdmin?: unknown;
  isSuperAdmin?: unknown;
  subscriptionMetadata?: {
    status?: unknown;
    subscriptionId?: unknown;
    tier?: unknown;
    houseType?: unknown;
    checkoutStartedAt?: unknown;
  } | null;
};

const nonEmpty = (v: unknown): boolean => typeof v === 'string' && v !== '';

/** Whether Reactivate could restart this stored plan: a tier still on sale. */
export const storedTierOnSale = (houseType: unknown, tier: unknown): boolean => {
  if (!nonEmpty(houseType) || !nonEmpty(tier)) return false;
  try {
    return isTierAvailableForSale(houseType as HouseType, tier as TierKey);
  } catch {
    return false; // a tier no longer defined
  }
};

/** Why this stored user may not start a new subscription now, or null. */
export function checkoutRefusal(
  user: StoredUser | null | undefined,
  now: number,
): CheckoutRefusal | null {
  if (!user) return 'no-account';
  const meta = user.subscriptionMetadata ?? {};
  const status = typeof meta.status === 'string' ? meta.status : '';
  if (status === 'canceled') {
    // Reactivate restarts a canceled tier plan with no new trial. When it can't
    // (a legacy plan with no tier, or a tier no longer for sale), checkout is
    // the way back: refusing would leave no route to a plan.
    if (nonEmpty(meta.tier) && storedTierOnSale(meta.houseType, meta.tier)) return 'plan-ended';
  } else if (status === 'incomplete_expired') {
    // Terminal in Stripe and never started (a trial subscription starts as
    // trialing), so no trial was used, nothing bills, and Reactivate refuses it.
  } else if (status !== '' || nonEmpty(meta.subscriptionId)) {
    // Any other recorded status (active, trialing, cancelling, past_due, unpaid,
    // incomplete, pending, paused, ...) or a stored subscription id: a Stripe
    // subscription may still be billing. A live status with no id is a broken
    // record, refused for the same reason.
    return 'plan-exists';
  }
  if (user.isGuest === true || (user.isAdmin === true && user.isSuperAdmin !== true)) {
    return 'not-operator-account';
  }
  if (lockHeld(meta.checkoutStartedAt, now)) return 'checkout-in-progress';
  return null;
}

const lockHeld = (startedAt: unknown, now: number): boolean =>
  typeof startedAt === 'number' && startedAt > 0 && now - startedAt < CHECKOUT_LOCK_MS;

export type CheckoutClaim = { uid: string; startedAt: number };

/**
 * Checks the stored user and, if checkout may go ahead, takes the lock. Throws
 * failed-precondition with `details.reason` (a CheckoutRefusal) when it may not;
 * the web reads the reason to link the operator to their account page.
 */
export async function claimCheckout(uid: string, now: number = Date.now()): Promise<CheckoutClaim> {
  const ref = userCollection.doc(uid);
  return ratsFirestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const refusal = checkoutRefusal(snap.exists ? snap.data() : null, now);
    if (refusal) {
      logger.info('Checkout refused', { userId: uid, reason: refusal });
      throw new HttpsError('failed-precondition', CHECKOUT_REFUSAL_MESSAGES[refusal], {
        reason: refusal,
      });
    }
    // A doc with no metadata yet gets a whole one, so no partial map lacks houses.
    tx.update(
      ref,
      snap.data()?.subscriptionMetadata
        ? { 'subscriptionMetadata.checkoutStartedAt': now }
        : { subscriptionMetadata: { status: '', houses: {}, checkoutStartedAt: now } },
    );
    return { uid, startedAt: now };
  });
}

/**
 * Reactivate's half of the lock. Restarting a canceled plan creates a new Stripe
 * subscription too, so it takes the same lock as checkout: a Reactivate and a
 * checkout, or two Reactivates, for one account can't both create one. The
 * callable checks the plan itself (tier still for sale, sales switch); this
 * re-reads the status in the transaction, so a plan restarted meanwhile is
 * refused. A successful Reactivate clears the lock with the new record.
 */
export async function claimReactivation(
  uid: string,
  now: number = Date.now(),
): Promise<CheckoutClaim> {
  const ref = userCollection.doc(uid);
  return ratsFirestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const meta = (snap.exists ? snap.data()?.subscriptionMetadata : null) ?? {};
    let refusal: CheckoutRefusal | null = null;
    if (meta.status !== 'canceled') refusal = 'plan-exists';
    else if (lockHeld(meta.checkoutStartedAt, now)) refusal = 'checkout-in-progress';
    if (refusal) {
      logger.info('Reactivate refused', { userId: uid, reason: refusal });
      throw new HttpsError('failed-precondition', CHECKOUT_REFUSAL_MESSAGES[refusal], {
        reason: refusal,
      });
    }
    tx.update(ref, { 'subscriptionMetadata.checkoutStartedAt': now });
    return { uid, startedAt: now };
  });
}

/**
 * Releases a lock this checkout took, so the operator can retry at once (a
 * declined card, say). Only its own lock; never throws, since the checkout's
 * own error is the one to report, and the lock expires anyway.
 */
export async function releaseCheckout(claim: CheckoutClaim): Promise<void> {
  const ref = userCollection.doc(claim.uid);
  try {
    await ratsFirestore.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.data()?.subscriptionMetadata?.checkoutStartedAt !== claim.startedAt) return;
      tx.update(ref, { 'subscriptionMetadata.checkoutStartedAt': 0 });
    });
  } catch (error) {
    logger.warn('Checkout lock not released; it expires on its own', {
      userId: claim.uid,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
