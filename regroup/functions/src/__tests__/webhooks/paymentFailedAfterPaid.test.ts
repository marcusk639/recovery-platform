/**
 * A PaymentIntent can fail and then succeed on a retry, and Stripe doesn't promise
 * to deliver those events in order. A failure that arrives once the payment is paid
 * must not mark it failed or tell anyone it failed.
 *
 * The payment record here keeps its state across events, unlike the shared mocks.
 */

const mockConstructEvent = jest.fn();
const mockNotified: string[] = [];
let mockPayment: Record<string, unknown> | undefined;

jest.mock('firebase-admin', () => {
  const paymentSnap = () => ({
    exists: mockPayment !== undefined,
    data: () => mockPayment,
    get: (field: string) => mockPayment?.[field],
  });
  const mergePayment = (data: Record<string, unknown>) => {
    mockPayment = { ...mockPayment, ...data };
    return Promise.resolve();
  };
  const collection = (col: string) => ({
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    get: jest.fn(() => Promise.resolve({ empty: true, docs: [] })),
    doc: jest.fn((id: string) => ({
      path: `${col}/${id}`,
      get: jest.fn(() => {
        if (col === 'payments') return Promise.resolve(paymentSnap());
        const data: Record<string, unknown> | null =
          col === 'guests'
            ? { userId: 'uid_1', houseId: 'house_1', firstName: 'A', lastName: 'B' }
            : col === 'users'
              ? { messagingToken: ['tok_1'] }
              : null;
        return Promise.resolve({
          exists: data !== null,
          id,
          data: () => data ?? undefined,
          get: (f: string) => data?.[f],
        });
      }),
      set: jest.fn((data: Record<string, unknown>) =>
        col === 'payments' ? mergePayment(data) : Promise.resolve(),
      ),
      update: jest.fn(() => Promise.resolve()),
    })),
  });
  const isPayment = (ref: { path: string }) => ref.path.startsWith('payments/');
  const firestoreFn: any = jest.fn(() => ({
    collection,
    runTransaction: jest.fn(async (fn: (txn: any) => Promise<unknown>) =>
      fn({
        get: jest.fn((ref: { path: string }) =>
          Promise.resolve(
            isPayment(ref) ? paymentSnap() : { exists: false, get: () => undefined },
          ),
        ),
        set: jest.fn((ref: { path: string }, data: Record<string, unknown>) => {
          if (isPayment(ref)) mockPayment = { ...mockPayment, ...data };
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
    messaging: jest.fn(() => ({
      send: jest.fn((message: { notification?: { title?: string } }) => {
        mockNotified.push(`resident:${message.notification?.title}`);
        return Promise.resolve('msg');
      }),
    })),
  };
});

jest.mock('../../util/notifications', () => ({
  sendFcmToHouseAdmins: jest.fn((_houseId: string, title: string) => {
    mockNotified.push(`admins:${title}`);
    return Promise.resolve();
  }),
}));

jest.mock('../../util/email', () => ({
  regroupEmail: 'noreply@example.test',
  sendEmail: jest.fn(() => Promise.resolve()),
}));

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

const deliver = async (type: string) => {
  const event = {
    id: `evt_${Math.random().toString(36).slice(2)}`,
    type,
    livemode: false,
    data: {
      object: {
        id: 'pi_1',
        object: 'payment_intent',
        amount: 50000,
        currency: 'usd',
        metadata: { guestId: 'guest_1', houseId: 'house_1', guestUserId: 'uid_1' },
        last_payment_error:
          type === 'payment_intent.payment_failed'
            ? { code: 'card_declined', message: 'Your card was declined.' }
            : null,
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

const SUCCEEDED = 'payment_intent.succeeded';
const FAILED = 'payment_intent.payment_failed';
const failureNotices = () => mockNotified.filter((n) => n.endsWith('Payment Failed'));

beforeEach(() => {
  jest.clearAllMocks();
  mockNotified.length = 0;
  mockPayment = undefined;
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fake';
  process.env.STRIPE_TEST_WEBHOOK_SECRET = 'whsec_test_fake';
  process.env.STRIPE_CONNECT_WEBHOOK_SECRET = 'whsec_connect_fake';
  process.env.STRIPE_CONNECT_TEST_WEBHOOK_SECRET = 'whsec_connect_test_fake';
});

describe('a failure that arrives after the payment is paid', () => {
  it('leaves a paid payment paid, and accepts the event so Stripe stops sending it', async () => {
    await deliver(SUCCEEDED);
    const res = await deliver(FAILED);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockPayment?.status).toBe('succeeded');
    expect(mockPayment?.rentApplied).toBe(true);
    expect(mockPayment?.failureCode).toBeUndefined();
    expect(mockPayment?.failureMessage).toBeUndefined();
  });

  it('tells nobody the payment failed', async () => {
    await deliver(SUCCEEDED);
    mockNotified.length = 0;
    await deliver(FAILED);
    expect(mockNotified).toEqual([]);
  });

  it('holds after a decline and a successful retry too', async () => {
    await deliver(FAILED);
    await deliver(SUCCEEDED);
    mockNotified.length = 0;
    await deliver(FAILED);
    expect(mockPayment?.status).toBe('succeeded');
    expect(mockNotified).toEqual([]);
  });

  it('leaves a payment staff resolved offline resolved', async () => {
    mockPayment = { status: 'resolved_offline', amount: 50000, createdAt: 'original' };
    await deliver(FAILED);
    expect(mockPayment?.status).toBe('resolved_offline');
    expect(failureNotices()).toEqual([]);
  });

  it('respects a payment whose rent was already applied, whatever its status says', async () => {
    mockPayment = { status: 'pending', rentApplied: true };
    await deliver(FAILED);
    expect(mockPayment?.status).toBe('pending');
    expect(failureNotices()).toEqual([]);
  });
});

describe('a real failure', () => {
  it('records and announces a failure on a pending payment, keeping its date', async () => {
    mockPayment = { status: 'pending', amount: 50000, createdAt: 'original' };
    await deliver(FAILED);
    expect(mockPayment).toMatchObject({
      status: 'failed',
      failureCode: 'card_declined',
      createdAt: 'original',
    });
    expect(failureNotices()).toEqual(['resident:Payment Failed', 'admins:Payment Failed']);
  });

  it('records a failure with no earlier record, dated so history can list it', async () => {
    await deliver(FAILED);
    expect(mockPayment).toMatchObject({ status: 'failed', createdAt: '__ts__' });
    expect(failureNotices()).toHaveLength(2);
  });

  it('still lets a retry succeed after a failure', async () => {
    await deliver(FAILED);
    await deliver(SUCCEEDED);
    expect(mockPayment?.status).toBe('succeeded');
    expect(mockPayment?.rentApplied).toBe(true);
  });
});
