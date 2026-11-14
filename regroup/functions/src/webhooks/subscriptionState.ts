import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';
import type Stripe from 'stripe';
import { periodEndSeconds } from '../util/subscriptionPeriod';

/**
 * The operator's subscription status as the app stores it. "cancelling" is a
 * live subscription set to cancel at period end, which is how both the
 * Customer Portal and cancelUserSubscription mark a pending cancel;
 * reactivateOperatorSubscription resumes it in place.
 */
export function operatorStatusFromStripe(sub: Stripe.Subscription): string {
  if (sub.cancel_at_period_end && (sub.status === 'active' || sub.status === 'trialing')) {
    return 'cancelling';
  }
  return sub.status;
}

/**
 * Writes Stripe's current state of a subscription to the operator's record, so
 * createHouses, the house-create trigger and the web account page read a live
 * status. Only the operator's current subscription counts: an event for one
 * they replaced changes nothing.
 */
export async function syncOperatorStatus(
  operatorUid: string,
  fresh: Stripe.Subscription,
): Promise<'updated' | 'other subscription'> {
  const db = admin.firestore();
  const ref = db.collection('users').doc(operatorUid);
  const status = operatorStatusFromStripe(fresh);
  const periodEnd = periodEndSeconds(fresh);
  const outcome = await db.runTransaction(async (tx) => {
    const meta = (await tx.get(ref)).data()?.subscriptionMetadata;
    if (meta?.subscriptionId !== fresh.id) return 'other subscription' as const;
    tx.update(ref, {
      'subscriptionMetadata.status': status,
      'subscriptionMetadata.lastUpdatedAt': new Date().toISOString(),
      ...(periodEnd != null ? { 'subscriptionMetadata.currentPeriodEnd': periodEnd * 1000 } : {}),
    });
    return 'updated' as const;
  });
  const fields = { operatorUid, subscriptionId: fresh.id, status, outcome };
  if (outcome === 'updated') {
    logger.info('syncOperatorStatus', fields);
  } else {
    logger.warn('syncOperatorStatus: operator unchanged', fields);
  }
  return outcome;
}
