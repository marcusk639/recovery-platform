/**
 * Webhooks about objects this database has never heard of.
 *
 * The e2e gate runs against its own Stripe sandbox and every listener on a
 * sandbox receives every event, so each handler must acknowledge (2xx) and
 * otherwise ignore an event whose customer / subscription / account / payment
 * intent is not in Firestore. A 4xx/5xx makes Stripe retry for three days and
 * flags the endpoint as failing. Signature verification still comes first.
 *
 * Mock strategy mirrors webhooks/stripeWebhook.test.ts: the Stripe constructor
 * is mocked (constructEvent is the control point), onRequest is unwrapped, and
 * Firestore is an empty in-memory fake that RECORDS every write by path.
 */

const mockWrites: string[] = [];
const mockConstructEvent = jest.fn();
const mockChargesRetrieve = jest.fn();
const mockRefundsList = jest.fn();
const mockSubscriptionsRetrieve = jest.fn();
const mockV2AccountsRetrieve = jest.fn();

function mockEmptySnap() {
  return { empty: true, docs: [] as unknown[] };
}

jest.mock('firebase-admin', () => {
  const record = (path: string, op: string) => {
    mockWrites.push(`${path}:${op}`);
    return Promise.resolve(undefined);
  };
  const collection = (col: string) => {
    const query: any = {
      where: jest.fn(() => query),
      limit: jest.fn(() => query),
      get: jest.fn(() => Promise.resolve(mockEmptySnap())),
    };
    return {
      ...query,
      doc: jest.fn((id: string) => ({
        get: jest.fn(() =>
          Promise.resolve({
            exists: false,
            id,
            data: () => undefined,
            get: () => undefined,
          }),
        ),
        set: jest.fn(() => record(`${col}/${id}`, 'set')),
        update: jest.fn(() => record(`${col}/${id}`, 'update')),
      })),
    };
  };
  const firestoreFn: any = jest.fn(() => ({
    collection,
    runTransaction: jest.fn(async (fn: (txn: any) => Promise<unknown>) =>
      fn({
        get: jest.fn(() => Promise.resolve({ exists: false, get: () => undefined })),
        // The only txn.set on these paths is the idempotency claim.
        set: jest.fn(() => {
          mockWrites.push('webhookEvents/claim:set');
        }),
        update: jest.fn(() => {
          mockWrites.push('txn:update');
        }),
      }),
    ),
    batch: jest.fn(() => ({
      update: jest.fn(() => mockWrites.push('batch:update')),
      commit: jest.fn(() => Promise.resolve()),
    })),
  }));
  firestoreFn.FieldValue = {
    delete: jest.fn(() => '__delete__'),
    serverTimestamp: jest.fn(() => '__ts__'),
    increment: jest.fn((n: number) => ({ __increment: n })),
  };
  return {
    initializeApp: jest.fn(),
    app: jest.fn(() => ({})),
    firestore: firestoreFn,
    messaging: jest.fn(() => ({ send: jest.fn() })),
  };
});

jest.mock('firebase-functions/v2/https', () => {
  const actual = jest.requireActual('firebase-functions/v2/https');
  return {
    ...actual,
    onRequest: jest.fn((optsOrHandler: any, handler?: any) =>
      typeof optsOrHandler === 'function' ? optsOrHandler : handler,
    ),
  };
});

jest.mock('firebase-functions/params', () => ({
  defineSecret: jest.fn((name: string) => name),
}));

jest.mock('firebase-functions', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('stripe', () =>
  jest.fn().mockImplementation(() => ({
    webhooks: { constructEvent: mockConstructEvent },
    charges: { retrieve: mockChargesRetrieve },
    refunds: { list: mockRefundsList },
    transfers: {
      retrieve: jest.fn(),
      createReversal: jest.fn(),
      listReversals: jest.fn(),
      create: jest.fn(),
      list: jest.fn(),
    },
    subscriptions: { retrieve: mockSubscriptionsRetrieve },
    v2: { core: { accounts: { retrieve: mockV2AccountsRetrieve } } },
  })),
);

import { logger } from 'firebase-functions';
import { stripeWebhook, handleStripeConnectWebhook } from '../../webhooks/stripeWebhook';
import { buildCases, evt, type Handler } from './unknownObjectCases';

const makeReq = (body: unknown = {}) => ({
  method: 'POST',
  body,
  headers: { 'stripe-signature': 'valid-sig' },
  rawBody: Buffer.from(JSON.stringify(body)),
});

const makeRes = () => {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.send = jest.fn(() => res);
  return res;
};

const platform = stripeWebhook as unknown as Handler;
const connect = handleStripeConnectWebhook as unknown as Handler;
const cases = buildCases(platform, connect, mockChargesRetrieve);

beforeEach(() => {
  jest.clearAllMocks();
  mockWrites.length = 0;
  mockChargesRetrieve.mockReset();
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fake';
  process.env.STRIPE_TEST_WEBHOOK_SECRET = 'whsec_test_fake';
  process.env.STRIPE_CONNECT_WEBHOOK_SECRET = 'whsec_connect_fake';
  process.env.STRIPE_CONNECT_TEST_WEBHOOK_SECRET = 'whsec_connect_test_fake';
});

describe('webhooks about unknown objects', () => {
  it.each(cases)(
    'acknowledges with 2xx and writes only what it must: $name',
    async ({ handler, event, mayWrite = [], arrange }) => {
      arrange?.();
      mockConstructEvent.mockReturnValue(event);
      const res = makeRes();

      await handler(makeReq(event), res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.status).not.toHaveBeenCalledWith(500);

      // Nothing outside the idempotency marker and the named collections may
      // be written, and never an entity collection this event does not own.
      const writes = mockWrites.filter((w) => !w.includes('webhookEvents'));
      for (const w of writes) {
        const col = w.split('/')[0];
        expect(mayWrite).toContain(col);
      }
      expect(mockWrites.some((w) => w.startsWith('batch:'))).toBe(false);
      expect(logger.error).not.toHaveBeenCalledWith(
        expect.stringContaining('event handler threw'),
        expect.anything(),
      );
    },
  );

  it.each([
    ['stripeWebhook', platform],
    ['handleStripeConnectWebhook', connect],
  ] as const)(
    '%s still rejects an unknown-object event with a bad signature (400)',
    async (_name, handler) => {
      mockConstructEvent.mockImplementation(() => {
        throw new Error('No signatures found matching the expected signature');
      });
      const event = evt('customer.subscription.deleted', { id: 'sub_unknown' });
      const res = makeRes();

      await handler(makeReq(event), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockWrites).toEqual([]);
    },
  );
});
