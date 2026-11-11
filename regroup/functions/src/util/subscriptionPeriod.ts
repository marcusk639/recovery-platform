import type Stripe from "stripe";

/**
 * When the operator's current period ends, in Stripe seconds: the trial end
 * while trialing, otherwise the item's period end. API 2026-01-28.clover has no
 * current_period_end on the subscription, and billing_cycle_anchor is the
 * cycle's start, not its end. Null when Stripe sent neither.
 */
export const periodEndSeconds = (
  subscription: Stripe.Subscription,
  itemId?: string,
): number | null => {
  if (subscription.status === "trialing" && subscription.trial_end != null) {
    return subscription.trial_end;
  }
  const items = subscription.items?.data ?? [];
  const item = items.find((i) => i.id === itemId) ?? items[0];
  return item?.current_period_end ?? null;
};
