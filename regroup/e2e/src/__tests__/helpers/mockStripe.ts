import type Stripe from 'stripe';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Store = Record<string, any>;

function missing(): Error {
  return Object.assign(new Error('No such object'), { code: 'resource_missing' });
}

/**
 * Mirrors stripe-node list semantics: one page per call (`limit` default 10,
 * max 100; cursor via `starting_after`), and the returned promise also carries
 * autoPagingToArray({ limit }) which walks pages and refuses limit > 10000.
 */
function pagedList(source: () => any[], filter: (item: any, params: any) => boolean = () => true) {
  const page = (params: any = {}) => {
    const limit = params.limit ?? 10;
    if (limit < 1 || limit > 100) throw new Error('limit must be 1..100');
    const items = source().filter((i) => filter(i, params));
    const start = params.starting_after
      ? items.findIndex((i) => i.id === params.starting_after) + 1
      : 0;
    const data = items.slice(start, start + limit);
    return { object: 'list', data, has_more: start + limit < items.length };
  };
  return jest.fn((params: any = {}) => {
    const first = Promise.resolve().then(() => page(params));
    return Object.assign(first, {
      autoPagingToArray: async ({ limit }: { limit: number }) => {
        if (limit > 10000) throw new Error('You cannot specify a limit of more than 10,000 items');
        const out: any[] = [];
        let current = await first;
        for (;;) {
          for (const item of current.data) {
            if (out.length >= limit) return out;
            out.push(item);
          }
          if (!current.has_more) return out;
          current = page({ ...params, starting_after: current.data[current.data.length - 1].id });
        }
      },
    });
  });
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
      list: pagedList(
        () => Object.values(prices),
        (price, { lookup_keys, active }) =>
          (!lookup_keys || lookup_keys.includes(price.lookup_key)) &&
          (active === undefined || price.active === active),
      ),
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
      create: jest.fn(async (c: any) => (coupons[c.id] = { ...c })),
    },
    webhookEndpoints: {
      list: pagedList(() => endpoints),
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
