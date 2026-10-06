import { logger } from "firebase-functions";

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
 * All four signing secrets live in Secret Manager, declared in config.ts and
 * bound per function: the platform handler gets the platform pair, the Connect
 * handler the Connect pair. They reach this module through process.env because
 * that is how Firebase injects a bound secret at runtime, not because they are
 * plain environment config.
 *
 * An earlier revision of this comment said the test secrets belonged in
 * .env.local and were deliberately kept out of Secret Manager. That stopped
 * being true within the same change set, and following it would have put an
 * operator's secret somewhere the deployed function cannot read while the
 * deploy failed for the missing Secret Manager entry.
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
      // Logged on every resolution, names only, never values. Without this the
      // fallback below is silent, and a test-mode deployment verifying against
      // the live secret produces nothing but "signature verification failed" —
      // the exact symptom deriving mode from the key was meant to eliminate.
      // Mode and chosen variable are what make that diagnosable from logs.
      const usedFallback = testMode && variableName === LIVE_SECRET_VAR[endpoint];
      if (usedFallback) {
        logger.warn('resolveWebhookSecret: test mode using live-named secret', {
          endpoint,
          mode: 'test',
          usedVariable: variableName,
          preferredVariable: TEST_SECRET_VAR[endpoint],
        });
      } else {
        logger.debug('resolveWebhookSecret: resolved', {
          endpoint,
          mode: testMode ? 'test' : 'live',
          usedVariable: variableName,
        });
      }
      return secret;
    }
  }

  throw new WebhookSecretMissingError(
    candidates.join(' or '),
    testMode ? 'test' : 'live',
    endpoint,
  );
};
