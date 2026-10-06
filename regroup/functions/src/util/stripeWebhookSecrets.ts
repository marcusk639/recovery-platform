import { logger } from 'firebase-functions';

/**
 * Supplies the webhook signing secrets an endpoint may legitimately be signed
 * with, for the caller to try in order. This module OWNS that rationale; other
 * files point here rather than restating it.
 *
 * Why a list and not one secret. Stripe webhook endpoints are per-mode objects:
 * the same URL registered in test mode and in live mode is two endpoints with two
 * different signing secrets. One deployed function URL can therefore receive
 * both, while the deployment holds exactly one STRIPE_SECRET_KEY. Deriving a
 * single mode from that key's prefix and returning one secret fails the other
 * mode's events with "signature verification failed" — the precise failure this
 * module exists to prevent.
 *
 * The payload cannot choose the secret either: `livemode` is in the body, and the
 * body is unauthenticated BEFORE the signature verifies. So the sound approach is
 * to try each candidate and let verification decide WHICH SECRET applies.
 *
 * That is a statement about secret SELECTION, and it does not extend to ignoring
 * `livemode` afterwards. AFTER a candidate verifies, the body is authenticated and
 * `event.livemode` is the authenticated statement of which Stripe mode produced
 * the event. Selection is not authorization: both mode secrets are bound to both
 * deployed functions, so a live deployment that skips the post-verification check
 * acts on genuine test-mode events and mutates production data from them.
 * util/verifyStripeWebhook.ts applies that check; `mode` below is what it compares
 * against.
 *
 * A list also keeps signing-secret rotation survivable. Stripe keeps the previous
 * secret valid for an overlap window after a roll, so accepting several candidates
 * lets that window pass with no redeploy and nothing dropped in flight. Only one
 * env var per mode exists today, so that tolerance is structural rather than
 * exercised.
 *
 * All four secrets live in Secret Manager, declared in config.ts and bound per
 * function: the platform handler gets the platform pair, the Connect handler the
 * Connect pair. They arrive via process.env because that is how Firebase injects
 * a bound secret into a running function.
 */

export type StripeWebhookEndpoint = 'platform' | 'connect';

/** Which Stripe mode a key, secret, or event belongs to. */
export type StripeMode = 'test' | 'live';

export interface WebhookSecretCandidate {
  /** Env var name. Safe to log; the value never is. */
  readonly name: string;
  readonly value: string;
  /**
   * The Stripe mode this secret belongs to, fixed by which env var it came from
   * — not inferred from anything in the request. A signature only verifies
   * against the secret of the endpoint that signed it, so once a candidate
   * verifies, this is the authenticated mode of the signer.
   */
  readonly mode: StripeMode;
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
 * True when the bound key is a test key, honouring the STRIPE_WEBHOOK_MODE
 * override.
 *
 * ORDERING ONLY: it decides which candidate is tried first and nothing else.
 * Verification tries every candidate regardless, so a wrong answer here costs at
 * most one extra HMAC.
 *
 * Deliberately NOT the input to the mode guard. STRIPE_WEBHOOK_MODE has no other
 * call site, appears in no documentation, and is absent from the preflight's
 * CONFIG_REQUIRED list — so routing the guard through it would let an
 * undocumented env var decide which events a deployment may act on.
 * deployedStripeMode() below reads the bound key alone.
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
 * The Stripe mode this deployment is authorized to act on.
 *
 * Read from the bound STRIPE_SECRET_KEY and nothing else — not from request data,
 * and not from STRIPE_WEBHOOK_MODE (see isStripeTestMode above). The key is the
 * credential the deployment actually holds, which makes it the one honest
 * statement of which mode the deployment belongs to.
 *
 * An unset or unrecognised key yields 'live', so the guard fails closed: a
 * deployment that cannot show it is a test deployment is held to live-mode events.
 */
export const deployedStripeMode = (): StripeMode => {
  const key = process.env.STRIPE_SECRET_KEY ?? '';
  return key.startsWith('sk_test_') || key.startsWith('rk_test_') ? 'test' : 'live';
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
  const ordered: ReadonlyArray<{ name: string; mode: StripeMode }> = testFirst
    ? [
        { name: TEST_SECRET_VAR[endpoint], mode: 'test' },
        { name: LIVE_SECRET_VAR[endpoint], mode: 'live' },
      ]
    : [
        { name: LIVE_SECRET_VAR[endpoint], mode: 'live' },
        { name: TEST_SECRET_VAR[endpoint], mode: 'test' },
      ];

  const found = ordered
    .map(({ name, mode }) => ({ name, mode, value: process.env[name]?.trim() }))
    .filter((c): c is WebhookSecretCandidate => Boolean(c.value));

  if (found.length === 0) {
    throw new WebhookSecretMissingError(ordered.map((c) => c.name).join(' or '), endpoint);
  }

  // Names only, never values. Without this the configuration in force is
  // invisible, and a verification failure gives no way to tell a wrong secret
  // from a missing one. INFO, not debug: the surrounding lifecycle lines are
  // INFO and failures WARN, so at the default severity>=DEFAULT log filter a
  // debug line here would drop exactly the record of which secrets were on
  // offer — the first thing needed to explain a rejection.
  logger.info('webhookSecretCandidates: resolved', {
    endpoint,
    deployedMode: deployedStripeMode(),
    candidates: found.map((c) => `${c.name}:${c.mode}`),
  });

  return found;
};
