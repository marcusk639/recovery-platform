/**
 * payments/{id}.guestUserId — the resident's Firebase uid on every payment
 * record the webhook writes.
 *
 * The payments read rule lets a resident read a record only when
 * resource.data.guestUserId is their uid, and their history query filters on
 * it. No writer used to set it, so a resident's history was always empty (or
 * denied). The webhook takes it from PaymentIntent metadata (set at creation
 * since this change); a PaymentIntent created before that carries none, so the
 * succeeded/failed handlers fall back to guests/{guestId}.userId from the guest
 * read they already make. Never `guestUserId: undefined`: Firestore rejects it.
 *
 * Mock strategy mirrors unknownObjects.test.ts: constructEvent is the control
 * point, onRequest is unwrapped, and Firestore is an in-memory fake that
 * records every payments write with its data.
 */

const mockPaymentWrites: Array<Record<string, unknown>> = [];
const mockConstructEvent = jest.fn();
let mockGuest: Record<string, unknown> | null = null;

jest.mock('firebase-admin', () => {
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
        get: jest.fn(() => {
          const data = col === 'guests' ? mockGuest : null;
          return Promise.resolve({
            exists: data !== null,
            id,
            data: () => data ?? undefined,
            get: (f: string) => data?.[f],
          });
        }),
        set: jest.fn((data: Record<string, unknown>) => {
          if (col === 'payments') mockPaymentWrites.push(data);
          return Promise.resolve();
        }),
        update: jest.fn(() => Promise.resolve()),
      })),
    };
  };
  const firestoreFn: any = jest.fn(() => ({
    collection,
    runTransaction: jest.fn(async (fn: (txn: any) => Promise<unknown>) =>
      fn({
        get: jest.fn(() => Promise.resolve({ exists: false, get: () => undefined })),
        set: jest.fn((ref: { path: string }, data: Record<string, unknown>) => {
          if (ref.path.startsWith('payments/')) mockPaymentWrites.push(data);
        }),
        update: jest.fn(),
      }),
    ),
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
  })),
);

import { stripeWebhook } from '../../webhooks/stripeWebhook';

type Handler = (req: unknown, res: unknown) => Promise<void>;

const deliver = async (type: string, metadata: Record<string, string>, currency = 'usd') => {
  const event = {
    id: `evt_${Math.random().toString(36).slice(2)}`,
    type,
    livemode: false,
    data: {
      object: {
        id: 'pi_1',
        object: 'payment_intent',
        amount: 50000,
        currency,
        metadata,
        last_payment_error: null,
      },
    },
  };
  mockConstructEvent.mockReturnValue(event);
  const res: any = {};
  res.status = jest.fn(() => res);
  res.send = jest.fn(() => res);
  await (stripeWebhook as unknown as Handler)(
    {
      method: 'POST',
      body: event,
      headers: { 'stripe-signature': 'sig' },
      rawBody: Buffer.from('{}'),
    },
    res,
  );
  return res;
};

/** Every value ever written for guestUserId, in write order. */
const writtenGuestUserIds = () =>
  mockPaymentWrites.filter((w) => 'guestUserId' in w).map((w) => w.guestUserId);

const IDS = { guestId: 'guest_1', houseId: 'house_1' };

beforeEach(() => {
  jest.clearAllMocks();
  mockPaymentWrites.length = 0;
  mockGuest = { userId: 'uid_guest_doc', houseId: 'house_1', firstName: 'A', lastName: 'B' };
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fake';
  process.env.STRIPE_TEST_WEBHOOK_SECRET = 'whsec_test_fake';
  process.env.STRIPE_CONNECT_WEBHOOK_SECRET = 'whsec_connect_fake';
  process.env.STRIPE_CONNECT_TEST_WEBHOOK_SECRET = 'whsec_connect_test_fake';
});

describe.each(['payment_intent.succeeded', 'payment_intent.payment_failed'])('%s', (type) => {
  it('writes guestUserId from metadata on the first payment record write', async () => {
    const res = await deliver(type, { ...IDS, guestUserId: 'uid_meta' });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockPaymentWrites[0]).toMatchObject({ ...IDS, guestUserId: 'uid_meta' });
    expect(writtenGuestUserIds()).toEqual(['uid_meta']);
  });

  it('falls back to guests/{guestId}.userId for a PaymentIntent created before the field', async () => {
    const res = await deliver(type, IDS);

    expect(res.status).toHaveBeenCalledWith(200);
    // The record is still written first, before the guest read, without it.
    expect(mockPaymentWrites[0]).toMatchObject(IDS);
    expect(mockPaymentWrites[0]).not.toHaveProperty('guestUserId');
    expect(writtenGuestUserIds()).toEqual(['uid_guest_doc']);
  });

  it('omits guestUserId (never undefined) when neither metadata nor the guest has one', async () => {
    mockGuest = { houseId: 'house_1', firstName: 'A', lastName: 'B' };

    const res = await deliver(type, IDS);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockPaymentWrites.length).toBeGreaterThan(0);
    expect(writtenGuestUserIds()).toEqual([]);
  });

  it('omits guestUserId when the guest doc does not exist', async () => {
    mockGuest = null;

    await deliver(type, IDS);

    expect(mockPaymentWrites.length).toBeGreaterThan(0);
    expect(writtenGuestUserIds()).toEqual([]);
  });
});

describe('payment_intent.succeeded quarantine paths', () => {
  it('carries metadata guestUserId onto the non-USD quarantine record', async () => {
    await deliver('payment_intent.succeeded', { ...IDS, guestUserId: 'uid_meta' }, 'jpy');

    expect(mockPaymentWrites[0]).toMatchObject({
      refusedReason: 'unsupported_currency',
      guestUserId: 'uid_meta',
    });
  });

  it('carries metadata guestUserId onto the missing-metadata partial record', async () => {
    await deliver('payment_intent.succeeded', { houseId: 'house_1', guestUserId: 'uid_meta' });

    expect(mockPaymentWrites[0]).toMatchObject({ guestId: null, guestUserId: 'uid_meta' });
  });

  it('omits guestUserId on the missing-metadata partial record when metadata has none', async () => {
    await deliver('payment_intent.succeeded', { houseId: 'house_1' });

    expect(mockPaymentWrites[0]).toMatchObject({ guestId: null });
    expect(writtenGuestUserIds()).toEqual([]);
  });
});
