/**
 * Guards webhook signing-secret candidate resolution.
 *
 * The behaviour that matters: one function URL can be registered as both a test
 * and a live webhook endpoint in Stripe, each with its own signing secret, and a
 * rolled secret stays valid alongside its replacement for an overlap window. So
 * every configured secret must be offered — returning one, chosen by guessing the
 * mode, rejects the other half.
 */
import {
  deployedStripeMode,
  isStripeTestMode,
  webhookSecretCandidates,
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

const names = (endpoint: 'platform' | 'connect') =>
  webhookSecretCandidates(endpoint).map((c) => c.name);

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

  it('treats an absent key as live', () => {
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

// The reason this module was reworked. A single returned secret could only ever
// verify one mode's events, so the other mode's events failed signature
// verification on a URL Stripe was legitimately signing for.
describe('webhookSecretCandidates — both modes on one URL', () => {
  it('offers both secrets when both are configured, for the platform endpoint', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_abc';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_live';
    process.env.STRIPE_TEST_WEBHOOK_SECRET = 'whsec_test';

    expect(names('platform')).toEqual(['STRIPE_WEBHOOK_SECRET', 'STRIPE_TEST_WEBHOOK_SECRET']);
  });

  it('offers both secrets for the connect endpoint', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_abc';
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET = 'whsec_connect_live';
    process.env.STRIPE_CONNECT_TEST_WEBHOOK_SECRET = 'whsec_connect_test';

    expect(names('connect')).toEqual([
      'STRIPE_CONNECT_WEBHOOK_SECRET',
      'STRIPE_CONNECT_TEST_WEBHOOK_SECRET',
    ]);
  });

  it('never mixes platform and connect secrets', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_abc';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_live';
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET = 'whsec_connect_live';

    expect(names('platform')).toEqual(['STRIPE_WEBHOOK_SECRET']);
    expect(names('connect')).toEqual(['STRIPE_CONNECT_WEBHOOK_SECRET']);
  });
});

describe('webhookSecretCandidates — ordering', () => {
  // Ordering is an optimisation, not a correctness requirement: the likelier
  // secret is tried first to avoid a wasted HMAC, but both are always offered.
  it('puts the test secret first under a test key', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_abc';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_live';
    process.env.STRIPE_TEST_WEBHOOK_SECRET = 'whsec_test';

    expect(names('platform')).toEqual(['STRIPE_TEST_WEBHOOK_SECRET', 'STRIPE_WEBHOOK_SECRET']);
  });

  it('puts the live secret first under a live key', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_abc';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_live';
    process.env.STRIPE_TEST_WEBHOOK_SECRET = 'whsec_test';

    expect(names('platform')).toEqual(['STRIPE_WEBHOOK_SECRET', 'STRIPE_TEST_WEBHOOK_SECRET']);
  });
});

describe('webhookSecretCandidates — partial configuration', () => {
  it('offers the live secret alone when no test secret is set', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_abc';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_live';

    expect(names('platform')).toEqual(['STRIPE_WEBHOOK_SECRET']);
  });

  // A test key with only the live-named secret set still works: this is what
  // keeps an existing sandbox deployment running unchanged.
  it('offers the live secret under a test key when no test secret is set', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_abc';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_live';

    expect(names('platform')).toEqual(['STRIPE_WEBHOOK_SECRET']);
  });

  it('offers the test secret alone when no live secret is set', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_abc';
    process.env.STRIPE_TEST_WEBHOOK_SECRET = 'whsec_test';

    expect(names('platform')).toEqual(['STRIPE_TEST_WEBHOOK_SECRET']);
  });

  it('returns the value and the mode alongside the name', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_abc';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_live';

    expect(webhookSecretCandidates('platform')).toEqual([
      { name: 'STRIPE_WEBHOOK_SECRET', value: 'whsec_live', mode: 'live' },
    ]);
  });

  // `mode` is what verifyStripeWebhook asserts the verified event against, so it
  // must come from WHICH VAR the secret was read from and nothing else. Reading
  // it from the key's mode instead would make both candidates claim the
  // deployment's mode and silently neuter the cross-mode check.
  it('tags each candidate with the mode of its own env var, not the key mode', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_abc';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_live';
    process.env.STRIPE_TEST_WEBHOOK_SECRET = 'whsec_test';

    expect(webhookSecretCandidates('platform').map((c) => [c.name, c.mode])).toEqual([
      ['STRIPE_WEBHOOK_SECRET', 'live'],
      ['STRIPE_TEST_WEBHOOK_SECRET', 'test'],
    ]);
  });

  // STRIPE_WEBHOOK_MODE must reach ORDERING ONLY, never the mode guard. It has no
  // other call site, no documentation, and no entry in the preflight's
  // CONFIG_REQUIRED list, so letting it decide which events a deployment may act
  // on would put authorization behind an undocumented env var. deployedStripeMode()
  // reads the bound key alone.
  it('lets STRIPE_WEBHOOK_MODE reorder candidates', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_abc';
    process.env.STRIPE_WEBHOOK_MODE = 'test';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_live';
    process.env.STRIPE_TEST_WEBHOOK_SECRET = 'whsec_test';

    expect(names('platform')).toEqual([
      'STRIPE_TEST_WEBHOOK_SECRET',
      'STRIPE_WEBHOOK_SECRET',
    ]);
  });

  it('does NOT let STRIPE_WEBHOOK_MODE change the authorized mode', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_abc';
    process.env.STRIPE_WEBHOOK_MODE = 'test';

    expect(deployedStripeMode()).toBe('live');
  });

  it('derives the authorized mode from the bound key', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_abc';
    delete process.env.STRIPE_WEBHOOK_MODE;
    expect(deployedStripeMode()).toBe('test');

    process.env.STRIPE_SECRET_KEY = 'rk_test_abc';
    expect(deployedStripeMode()).toBe('test');

    process.env.STRIPE_SECRET_KEY = 'sk_live_abc';
    expect(deployedStripeMode()).toBe('live');
  });

  it('fails closed to live when no key is bound', () => {
    // A deployment that cannot show it is a test deployment is held to live-mode
    // events, rather than defaulting to the permissive side.
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_MODE;

    expect(deployedStripeMode()).toBe('live');
  });

  it('tags the Connect pair the same way', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_abc';
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET = 'whsec_connect_live';
    process.env.STRIPE_CONNECT_TEST_WEBHOOK_SECRET = 'whsec_connect_test';

    expect(webhookSecretCandidates('connect').map((c) => [c.name, c.mode])).toEqual([
      ['STRIPE_CONNECT_TEST_WEBHOOK_SECRET', 'test'],
      ['STRIPE_CONNECT_WEBHOOK_SECRET', 'live'],
    ]);
  });

  it('trims a padded secret', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_abc';
    process.env.STRIPE_WEBHOOK_SECRET = '  whsec_live  ';

    expect(webhookSecretCandidates('platform')[0].value).toBe('whsec_live');
  });
});

describe('webhookSecretCandidates — misconfiguration', () => {
  it('throws naming both candidates when nothing is set', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_abc';

    expect(() => webhookSecretCandidates('platform')).toThrow(
      /STRIPE_TEST_WEBHOOK_SECRET or STRIPE_WEBHOOK_SECRET/,
    );
  });

  it('names the connect variables for the connect endpoint', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_abc';

    expect(() => webhookSecretCandidates('connect')).toThrow(
      /STRIPE_CONNECT_WEBHOOK_SECRET or STRIPE_CONNECT_TEST_WEBHOOK_SECRET/,
    );
  });

  it('reports the endpoint on the error', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_abc';

    try {
      webhookSecretCandidates('connect');
      throw new Error('expected webhookSecretCandidates to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(WebhookSecretMissingError);
      expect((err as WebhookSecretMissingError).endpoint).toBe('connect');
    }
  });

  it('treats an empty string as unset rather than a usable secret', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_abc';
    process.env.STRIPE_WEBHOOK_SECRET = '';

    expect(() => webhookSecretCandidates('platform')).toThrow(WebhookSecretMissingError);
  });

  it('treats whitespace as unset', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_abc';
    process.env.STRIPE_WEBHOOK_SECRET = '   ';

    expect(() => webhookSecretCandidates('platform')).toThrow(WebhookSecretMissingError);
  });
});
