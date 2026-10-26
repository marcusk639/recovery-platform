import {
  assertSandboxAccount,
  assertSandboxHygiene,
  assertWebhookUrls,
  ensureCatalog,
  ensureWebhooks,
  isAllowedWebhookUrl,
  PRODUCTION_SANDBOX_ACCOUNT_ID,
  PLATFORM_EVENTS,
  CONNECT_EVENTS,
} from '../stripeSandbox';
import { makeStripe } from './helpers/mockStripe';

const PLATFORM_URL = 'https://us-central1-regroup-e2e.cloudfunctions.net/stripeEvents';
const CONNECT_URL = 'https://us-central1-regroup-e2e.cloudfunctions.net/handleStripeConnectWebhook';

describe('ensureCatalog', () => {
  it('creates each object once across two runs', async () => {
    const { mock, stripe } = makeStripe();
    const first = await ensureCatalog(stripe);
    const created = {
      products: mock.products.create.mock.calls.length,
      prices: mock.prices.create.mock.calls.length,
      coupons: mock.coupons.create.mock.calls.length,
    };
    const second = await ensureCatalog(stripe);

    expect(second).toEqual(first);
    expect(mock.products.create).toHaveBeenCalledTimes(created.products);
    expect(mock.prices.create).toHaveBeenCalledTimes(created.prices);
    expect(mock.coupons.create).toHaveBeenCalledTimes(created.coupons);
    expect(created).toEqual({ products: 8, prices: 14, coupons: 2 });
  });

  it('makes annual 10x monthly and maps env names to price ids', async () => {
    const { stripe, prices } = makeStripe();
    const ids = await ensureCatalog(stripe);

    expect(prices['regroup_tier_trad_starter_monthly'].unit_amount).toBe(6900);
    expect(prices['regroup_tier_trad_starter_annual'].unit_amount).toBe(69000);
    expect(prices['regroup_tier_trad_starter_annual'].recurring.interval).toBe('year');
    expect(ids.STRIPE_PRICE_TRAD_STARTER).toBe('price_regroup_tier_trad_starter_monthly');
    expect(ids.STRIPE_PRICE_OXFORD_NETWORK_ANNUAL).toBe('price_regroup_tier_oxford_network_annual');
    expect(ids.STRIPE_HOUSE_PRICE_ID).toBeDefined();
    expect(ids.STRIPE_OXFORD_PRICE_ID).toBeDefined();
  });

  it('creates the bundle coupons at 10% and 15% forever', async () => {
    const { stripe, coupons } = makeStripe();
    await ensureCatalog(stripe);
    expect(coupons['regroup-bundle-3']).toMatchObject({ percent_off: 10, duration: 'forever' });
    expect(coupons['regroup-bundle-5']).toMatchObject({ percent_off: 15, duration: 'forever' });
  });

  it('throws when a reused price has a different amount, interval or product', async () => {
    for (const patch of [
      { unit_amount: 1 },
      { recurring: { interval: 'year' } },
      { product: 'prod_other' },
    ]) {
      const { stripe, prices } = makeStripe();
      await ensureCatalog(stripe);
      Object.assign(prices['regroup_tier_trad_starter_monthly'], patch);
      await expect(ensureCatalog(stripe)).rejects.toThrow(/regroup_tier_trad_starter_monthly/);
    }
  });

  it('throws when a reused coupon has a different percentage', async () => {
    const { stripe, coupons } = makeStripe();
    await ensureCatalog(stripe);
    coupons['regroup-bundle-5'].percent_off = 20;
    await expect(ensureCatalog(stripe)).rejects.toThrow(/regroup-bundle-5/);
  });
});

describe('ensureWebhooks', () => {
  it('creates a platform and a connect endpoint once, reporting secrets via callback', async () => {
    const { mock, stripe } = makeStripe();
    const secrets: string[] = [];
    const opts = {
      platformUrl: PLATFORM_URL,
      connectUrl: CONNECT_URL,
      onSecret: (kind: string) => {
        secrets.push(kind);
      },
    };
    await ensureWebhooks(stripe, opts);
    await ensureWebhooks(stripe, opts);

    expect(mock.webhookEndpoints.create).toHaveBeenCalledTimes(2);
    const [platform, connect] = mock.webhookEndpoints.create.mock.calls.map((c: any) => c[0]);
    expect(platform.enabled_events).toEqual(PLATFORM_EVENTS);
    expect(connect.enabled_events).toEqual(CONNECT_EVENTS);
    expect(connect.connect).toBe(true);
    expect(secrets).toEqual(['platform', 'connect']);
    expect(mock.webhookEndpoints.update).not.toHaveBeenCalled();
    expect(mock.webhookEndpoints.del).not.toHaveBeenCalled();
  });

  it('throws on a reused endpoint that is disabled or has other events, without updating', async () => {
    for (const patch of [{ status: 'disabled' }, { enabled_events: ['charge.refunded'] }]) {
      const { mock, stripe, endpoints } = makeStripe();
      await ensureWebhooks(stripe, { platformUrl: PLATFORM_URL, connectUrl: CONNECT_URL });
      Object.assign(endpoints[0], patch);
      await expect(
        ensureWebhooks(stripe, { platformUrl: PLATFORM_URL, connectUrl: CONNECT_URL }),
      ).rejects.toThrow(/does not match/);
      expect(mock.webhookEndpoints.update).not.toHaveBeenCalled();
      expect(mock.webhookEndpoints.del).not.toHaveBeenCalled();
    }
  });
});

describe('assertWebhookUrls', () => {
  it('accepts https regroup-e2e cloudfunctions hosts', () => {
    expect(() => assertWebhookUrls(PLATFORM_URL, CONNECT_URL)).not.toThrow();
    expect(
      isAllowedWebhookUrl('https://us-central1-regroup-e2e.cloudfunctions.net/stripeEvents'),
    ).toBe(true);
  });

  it('refuses lookalike hosts, ports, credentials and odd paths', () => {
    const bad = [
      'https://x-regroup-e2e.attacker.example/stripeWebhook',
      'https://us-central1-regroup-e2e.cloudfunctions.net:8443/x',
      'https://user:pw@us-central1-regroup-e2e.cloudfunctions.net/x',
      'https://user@us-central1-regroup-e2e.cloudfunctions.net/x',
      'https://us-central1-regroup-e2e.cloudfunctions.net/a/b',
      'https://us-central1-regroup-e2e.cloudfunctions.net/',
      'https://us-central1-regroup-e2e.cloudfunctions.net/x?y=1',
      'not a url',
    ];
    for (const url of bad) expect(isAllowedWebhookUrl(url)).toBe(false);
  });

  it('pins the host to <gcp-region>-regroup-e2e exactly (FORBIDDEN_HOST_PARTS stays)', () => {
    for (const host of [
      'phoenix-cleanhouse-regroup-e2e',
      'us-central1-evil-regroup-e2e',
      'evil-regroup-e2e',
      'us-central-regroup-e2e',
      'regroup-e2e',
    ]) {
      expect(isAllowedWebhookUrl(`https://${host}.cloudfunctions.net/stripeEvents`)).toBe(false);
    }
    for (const region of ['us-central1', 'europe-west1', 'northamerica-northeast1']) {
      expect(
        isAllowedWebhookUrl(`https://${region}-regroup-e2e.cloudfunctions.net/stripeEvents`),
      ).toBe(true);
    }
  });

  it('keeps FORBIDDEN_HOST_PARTS as a second check behind the host pattern', () => {
    // Matches the region shape, so only the forbidden-part check rejects it.
    expect(
      isAllowedWebhookUrl('https://recovery-connect1-regroup-e2e.cloudfunctions.net/stripeEvents'),
    ).toBe(false);
  });

  it('subscribes account.updated on the connect endpoint only', () => {
    expect(PLATFORM_EVENTS).not.toContain('account.updated');
    expect(CONNECT_EVENTS).toContain('account.updated');
  });

  it('pins each endpoint to its deployed function path', () => {
    const base = 'https://us-central1-regroup-e2e.cloudfunctions.net';
    expect(() => assertWebhookUrls(`${base}/stripeWebhook`, CONNECT_URL)).toThrow(/\/stripeEvents/);
    expect(() => assertWebhookUrls(PLATFORM_URL, `${base}/stripeConnectWebhook`)).toThrow(
      /\/handleStripeConnectWebhook/,
    );
    // Swapped: each path is only valid for its own endpoint.
    expect(() => assertWebhookUrls(CONNECT_URL, PLATFORM_URL)).toThrow(/not allowed/);
    expect(isAllowedWebhookUrl(`${base}/stripeWebhook`)).toBe(false);
    expect(isAllowedWebhookUrl(`${base}/handleStripeConnectWebhook`)).toBe(true);
  });

  it('refuses any input that does not round-trip through URL unchanged', () => {
    const host = 'us-central1-regroup-e2e.cloudfunctions.net';
    const variants = [
      ` https://${host}/stripeEvents`,
      `https://${host}/stripeEvents `,
      `https://${host}/stripe\tEvents`,
      `https://${host}/stripe\nEvents`,
      `https://${host}\\stripeEvents`,
      `https://${host}/x/../stripeEvents`,
      `https://${host}/%2e/stripeEvents`,
      `https://${host}/%2E%2E/stripeEvents`,
      `https://US-CENTRAL1-regroup-e2e.cloudfunctions.net/stripeEvents`,
      `HTTPS://${host}/stripeEvents`,
      `https://${host}:443/stripeEvents`,
      `https://${host}/stripeEvents?`,
      `https://${host}/stripeEvents#`,
      `https://${host}./stripeEvents`,
      `https://us-central1-regroup-e2e.cloudfunctions.ｎｅｔ/stripeEvents`,
      `https://us-central1-regroup-ｅ2e.cloudfunctions.net/stripeEvents`,
    ];
    for (const url of variants) {
      expect([url, isAllowedWebhookUrl(url)]).toEqual([url, false]);
      expect(() => assertWebhookUrls(url, CONNECT_URL)).toThrow(/not allowed/);
    }
  });

  it('refuses production, non-https, non-e2e and identical URLs', () => {
    const prod = 'https://us-central1-phoenix-cleanhouse.cloudfunctions.net/stripeEvents';
    expect(() => assertWebhookUrls(prod, CONNECT_URL)).toThrow(/not allowed/);
    expect(() =>
      assertWebhookUrls(PLATFORM_URL, 'http://us-central1-regroup-e2e.cloudfunctions.net/c'),
    ).toThrow(/not allowed/);
    expect(() => assertWebhookUrls('https://example.com/x', CONNECT_URL)).toThrow(/not allowed/);
    expect(() => assertWebhookUrls('https://regroup-e2e-regroup-app.com/x', CONNECT_URL)).toThrow(
      /not allowed/,
    );
    expect(() => assertWebhookUrls(PLATFORM_URL, PLATFORM_URL)).toThrow(/not allowed/);
  });

  it('refuses URLs when ensureWebhooks is called directly, with no Stripe calls', async () => {
    const { mock, stripe } = makeStripe();
    await expect(
      ensureWebhooks(stripe, {
        platformUrl: 'https://us-central1-phoenix-cleanhouse.cloudfunctions.net/w',
        connectUrl: CONNECT_URL,
      }),
    ).rejects.toThrow(/not allowed/);
    expect(mock.webhookEndpoints.list).not.toHaveBeenCalled();
    expect(mock.webhookEndpoints.create).not.toHaveBeenCalled();
  });
});

describe('assertSandboxHygiene', () => {
  it('throws on an enabled endpoint at phoenix-cleanhouse and never mutates', async () => {
    const { mock, stripe } = makeStripe({
      endpoints: [
        { id: 'we_ok', url: PLATFORM_URL, status: 'enabled' },
        {
          id: 'we_bad',
          url: 'https://us-central1-phoenix-cleanhouse.cloudfunctions.net/stripeEvents',
          status: 'enabled',
        },
      ],
    });
    await expect(assertSandboxHygiene(stripe)).rejects.toThrow(/we_bad/);
    expect(mock.webhookEndpoints.update).not.toHaveBeenCalled();
    expect(mock.webhookEndpoints.del).not.toHaveBeenCalled();
  });

  it('ignores disabled foreign endpoints and passes clean sandboxes', async () => {
    const { mock, stripe } = makeStripe({
      endpoints: [
        { id: 'we_off', url: 'https://elsewhere.example/x', status: 'disabled' },
        { id: 'we_ok', url: PLATFORM_URL, status: 'enabled' },
      ],
    });
    await expect(assertSandboxHygiene(stripe)).resolves.toBeUndefined();
    expect(mock.webhookEndpoints.update).not.toHaveBeenCalled();
    expect(mock.webhookEndpoints.del).not.toHaveBeenCalled();
  });
});

describe('assertSandboxAccount', () => {
  it('refuses live and non-test keys without touching Stripe', async () => {
    const { mock, stripe } = makeStripe();
    await expect(assertSandboxAccount(stripe, 'sk_live_abc')).rejects.toThrow(/live/i);
    await expect(assertSandboxAccount(stripe, 'rk_live_abc')).rejects.toThrow(/live/i);
    await expect(assertSandboxAccount(stripe, 'pk_test_abc')).rejects.toThrow(/not an sk_test/);
    await expect(assertSandboxAccount(stripe, 'garbage')).rejects.toThrow(/not an sk_test/);
    expect(mock.accounts.retrieve).not.toHaveBeenCalled();
  });

  it('refuses the production-pointing sandbox account', async () => {
    const { stripe } = makeStripe({ accountId: PRODUCTION_SANDBOX_ACCOUNT_ID });
    await expect(assertSandboxAccount(stripe, 'sk_test_abc')).rejects.toThrow(
      PRODUCTION_SANDBOX_ACCOUNT_ID,
    );
  });

  it('returns the id of a fresh test account', async () => {
    const { stripe } = makeStripe();
    await expect(assertSandboxAccount(stripe, 'sk_test_abc')).resolves.toBe('acct_new');
  });
});
