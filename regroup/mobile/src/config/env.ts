/**
 * Accessors for values injected at bundle time by babel.config.js (BUNDLED_ENV).
 *
 * Read these instead of `process.env` directly. A `process.env.X` read for a
 * name that is not in BUNDLED_ENV is always `undefined` in a built app, and the
 * failure is silent — which is how `pk_test_placeholder` reached every build.
 *
 * These are functions, not constants, so Jest can set `process.env` and
 * re-require a module; the babel substitution is disabled under NODE_ENV=test.
 */

/** Shipped in every build before a build-time config mechanism existed. */
export const PLACEHOLDER_STRIPE_KEY = 'pk_test_placeholder';

const DEFAULT_WEB_BASE_URL = 'https://regroup-app.com';

/**
 * The Stripe publishable key, or '' when unconfigured.
 *
 * Returns '' rather than a placeholder so callers must handle the unconfigured
 * case: a placeholder key is truthy, so StripeProvider initialises the native
 * SDK with a key that cannot work, and the failure surfaces at the point of
 * payment where the resident sees it. '' makes StripeProvider skip init
 * entirely (it guards on `if (!publishableKey) return`).
 *
 * Never returns undefined, which is a separate hazard: homegroups/mobile hit a
 * launch-time SIGTRAP because stripe-react-native's native initialise
 * force-casts the key (`as! String`) and nil crashes the cast. See the comment
 * at homegroups/mobile/App.tsx. That app pins SDK 0.45, which lacks the falsy
 * guard regroup's 0.67 has, so it skips initStripe by hand.
 */
export const stripePublishableKey = (): string => {
  const key = process.env.STRIPE_PUBLISHABLE_KEY;
  if (!key || key === PLACEHOLDER_STRIPE_KEY) {
    return '';
  }
  return key;
};

/** True when a usable publishable key was baked into this bundle. */
export const isStripeConfigured = (): boolean => stripePublishableKey() !== '';

/** True for a live-mode key. Test-mode keys must never reach a store build. */
export const isLiveStripeKey = (key: string = stripePublishableKey()): boolean =>
  key.startsWith('pk_live_');

/**
 * Base URL of the Regroup web app, with any trailing slashes removed.
 *
 * Falls back to production because an operator sent to the wrong host sees a
 * broken link, whereas an unconfigured Stripe key silently takes payments
 * nowhere — the two failures do not warrant the same strictness.
 */
export const webBaseUrl = (): string =>
  ((process.env.RATS_WEB_URL as string | undefined) ?? DEFAULT_WEB_BASE_URL).replace(/\/+$/, '');
