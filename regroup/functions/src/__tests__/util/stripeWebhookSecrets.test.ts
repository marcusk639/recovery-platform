/**
 * Guards webhook-secret mode resolution.
 *
 * The behaviour that matters: a signature can only be verified with the signing
 * secret from the same Stripe mode as the key that produced the event. Picking
 * the wrong one presents as "signature verification failed", which sends you
 * looking at Stripe rather than at your own configuration.
 */
import {
  isStripeTestMode,
  resolveWebhookSecret,
  WebhookSecretMissingError,
} from '../../util/stripeWebhookSecrets';

const ENV_KEYS = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_MODE',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_CONNECT_WEBHOOK_SECRET',
  'STRIPE_TEST_WEBHOOK_SECRET',
  'STRIPE_CONNECT_TEST_WEBHOOK_SECRET',
] as const;

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = saved[key];
    }
  }
});

describe('isStripeTestMode', () => {
  it('derives test mode from a test secret key', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_abc';
    expect(isStripeTestMode()).toBe(true);
  });

  it('derives test mode from a test restricted key', () => {
    process.env.STRIPE_SECRET_KEY = 'rk_test_abc';
    expect(isStripeTestMode()).toBe(true);
  });

  it('derives live mode from a live key', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_abc';
    expect(isStripeTestMode()).toBe(false);
  });

  it('treats an absent key as live, so it never silently reaches for test secrets', () => {
    expect(isStripeTestMode()).toBe(false);
  });

  it('lets an explicit override win over the key', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_abc';
    process.env.STRIPE_WEBHOOK_MODE = 'test';
    expect(isStripeTestMode()).toBe(true);

    process.env.STRIPE_SECRET_KEY = 'sk_test_abc';
    process.env.STRIPE_WEBHOOK_MODE = 'live';
    expect(isStripeTestMode()).toBe(false);
  });

  it('ignores case and surrounding whitespace in the override', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_abc';
    process.env.STRIPE_WEBHOOK_MODE = '  TEST  ';
    expect(isStripeTestMode()).toBe(true);
  });

  it('falls back to key derivation for an unrecognised override', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_abc';
    process.env.STRIPE_WEBHOOK_MODE = 'sandbox';
    expect(isStripeTestMode()).toBe(true);
  });
});

describe('resolveWebhookSecret — live mode', () => {
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_abc';
  });

  it('uses the live secret for each endpoint', () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_platform_live';
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET = 'whsec_connect_live';

    expect(resolveWebhookSecret('platform')).toBe('whsec_platform_live');
    expect(resolveWebhookSecret('connect')).toBe('whsec_connect_live');
  });

  it('never falls back to a test secret in live mode', () => {
    process.env.STRIPE_TEST_WEBHOOK_SECRET = 'whsec_platform_test';

    expect(() => resolveWebhookSecret('platform')).toThrow(WebhookSecretMissingError);
  });
});

describe('resolveWebhookSecret — test mode', () => {
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_abc';
  });

  it('prefers the test secret when present', () => {
    process.env.STRIPE_TEST_WEBHOOK_SECRET = 'whsec_platform_test';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_platform_live';

    expect(resolveWebhookSecret('platform')).toBe('whsec_platform_test');
  });

  it('prefers the connect test secret when present', () => {
    process.env.STRIPE_CONNECT_TEST_WEBHOOK_SECRET = 'whsec_connect_test';
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET = 'whsec_connect_live';

    expect(resolveWebhookSecret('connect')).toBe('whsec_connect_test');
  });

  // The compatibility guarantee: a sandbox already running a test key against
  // the live-named variable keeps working. Removing this fallback broke 71
  // existing tests, which is what surfaced the regression.
  it('falls back to the live-named secret when no test secret is set', () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_platform_live';

    expect(resolveWebhookSecret('platform')).toBe('whsec_platform_live');
  });

  it('falls back for the connect endpoint too', () => {
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET = 'whsec_connect_live';

    expect(resolveWebhookSecret('connect')).toBe('whsec_connect_live');
  });
});

describe('resolveWebhookSecret — misconfiguration', () => {
  it('throws naming both candidates when nothing is set in test mode', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_abc';

    expect(() => resolveWebhookSecret('platform')).toThrow(
      /STRIPE_TEST_WEBHOOK_SECRET or STRIPE_WEBHOOK_SECRET/,
    );
  });

  it('throws naming the live variable when nothing is set in live mode', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_abc';

    expect(() => resolveWebhookSecret('connect')).toThrow(/STRIPE_CONNECT_WEBHOOK_SECRET/);
  });

  it('reports the mode and endpoint on the error', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_abc';

    try {
      resolveWebhookSecret('connect');
      throw new Error('expected resolveWebhookSecret to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(WebhookSecretMissingError);
      const typed = err as WebhookSecretMissingError;
      expect(typed.mode).toBe('test');
      expect(typed.endpoint).toBe('connect');
    }
  });

  it('treats an empty string as unset rather than a usable secret', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_abc';
    process.env.STRIPE_WEBHOOK_SECRET = '';

    expect(() => resolveWebhookSecret('platform')).toThrow(WebhookSecretMissingError);
  });
});
