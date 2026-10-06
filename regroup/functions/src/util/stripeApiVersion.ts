import type Stripe from 'stripe';

/**
 * The one Stripe API version this service speaks.
 *
 * Every Stripe client must be constructed with this. It used to be set in four
 * places from two different sources — three files hardcoded
 * "2026-01-28.clover" while src/api/stripe.ts read process.env
 * .STRIPE_API_VERSION — so the tier-billing path could run a different API
 * version than the webhook handler that consumes its events. Object shapes and
 * event payloads differ between versions, so those two disagreeing is a silent
 * data bug, not a style problem.
 *
 * The env var still wins, so a deployed override keeps working, but now it
 * applies to every client rather than one of them. When it is unset, the pinned
 * default applies everywhere instead of falling through to whatever version the
 * installed SDK happens to default to.
 *
 * Changing this value changes the shape of objects Stripe returns and of the
 * webhook events it sends. Treat a bump as its own change with its own
 * verification, never as a drive-by.
 */
const PINNED_API_VERSION = '2026-01-28.clover' as Stripe.LatestApiVersion;

export const STRIPE_API_VERSION: Stripe.LatestApiVersion =
  (process.env.STRIPE_API_VERSION as Stripe.LatestApiVersion | undefined) ?? PINNED_API_VERSION;

