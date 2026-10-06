import { logger } from 'firebase-functions';
import type Stripe from 'stripe';

/**
 * The one Stripe API version this service speaks on OUTBOUND calls.
 *
 * Every Stripe client must be constructed with this. It used to be set in four
 * places from two different sources — three files hardcoded "2026-01-28.clover"
 * while src/api/stripe.ts read process.env.STRIPE_API_VERSION — so different
 * code paths could send requests under different API versions and get
 * differently shaped objects back.
 *
 * What this does NOT control: the shape of INBOUND webhook payloads. Stripe
 * renders an event using the API version configured on the webhook endpoint in
 * the Dashboard, falling back to the account default — not the apiVersion of the
 * client that happens to receive it. Bumping this constant therefore cannot fix
 * or cause a webhook payload mismatch; that is a Dashboard setting, and keeping
 * it in step with this pin is a separate manual check. An earlier version of
 * this comment claimed otherwise.
 *
 * The env var still wins, so a deployed override keeps working, but it now
 * applies to every client rather than one of them. regroup/scripts/
 * preflight-billing.js reads PINNED_API_VERSION out of this file and compares it
 * against the deployed STRIPE_API_VERSION.
 *
 * That gate blocks the deploy only once TIER_BILLING_ENABLED=true in the deployed
 * config, or when the script is run by hand with --strict. The wired predeploy
 * passes no --strict (regroup/firebase.json), so BEFORE go-live a divergent
 * version is a loud warning and the deploy proceeds. Treat the gate as advisory
 * until TIER_BILLING_ENABLED=true, not as an unconditional block.
 *
 * Read at MODULE LOAD, which is correct for a plain config var baked in by the
 * Firebase CLI, and is why this should not become a Secret Manager secret. The
 * mechanism, narrowly: the Firebase CLI loads these modules during deploy-time
 * function DISCOVERY with no secret bound, so a secret-backed pin would read as
 * absent there and fall back silently. (In the deployed runtime a bound secret IS
 * present before the process starts — Cloud Run mounts it as an env var — so the
 * problem is discovery, not runtime.)
 *
 * Changing this value changes the shape of objects Stripe returns. Treat a bump
 * as its own change with its own verification, never as a drive-by.
 */
const PINNED_API_VERSION = '2026-01-28.clover' as Stripe.LatestApiVersion;

// Empty-string-as-unset, matching util/stripeWebhookSecrets.ts. `??` alone does
// not catch '', and an empty apiVersion is not inert: stripe-node selects its
// own default with `||`, so STRIPE_API_VERSION= in .env would hand every client
// the SDK default while appearing to be a deliberate override. Harmless only
// while the SDK default equals the pin, which the next SDK upgrade ends.
const rawApiVersion = process.env.STRIPE_API_VERSION?.trim();

export const STRIPE_API_VERSION: Stripe.LatestApiVersion = rawApiVersion
  ? (rawApiVersion as Stripe.LatestApiVersion)
  : PINNED_API_VERSION;

/** 'override' when STRIPE_API_VERSION supplied the value, 'pin' otherwise. */
export const STRIPE_API_VERSION_SOURCE: 'override' | 'pin' = rawApiVersion
  ? 'override'
  : 'pin';

// Logged once per cold start, because the resolution above is otherwise invisible
// at runtime. The only other signal is regroup/scripts/preflight-billing.js, which
// is advisory until TIER_BILLING_ENABLED=true and can be skipped or run without
// --strict — so a divergent deployed override could otherwise reach production
// with nothing recording which version is in force. This line does not depend on
// that gate.
//
// Safe at module load: the value is a plain config var (never a secret) and
// carries no PII. It also emits during the Firebase CLI's deploy-time function
// discovery, which is harmless and is itself a useful confirmation of the value
// about to ship.
logger.info('stripeApiVersion: resolved', {
  apiVersion: STRIPE_API_VERSION,
  source: STRIPE_API_VERSION_SOURCE,
  pinned: PINNED_API_VERSION,
});
