/**
 * Every reversal entry point must answer 500 when its reversal step fails, so
 * Stripe redelivers the event. A 2xx here would drop the house-share reversal
 * (or the restore after a won dispute) for good, because the event is marked
 * processed and never comes back.
 *
 * Mock wiring mirrors unknownObjects.test.ts (kept separate for the 300-line
 * cap), plus a controllable transfers.list for the won-dispute restore path.
 */

const mockConstructEvent = jest.fn();
const mockChargesRetrieve = jest.fn();
const mockRefundsList = jest.fn();
const mockCreateReversal = jest.fn();
const mockListReversals = jest.fn();
const mockTransfersRetrieve = jest.fn();
const mockTransfersCreate = jest.fn();
const mockTransfersList = jest.fn();

jest.mock('firebase-admin', () => {
  const missingDoc = (id: string) =>
    Promise.resolve({ exists: false, id, data: () => undefined, get: () => undefined });
  const collection = (col: string) => {
    const query: any = {
      where: jest.fn(() => query),
      limit: jest.fn(() => query),
      get: jest.fn(() => Promise.resolve({ empty: true, docs: [] })),
    };
    return {
      ...query,
      doc: jest.fn((id: string) => ({
        path: `${col}/${id}`,
        get: jest.fn(() => missingDoc(id)),
        set: jest.fn(() => Promise.resolve()),
        update: jest.fn(() => Promise.resolve()),
      })),
    };
  };
  const firestoreFn: any = jest.fn(() => ({
    collection,
    runTransaction: jest.fn(async (fn: (txn: any) => Promise<unknown>) =>
      fn({
        get: jest.fn(() => Promise.resolve({ exists: false, get: () => undefined })),
        set: jest.fn(),
        update: jest.fn(),
      }),
    ),
    batch: jest.fn(() => ({ update: jest.fn(), commit: jest.fn(() => Promise.resolve()) })),
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
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('stripe', () =>
  jest.fn().mockImplementation(() => ({
    webhooks: { constructEvent: mockConstructEvent },
    charges: { retrieve: mockChargesRetrieve },
    refunds: { list: mockRefundsList },
    transfers: {
      retrieve: mockTransfersRetrieve,
      createReversal: mockCreateReversal,
      listReversals: mockListReversals,
      create: mockTransfersCreate,
      list: mockTransfersList,
    },
  })),
);

import { stripeWebhook } from '../../webhooks/stripeWebhook';
import { evt, resourceMissing, type Handler } from './unknownObjectCases';

const platform = stripeWebhook as unknown as Handler;

const houseCharge = {
  id: 'ch_house',
  amount: 5000,
  application_fee_amount: 0,
  payment_intent: 'pi_house',
  transfer: 'tr_house',
  metadata: {},
};

const disputeObj = (status: string) => ({
  id: 'dp_1',
  charge: 'ch_house',
  amount: 5000,
  status,
});

/** Each reversal entry point, and the Stripe call that moves money for it. */
const entryPoints: Array<{
  name: string;
  event: Record<string, unknown>;
  moneyCall: jest.Mock;
  priorReversals?: unknown[];
}> = [
  {
    name: 'charge.refunded',
    event: evt('charge.refunded', { ...houseCharge, amount_refunded: 500 }),
    moneyCall: mockCreateReversal,
  },
  {
    name: 'charge.refund.updated',
    event: evt('charge.refund.updated', { id: 're_1', charge: 'ch_house' }),
    moneyCall: mockCreateReversal,
  },
  {
    name: 'charge.dispute.created',
    event: evt('charge.dispute.created', disputeObj('needs_response')),
    moneyCall: mockCreateReversal,
  },
  {
    name: 'charge.dispute.closed (won)',
    event: evt('charge.dispute.closed', disputeObj('won')),
    moneyCall: mockTransfersCreate,
    // The restore returns what the dispute reversal took, so one must exist.
    priorReversals: [
      { id: 'trr_1', amount: 5000, currency: 'usd', metadata: { disputeId: 'dp_1' } },
    ],
  },
];

/** Stripe state in which the entry point reaches its money-moving call. */
function arrangeReversibleCharge(priorReversals: unknown[] = []) {
  mockChargesRetrieve.mockResolvedValue(houseCharge);
  mockRefundsList.mockResolvedValue({
    data: [{ id: 're_1', status: 'succeeded', amount: 500 }],
  });
  mockListReversals.mockResolvedValue({ data: priorReversals });
  mockTransfersRetrieve.mockResolvedValue({
    id: 'tr_house',
    amount: 5000,
    amount_reversed: 0,
    destination: 'acct_house',
  });
  mockTransfersList.mockResolvedValue({ data: [] });
}

const run = async (event: Record<string, unknown>) => {
  mockConstructEvent.mockReturnValue(event);
  const res: any = {};
  res.status = jest.fn(() => res);
  res.send = jest.fn(() => res);
  await platform(
    {
      method: 'POST',
      body: event,
      headers: { 'stripe-signature': 'valid-sig' },
      rawBody: Buffer.from(JSON.stringify(event)),
    },
    res,
  );
  return res;
};

beforeEach(() => {
  jest.clearAllMocks();
  for (const m of [
    mockChargesRetrieve,
    mockRefundsList,
    mockCreateReversal,
    mockListReversals,
    mockTransfersRetrieve,
    mockTransfersCreate,
    mockTransfersList,
  ])
    m.mockReset();
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fake';
  process.env.STRIPE_TEST_WEBHOOK_SECRET = 'whsec_test_fake';
});

describe('reversal entry points retry (500) when the reversal step fails', () => {
  it.each(entryPoints)(
    '$name: a missing charge on a same-mode platform event',
    async ({ event, moneyCall }) => {
      mockChargesRetrieve.mockRejectedValue(resourceMissing());
      const res = await run({ ...event, livemode: false });
      expect(res.status).toHaveBeenCalledWith(500);
      expect(moneyCall).not.toHaveBeenCalled();
    },
  );

  it.each(entryPoints)(
    '$name: the money-moving Stripe call rejects',
    async ({ event, moneyCall, priorReversals }) => {
      arrangeReversibleCharge(priorReversals);
      moneyCall.mockRejectedValue(
        Object.assign(new Error('api'), { type: 'StripeAPIError', code: 'api_error' }),
      );
      const res = await run(event);
      expect(moneyCall).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(500);
    },
  );

  // Only resource_missing on a connected-account event may be acknowledged; any
  // other charge-lookup failure on such an event must still retry.
  it.each(entryPoints)(
    '$name: a connected-account event whose charge lookup fails with parameter_invalid',
    async ({ event, moneyCall }) => {
      mockChargesRetrieve.mockRejectedValue(
        Object.assign(new Error('bad'), {
          type: 'StripeInvalidRequestError',
          code: 'parameter_invalid',
        }),
      );
      const res = await run({ ...event, account: 'acct_conn' });
      expect(res.status).toHaveBeenCalledWith(500);
      expect(moneyCall).not.toHaveBeenCalled();
    },
  );
});
