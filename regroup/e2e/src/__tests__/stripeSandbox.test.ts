import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type Stripe from 'stripe';
import {
  assertSandboxAccount,
  assertSandboxHygiene,
  ensureCatalog,
  ensureWebhooks,
  PRODUCTION_SANDBOX_ACCOUNT_ID,
  PLATFORM_EVENTS,
  CONNECT_EVENTS,
} from '../stripeSandbox';
import { runSetup } from '../stripeSandboxRun';

type Store = Record<string, any>;

function missing(): Error {
  return Object.assign(new Error('No such object'), { code: 'resource_missing' });
}

function makeStripe(opts: { accountId?: string; endpoints?: any[] } = {}) {
  const products: Store = {};
  const prices: Store = {};
  const coupons: Store = {};
  const endpoints: any[] = [...(opts.endpoints ?? [])];
  const mock = {
    accounts: { retrieve: jest.fn(async () => ({ id: opts.accountId ?? 'acct_new' })) },
    products: {
      retrieve: jest.fn(async (id: string) => {
        if (!products[id]) throw missing();
        return products[id];
      }),
      create: jest.fn(async (p: any) => (products[p.id] = { ...p })),
    },
    prices: {
      list: jest.fn(async ({ lookup_keys }: any) => ({
        data: prices[lookup_keys[0]] ? [prices[lookup_keys[0]]] : [],
      })),
      create: jest.fn(
        async (p: any) => (prices[p.lookup_key] = { ...p, id: `price_${p.lookup_key}` }),
      ),
    },
    coupons: {
      retrieve: jest.fn(async (id: string) => {
        if (!coupons[id]) throw missing();
        return coupons[id];
      }),
      create: jest.fn(async (c: any) => (coupons[c.id] = { ...c })),
    },
    webhookEndpoints: {
      list: jest.fn(async () => ({ data: endpoints, has_more: false })),
      create: jest.fn(async (e: any) => {
        const created = { ...e, id: `we_${endpoints.length}`, secret: 'whsec_mock' };
        endpoints.push(created);
        return created;
      }),
      update: jest.fn(),
      del: jest.fn(),
    },
  };
  return { mock, stripe: mock as unknown as Stripe, products, prices, coupons, endpoints };
}

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
});

describe('ensureWebhooks', () => {
  it('creates a platform and a connect endpoint once, reporting secrets via callback', async () => {
    const { mock, stripe } = makeStripe();
    const secrets: string[] = [];
    const opts = {
      platformUrl: 'https://e2e.example/stripeWebhook',
      connectUrl: 'https://e2e.example/stripeConnectWebhook',
      onSecret: (kind: string) => secrets.push(kind),
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
});

describe('assertSandboxHygiene', () => {
  const allowed = ['https://e2e.example/'];

  it('throws on an enabled endpoint at phoenix-cleanhouse and never mutates', async () => {
    const { mock, stripe } = makeStripe({
      endpoints: [
        { id: 'we_ok', url: 'https://e2e.example/stripeWebhook', status: 'enabled' },
        {
          id: 'we_bad',
          url: 'https://us-central1-phoenix-cleanhouse.cloudfunctions.net/stripeWebhook',
          status: 'enabled',
        },
      ],
    });
    await expect(assertSandboxHygiene(stripe, allowed)).rejects.toThrow(/we_bad/);
    expect(mock.webhookEndpoints.update).not.toHaveBeenCalled();
    expect(mock.webhookEndpoints.del).not.toHaveBeenCalled();
  });

  it('ignores disabled foreign endpoints and passes clean sandboxes', async () => {
    const { mock, stripe } = makeStripe({
      endpoints: [
        { id: 'we_off', url: 'https://elsewhere.example/x', status: 'disabled' },
        { id: 'we_ok', url: 'https://e2e.example/stripeWebhook', status: 'enabled' },
      ],
    });
    await expect(assertSandboxHygiene(stripe, allowed)).resolves.toBeUndefined();
    expect(mock.webhookEndpoints.update).not.toHaveBeenCalled();
    expect(mock.webhookEndpoints.del).not.toHaveBeenCalled();
  });
});

describe('assertSandboxAccount', () => {
  it('refuses live keys without touching Stripe', async () => {
    const { mock, stripe } = makeStripe();
    await expect(assertSandboxAccount(stripe, 'sk_live_abc')).rejects.toThrow(/live/i);
    await expect(assertSandboxAccount(stripe, 'rk_live_abc')).rejects.toThrow(/live/i);
    expect(mock.accounts.retrieve).not.toHaveBeenCalled();
  });

  it('refuses the production-pointing sandbox account', async () => {
    const { stripe } = makeStripe({ accountId: PRODUCTION_SANDBOX_ACCOUNT_ID });
    await expect(assertSandboxAccount(stripe, 'sk_test_abc')).rejects.toThrow(
      PRODUCTION_SANDBOX_ACCOUNT_ID,
    );
  });

  it('accepts a fresh test account', async () => {
    const { stripe } = makeStripe();
    await expect(assertSandboxAccount(stripe, 'sk_test_abc')).resolves.toBeUndefined();
  });
});

describe('runSetup', () => {
  const urls = {
    platformUrl: 'https://e2e.example/stripeWebhook',
    connectUrl: 'https://e2e.example/stripeConnectWebhook',
  };
  let outDir: string;
  beforeEach(() => {
    outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-stripe-'));
  });

  it('refuses an sk_live_ key before creating a client', async () => {
    const createStripe = jest.fn();
    await expect(
      runSetup({ readKey: () => 'sk_live_zzz', createStripe, outDir, ...urls }),
    ).rejects.toThrow(/live/i);
    expect(createStripe).not.toHaveBeenCalled();
  });

  it('refuses the old sandbox account id and writes nothing', async () => {
    const { mock, stripe } = makeStripe({ accountId: PRODUCTION_SANDBOX_ACCOUNT_ID });
    await expect(
      runSetup({ readKey: () => 'sk_test_zzz', createStripe: () => stripe, outDir, ...urls }),
    ).rejects.toThrow(PRODUCTION_SANDBOX_ACCOUNT_ID);
    expect(mock.products.create).not.toHaveBeenCalled();
    expect(fs.readdirSync(outDir)).toEqual([]);
  });

  it('writes price ids and webhook secrets with mode 600', async () => {
    const { stripe } = makeStripe();
    await runSetup({ readKey: () => 'sk_test_zzz', createStripe: () => stripe, outDir, ...urls });

    const pricesFile = path.join(outDir, 'stripe-e2e-prices.json');
    const secretsFile = path.join(outDir, 'stripe-e2e-webhook-secrets.json');
    expect(JSON.parse(fs.readFileSync(pricesFile, 'utf8')).STRIPE_PRICE_TRAD_STARTER).toMatch(
      /^price_/,
    );
    expect(JSON.parse(fs.readFileSync(secretsFile, 'utf8'))).toEqual({
      platform: 'whsec_mock',
      connect: 'whsec_mock',
    });
    expect(fs.statSync(pricesFile).mode & 0o777).toBe(0o600);
    expect(fs.statSync(secretsFile).mode & 0o777).toBe(0o600);
  });
});
