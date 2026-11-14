import type Stripe from 'stripe';

/**
 * Owner decision (spec §4.1 item 1): residents and the operator keep access for
 * 7 days from the first failed payment. Retries and late delivery don't
 * restart it; a successful payment ends it.
 */
export const GRACE_PERIOD_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * When the invoice was finalized, in Stripe seconds. That never changes for an
 * invoice, so a late or retried event gives the same answer as a timely one.
 * Falls back to the invoice's creation time; callers log when it does.
 */
export function invoiceFinalizedAt(invoice: Stripe.Invoice): number {
  return invoice.status_transitions?.finalized_at ?? invoice.created;
}

/**
 * The house's grace deadline once this invoice has failed: 7 days after it was
 * finalized, unless the house is already in a grace that ends sooner.
 * A deadline from before this invoice (one a missed success left behind) is
 * not a running grace, so it is ignored rather than cutting the new one short.
 */
export function graceDeadline(existing: unknown, finalizedAtSeconds: number): string {
  const finalizedMs = finalizedAtSeconds * 1000;
  const candidate = finalizedMs + GRACE_PERIOD_DAYS * DAY_MS;
  const current = typeof existing === 'string' ? Date.parse(existing) : NaN;
  const running = Number.isFinite(current) && current > finalizedMs;
  return new Date(running ? Math.min(current, candidate) : candidate).toISOString();
}
