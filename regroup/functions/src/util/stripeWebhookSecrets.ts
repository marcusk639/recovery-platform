/**
 * Resolves the webhook signing secret for an endpoint, in whichever Stripe mode
 * this service is actually operating in.
 *
 * Why mode is derived from the API key rather than from a separate flag: a
 * webhook signature can only be verified with the signing secret belonging to
 * the same Stripe mode as the key that created the objects. Mode is therefore a
 * property of the key, not of the host — deriving it removes the failure where
 * someone points the service at a test key and forgets a second switch, which
 * presents as "signature verification failed" and sends you hunting the wrong
 * problem.
 *
 * STRIPE_WEBHOOK_MODE=test|live overrides the derivation for the case the
 * heuristic cannot see, such as a restricted key with an unusual prefix.
 *
 * The test-mode secrets are read straight from process.env rather than through
 * defineSecret, because they belong in .env.local — which the emulator loads and
 * deploys exclude. Routing them through Secret Manager would put test
 * credentials in the production function's config for no benefit. The live
 * secrets stay in Secret Manager and stay bound on each function.
 */

export type StripeWebhookEndpoint = 'platform' | 'connect';

const LIVE_SECRET_VAR: Record<StripeWebhookEndpoint, string> = {
  platform: 'STRIPE_WEBHOOK_SECRET',
  connect: 'STRIPE_CONNECT_WEBHOOK_SECRET',
};

const TEST_SECRET_VAR: Record<StripeWebhookEndpoint, string> = {
  platform: 'STRIPE_TEST_WEBHOOK_SECRET',
  connect: 'STRIPE_CONNECT_TEST_WEBHOOK_SECRET',
};

/** Raised when the secret for the resolved mode is absent. */
export class WebhookSecretMissingError extends Error {
  constructor(
    readonly variableName: string,
    readonly mode: 'test' | 'live',
    readonly endpoint: StripeWebhookEndpoint,
  ) {
    super(
      `${variableName} is not set, so ${endpoint} webhook signatures cannot be ` +
        `verified in ${mode} mode.`,
    );
    this.name = 'WebhookSecretMissingError';
  }
}

/**
 * True when this service is talking to Stripe in test mode.
 *
 * Must only be called from inside a handler: STRIPE_SECRET_KEY is a bound
 * secret and is not present in process.env at module load.
 */
export const isStripeTestMode = (): boolean => {
  const override = process.env.STRIPE_WEBHOOK_MODE?.trim().toLowerCase();
  if (override === 'test') {
    return true;
  }
  if (override === 'live') {
    return false;
  }
  const key = process.env.STRIPE_SECRET_KEY ?? '';
  return key.startsWith('sk_test_') || key.startsWith('rk_test_');
};

/**
 * The signing secret for `endpoint`, or a WebhookSecretMissingError naming the
 * variable that needs setting. Never returns an empty string: passing one to
 * constructEvent reports a signature failure, which blames Stripe for what is
 * actually local misconfiguration.
 */
export const resolveWebhookSecret = (endpoint: StripeWebhookEndpoint): string => {
  const testMode = isStripeTestMode();

  // Ordered candidates, first one set wins. In test mode the test-specific
  // variable is preferred, but the live-named one is still accepted — which
  // keeps this strictly additive. A sandbox already running a test key against
  // STRIPE_WEBHOOK_SECRET keeps working, and setting STRIPE_TEST_WEBHOOK_SECRET
  // is what opts into the split. Without this fallback the resolver broke every
  // such deployment, which is how 71 tests caught it.
  const candidates = testMode
    ? [TEST_SECRET_VAR[endpoint], LIVE_SECRET_VAR[endpoint]]
    : [LIVE_SECRET_VAR[endpoint]];

  for (const variableName of candidates) {
    const secret = process.env[variableName];
    if (secret) {
      return secret;
    }
  }

  throw new WebhookSecretMissingError(
    candidates.join(' or '),
    testMode ? 'test' : 'live',
    endpoint,
  );
};
