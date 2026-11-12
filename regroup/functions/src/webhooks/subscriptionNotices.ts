import type Stripe from 'stripe';

/**
 * Set on a subscription just before the launch cancels it (spec §4.1 item 4,
 * scripts/cancelLegacySubscriptions.ts). The owner's notice to operators
 * explains those cancellations, so the webhook sends no "canceled" push.
 */
export const LAUNCH_CANCEL_METADATA_KEY = 'regroup_launch_cancel';

export function isLaunchCancellation(sub: Stripe.Subscription): boolean {
  return sub.metadata?.[LAUNCH_CANCEL_METADATA_KEY] === 'true';
}

/** Stripe sends trial_will_end three days before the trial ends. */
export function trialEndingNotice(
  sub: Stripe.Subscription,
): { title: string; body: string } | null {
  if (sub.trial_end == null) return null;
  const date = new Date(sub.trial_end * 1000).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
  return {
    title: 'Your free trial ends soon',
    body: `Your Regroup free trial ends on ${date}. Your card will be charged then unless you cancel.`,
  };
}

/** The bank wants the operator to authenticate the payment (e.g. 3-D Secure). */
export const PAYMENT_ACTION_NOTICE = {
  title: 'Confirm your payment',
  body: 'Your bank needs you to confirm your Regroup payment. Open billing in Regroup to finish it.',
};
