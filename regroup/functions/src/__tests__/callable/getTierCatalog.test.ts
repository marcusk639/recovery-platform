// src/__tests__/callable/getTierCatalog.test.ts

jest.mock('firebase-functions/v2/https', () => ({
  onCall: (_optsOrHandler: any, handler?: Function) =>
    typeof _optsOrHandler === 'function' ? _optsOrHandler : handler,
}));

jest.mock('firebase-functions', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock('firebase-functions/params', () => ({
  defineSecret: jest.fn((name: string) => ({ name })),
}));

const mockPricesRetrieve = jest.fn();

jest.mock('../../api/stripe', () => ({
  stripe: {
    prices: { retrieve: (...args: any[]) => mockPricesRetrieve(...args) },
  },
}));

// All 12 price env vars the real SUBSCRIPTION_TIERS config reads from
// (6 tiers x month/year) — see src/config.ts.
const ENV_KEYS = [
  'STRIPE_PRICE_TRAD_STARTER',
  'STRIPE_PRICE_TRAD_STARTER_ANNUAL',
  'STRIPE_PRICE_TRAD_PROFESSIONAL',
  'STRIPE_PRICE_TRAD_PROFESSIONAL_ANNUAL',
  'STRIPE_PRICE_TRAD_ENTERPRISE',
  'STRIPE_PRICE_TRAD_ENTERPRISE_ANNUAL',
  'STRIPE_PRICE_OXFORD_STANDARD',
  'STRIPE_PRICE_OXFORD_STANDARD_ANNUAL',
  'STRIPE_PRICE_OXFORD_PLUS',
  'STRIPE_PRICE_OXFORD_PLUS_ANNUAL',
  'STRIPE_PRICE_OXFORD_NETWORK',
  'STRIPE_PRICE_OXFORD_NETWORK_ANNUAL',
];

const setAllPriceEnvVars = () => {
  for (const key of ENV_KEYS) {
    process.env[key] = `price_${key.toLowerCase()}`;
  }
};

const clearAllPriceEnvVars = () => {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
};

// Loads a fresh instance of the callable module (fresh module-scope cache)
// via jest.isolateModules, so cache state never leaks between tests.
const loadGetTierCatalog = (): ((req: unknown) => Promise<any>) => {
  let handler: any;
  jest.isolateModules(() => {
    handler = require('../../callable/getTierCatalog').getTierCatalog;
  });
  return handler;
};

const call = (fn: (req: unknown) => Promise<any>) => fn({ data: {}, auth: null });

beforeEach(() => {
  jest.clearAllMocks();
  clearAllPriceEnvVars();
  mockPricesRetrieve.mockImplementation(async (priceId: string) => ({
    id: priceId,
    unit_amount: 1234,
  }));
});

afterAll(() => {
  clearAllPriceEnvVars();
});

describe('getTierCatalog', () => {
  it('succeeds with no request.auth (public callable)', async () => {
    setAllPriceEnvVars();
    const fn = loadGetTierCatalog();
    await expect(call(fn)).resolves.toBeDefined();
  });

  it('returns all 6 tiers with currency usd', async () => {
    setAllPriceEnvVars();
    const fn = loadGetTierCatalog();
    const result = await call(fn);
    expect(result.currency).toBe('usd');
    expect(result.tiers).toHaveLength(6);
    const keys = result.tiers.map((t: any) => `${t.houseType}:${t.tier}`);
    expect(keys).toEqual(
      expect.arrayContaining([
        'traditional:starter',
        'traditional:professional',
        'traditional:enterprise',
        'oxford:standard',
        'oxford:plus',
        'oxford:network',
      ]),
    );
  });

  it('uses the Stripe unit_amount for amountCents', async () => {
    setAllPriceEnvVars();
    mockPricesRetrieve.mockImplementation(async (priceId: string) => ({
      id: priceId,
      unit_amount: 6900,
    }));
    const fn = loadGetTierCatalog();
    const result = await call(fn);
    const starter = result.tiers.find(
      (t: any) => t.houseType === 'traditional' && t.tier === 'starter',
    );
    expect(starter.prices.month).toEqual({ amountCents: 6900 });
    expect(starter.prices.year).toEqual({ amountCents: 6900 });
  });

  it('returns year: null without failing the call when the annual price env var is missing', async () => {
    setAllPriceEnvVars();
    delete process.env.STRIPE_PRICE_TRAD_STARTER_ANNUAL;
    const fn = loadGetTierCatalog();
    const result = await call(fn);
    const starter = result.tiers.find(
      (t: any) => t.houseType === 'traditional' && t.tier === 'starter',
    );
    expect(starter.prices.month).not.toBeNull();
    expect(starter.prices.year).toBeNull();
  });

  it('returns year: null without failing the call when Stripe retrieve fails for the annual price', async () => {
    setAllPriceEnvVars();
    mockPricesRetrieve.mockImplementation(async (priceId: string) => {
      if (priceId.includes('annual')) {
        throw new Error('Stripe unavailable');
      }
      return { id: priceId, unit_amount: 4900 };
    });
    const fn = loadGetTierCatalog();
    const result = await call(fn);
    const standard = result.tiers.find(
      (t: any) => t.houseType === 'oxford' && t.tier === 'standard',
    );
    expect(standard.prices.month).toEqual({ amountCents: 4900 });
    expect(standard.prices.year).toBeNull();
  });

  it('marks Oxford Network unavailable for sale; all other tiers available', async () => {
    setAllPriceEnvVars();
    const fn = loadGetTierCatalog();
    const result = await call(fn);
    const network = result.tiers.find((t: any) => t.houseType === 'oxford' && t.tier === 'network');
    expect(network.availableForSale).toBe(false);
    const others = result.tiers.filter(
      (t: any) => !(t.houseType === 'oxford' && t.tier === 'network'),
    );
    expect(others.every((t: any) => t.availableForSale === true)).toBe(true);
  });

  it('caches the catalog: a second call within the TTL makes zero additional Stripe calls', async () => {
    setAllPriceEnvVars();
    const fn = loadGetTierCatalog();
    await call(fn);
    const callsAfterFirst = mockPricesRetrieve.mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);
    await call(fn);
    expect(mockPricesRetrieve.mock.calls.length).toBe(callsAfterFirst);
  });
});
