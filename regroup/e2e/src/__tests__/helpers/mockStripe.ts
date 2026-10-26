import type Stripe from 'stripe';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Store = Record<string, any>;

function missing(): Error {
  return Object.assign(new Error('No such object'), { code: 'resource_missing' });
}

export function makeStripe(opts: { accountId?: string; endpoints?: any[] } = {}) {
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
        // Like Stripe, the secret is only on the create response, never on list.
        const stored = { ...e, status: 'enabled', id: `we_${endpoints.length}` };
        endpoints.push(stored);
        return { ...stored, secret: 'whsec_mock' };
      }),
      update: jest.fn(),
      del: jest.fn(),
    },
  };
  return { mock, stripe: mock as unknown as Stripe, products, prices, coupons, endpoints };
}
