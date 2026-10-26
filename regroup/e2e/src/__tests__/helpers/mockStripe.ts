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
      create: jest.fn(async (p: any) => (products[p.id] = { ...p, active: true })),
    },
    prices: {
      list: jest.fn(async ({ lookup_keys }: any) => ({
        data: prices[lookup_keys[0]] ? [prices[lookup_keys[0]]] : [],
      })),
      create: jest.fn(
        async (p: any) =>
          (prices[p.lookup_key] = { ...p, active: true, id: `price_${p.lookup_key}` }),
      ),
    },
    coupons: {
      retrieve: jest.fn(async (id: string) => {
        if (!coupons[id]) throw missing();
        return coupons[id];
      }),
      create: jest.fn(async (c: any) => (coupons[c.id] = { ...c, valid: true })),
    },
    webhookEndpoints: {
      list: jest.fn(async () => ({ data: endpoints, has_more: false })),
      // Like Stripe: the object has no `connect` field; a Connect endpoint carries `application`.
      create: jest.fn(async ({ connect, ...e }: any) => {
        const created = {
          ...e,
          application: connect ? 'ca_mock' : null,
          status: 'enabled',
          id: `we_${endpoints.length}`,
          secret: 'whsec_mock',
        };
        endpoints.push(created);
        return created;
      }),
      update: jest.fn(),
      del: jest.fn(),
    },
  };
  return { mock, stripe: mock as unknown as Stripe, products, prices, coupons, endpoints };
}
