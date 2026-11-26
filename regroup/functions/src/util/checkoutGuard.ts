import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { ratsFirestore, userCollection } from '../api/firestore';

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
 * - a canceled legacy (tier-less) plan is allowed: Reactivate refuses those;
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
  'plan-exists' | 'plan-ended' | 'not-operator-account' | 'no-account' | 'checkout-in-progress';

export const CHECKOUT_REFUSAL_MESSAGES: Record<CheckoutRefusal, string> = {
  'plan-exists': 'You already have a plan. Manage it from your account page.',
  'plan-ended': 'Your plan ended. Reactivate it from your account page.',
  'not-operator-account':
    "This account belongs to a resident or house staff member, so it can't hold an operator plan. To run your own house, sign up with a different email address.",
  'no-account': 'We could not find your account. Please sign in again, or contact support.',
  'checkout-in-progress':
    'A checkout for this account is already in progress. Wait a minute, then check your account page before trying again.',
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
    checkoutStartedAt?: unknown;
  } | null;
};

const nonEmpty = (v: unknown): boolean => typeof v === 'string' && v !== '';

/** Why this stored user may not start a new subscription now, or null. */
export function checkoutRefusal(
  user: StoredUser | null | undefined,
  now: number,
): CheckoutRefusal | null {
  if (!user) return 'no-account';
  const meta = user.subscriptionMetadata ?? {};
  const status = typeof meta.status === 'string' ? meta.status : '';
  if (status === 'canceled') {
    if (nonEmpty(meta.tier)) return 'plan-ended';
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
  const startedAt = meta.checkoutStartedAt;
  if (typeof startedAt === 'number' && startedAt > 0 && now - startedAt < CHECKOUT_LOCK_MS) {
    return 'checkout-in-progress';
  }
  return null;
}

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
