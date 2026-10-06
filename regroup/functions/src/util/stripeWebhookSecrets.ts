import { logger } from 'firebase-functions';

/**
 * Supplies the webhook signing secrets an endpoint may legitimately be signed
 * with, for the caller to try in order.
 *
 * Why a list and not one secret. Stripe webhook endpoints are per-mode objects:
 * the same URL registered in test mode and in live mode is two endpoints with
 * two different signing secrets. One deployed function URL can therefore receive
 * both, while the deployment holds exactly one STRIPE_SECRET_KEY. An earlier
 * version of this module derived a single mode from that key's prefix and
 * returned one secret — so whichever mode it guessed, the other mode's events
 * failed with "signature verification failed", the precise failure this module
 * exists to prevent.
 *
 * The payload cannot settle it either: `livemode` is in the body, and the body is
 * unauthenticated until the signature verifies. So the only sound approach is to
 * try each candidate and let verification decide.
 *
 * This also makes signing-secret rotation survivable. Stripe keeps the previous
 * secret valid for an overlap window after a roll, and accepting several
 * candidates means that window needs no redeploy and drops nothing in flight.
 * Returning a single string made zero-downtime rotation structurally impossible.
 *
 * All four secrets live in Secret Manager, declared in config.ts and bound per
 * function: the platform handler gets the platform pair, the Connect handler the
 * Connect pair. They arrive via process.env because that is how Firebase injects
 * a bound secret at runtime.
 */

export type StripeWebhookEndpoint = 'platform' | 'connect';

export interface WebhookSecretCandidate {
  /** Env var name. Safe to log; the value never is. */
  readonly name: string;
  readonly value: string;
}

const LIVE_SECRET_VAR: Record<StripeWebhookEndpoint, string> = {
  platform: 'STRIPE_WEBHOOK_SECRET',
  connect: 'STRIPE_CONNECT_WEBHOOK_SECRET',
};

const TEST_SECRET_VAR: Record<StripeWebhookEndpoint, string> = {
  platform: 'STRIPE_TEST_WEBHOOK_SECRET',
  connect: 'STRIPE_CONNECT_TEST_WEBHOOK_SECRET',
};

/** Raised when no signing secret is configured for an endpoint at all. */
export class WebhookSecretMissingError extends Error {
  constructor(
    readonly variableNames: string,
    readonly endpoint: StripeWebhookEndpoint,
  ) {
    super(
      `No signing secret configured for the ${endpoint} webhook endpoint. ` +
        `Set one of: ${variableNames}.`,
    );
    this.name = 'WebhookSecretMissingError';
  }
}

/**
 * True when the bound key is a test key.
 *
 * Used only to ORDER the candidates so the likelier secret is tried first.
 * Correctness no longer depends on getting this right — every configured
 * candidate is tried regardless — which is the point of the rework.
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
 * Every configured signing secret for `endpoint`, likeliest first.
 *
 * Throws WebhookSecretMissingError when none is set. That is server
 * misconfiguration rather than a bad request: handing an empty secret to
 * constructEvent reports a signature failure and blames the sender.
 */
export const webhookSecretCandidates = (
  endpoint: StripeWebhookEndpoint,
): WebhookSecretCandidate[] => {
  const testFirst = isStripeTestMode();
  const names = testFirst
    ? [TEST_SECRET_VAR[endpoint], LIVE_SECRET_VAR[endpoint]]
    : [LIVE_SECRET_VAR[endpoint], TEST_SECRET_VAR[endpoint]];

  const found = names
    .map((name) => ({ name, value: process.env[name]?.trim() }))
    .filter((c): c is WebhookSecretCandidate => Boolean(c.value));

  if (found.length === 0) {
    throw new WebhookSecretMissingError(names.join(' or '), endpoint);
  }

  // Names only, never values. Without this the configuration in force is
  // invisible, and a verification failure gives no way to tell a wrong secret
  // from a missing one.
  logger.debug('webhookSecretCandidates: resolved', {
    endpoint,
    candidates: found.map((c) => c.name),
  });

  return found;
};
