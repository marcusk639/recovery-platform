import { assertLiveKey, expectedPrices, verifyLive } from '../../scripts/verifyLiveStripe';

const ACCOUNT = 'acct_1GfryQKsstp3aqoP';

type FakePrice = {
  livemode: boolean;
  active: boolean;
  unit_amount: number;
  currency: string;
  recurring: { interval: string };
};

const fakeStripe = (account: string, prices: Record<string, FakePrice | Error>) => ({
  accounts: { retrieve: jest.fn(async () => ({ id: account })) },
  prices: {
    retrieve: jest.fn(async (id: string) => {
      const p = prices[id];
      if (!p) throw new Error(`No such price: '${id}'`);
      if (p instanceof Error) throw p;
      return { id, ...p };
    }),
  },
});

const live = (unit_amount: number, interval: string): FakePrice => ({
  livemode: true,
  active: true,
  unit_amount,
  currency: 'usd',
  recurring: { interval },
});

describe('assertLiveKey', () => {
  it('accepts live secret and restricted keys only', () => {
    expect(() => assertLiveKey('sk_live_abc')).not.toThrow();
    expect(() => assertLiveKey('rk_live_abc')).not.toThrow();
    expect(() => assertLiveKey('sk_test_abc')).toThrow(/not a live/);
    expect(() => assertLiveKey('')).toThrow(/not a live/);
  });

  it('never repeats the key in its error', () => {
    expect(() => assertLiveKey('sk_test_SECRETVALUE')).toThrow(
      expect.not.objectContaining({ message: expect.stringContaining('SECRETVALUE') }),
    );
  });
});

describe('expectedPrices', () => {
  it('derives the amount and interval of every tier price env var from SUBSCRIPTION_TIERS (annual = monthly x 10)', () => {
    const e = expectedPrices();
    expect(e.STRIPE_PRICE_TRAD_STARTER).toEqual({ amount: 6900, interval: 'month' });
    expect(e.STRIPE_PRICE_TRAD_STARTER_ANNUAL).toEqual({ amount: 69000, interval: 'year' });
    expect(e.STRIPE_PRICE_OXFORD_NETWORK_ANNUAL).toEqual({ amount: 299000, interval: 'year' });
    expect(Object.keys(e)).toHaveLength(12);
  });
});

describe('verifyLive', () => {
  const env = { STRIPE_PRICE_TRAD_STARTER: 'price_m', STRIPE_PRICE_TRAD_STARTER_ANNUAL: 'price_y' };
  const expected = {
    STRIPE_PRICE_TRAD_STARTER: { amount: 6900, interval: 'month' as const },
    STRIPE_PRICE_TRAD_STARTER_ANNUAL: { amount: 69000, interval: 'year' as const },
  };

  it('passes when the key is the expected account and every price is live, active and right', async () => {
    const stripe = fakeStripe(ACCOUNT, {
      price_m: live(6900, 'month'),
      price_y: live(69000, 'year'),
    });
    const r = await verifyLive(stripe as any, ACCOUNT, env, expected);
    expect(r.ok).toBe(true);
  });

  // The 2026-11-22 incident: production's key belonged to another Stripe account.
  it('fails, without retrieving prices, when the key belongs to another account', async () => {
    const stripe = fakeStripe('acct_other', {});
    const r = await verifyLive(stripe as any, ACCOUNT, env, expected);
    expect(r.ok).toBe(false);
    expect(r.lines.join('\n')).toMatch(/acct_other.*expected acct_1GfryQKsstp3aqoP/);
    expect(stripe.prices.retrieve).not.toHaveBeenCalled();
  });

  it('fails a price that is missing, test-mode, archived, or the wrong amount or interval', async () => {
    const cases: Array<[FakePrice | undefined, RegExp]> = [
      [undefined, /No such price/],
      [{ ...live(6900, 'month'), livemode: false }, /not live/],
      [{ ...live(6900, 'month'), active: false }, /archived/],
      [live(6800, 'month'), /amount 6800, expected 6900/],
      [live(6900, 'year'), /interval year, expected month/],
    ];
    for (const [price, why] of cases) {
      const stripe = fakeStripe(ACCOUNT, {
        ...(price ? { price_m: price } : {}),
        price_y: live(69000, 'year'),
      });
      const r = await verifyLive(stripe as any, ACCOUNT, env, expected);
      expect([r.ok, r.lines.join('\n')]).toEqual([false, expect.stringMatching(why)]);
    }
  });

  it('fails a tier price env var that is unset', async () => {
    const stripe = fakeStripe(ACCOUNT, { price_m: live(6900, 'month') });
    const r = await verifyLive(
      stripe as any,
      ACCOUNT,
      { STRIPE_PRICE_TRAD_STARTER: 'price_m' },
      expected,
    );
    expect(r.ok).toBe(false);
    expect(r.lines.join('\n')).toMatch(/STRIPE_PRICE_TRAD_STARTER_ANNUAL.*unset/);
  });
});
