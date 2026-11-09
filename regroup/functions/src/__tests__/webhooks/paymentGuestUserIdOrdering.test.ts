/**
 * Ordering and failure behaviour of the payments.guestUserId fallback write.
 *
 * paymentGuestUserId.test.ts pins the field values; this file pins WHEN the
 * fallback (guests/{guestId}.userId, for a PaymentIntent created before
 * metadata carried guestUserId) is written relative to the work it must not
 * outrun or be outrun by:
 *  - after the payment record (record-first), before the rentOwed decrement
 *    and before every notification, so a failed fallback write is retried
 *    (500, claim released) with nothing non-idempotent done yet;
 *  - never at all when metadata already carried guestUserId.
 *
 * Every side effect lands in one ordered log: payments writes, the rentOwed
 * transaction update, FCM sends (resident and house admins), email sends and
 * webhookEvents claim status writes.
 */

const mockLog: string[] = [];
const mockConstructEvent = jest.fn();
/** When set, a payments write whose only field is guestUserId rejects. */
let mockFailFallbackWrite = false;

const isFallbackWrite = (data: Record<string, unknown>) =>
  Object.keys(data).length === 1 && 'guestUserId' in data;

jest.mock('firebase-admin', () => {
  const docData = (col: string): Record<string, unknown> | null => {
    if (col === 'guests') {
      return {
        userId: 'uid_guest_doc',
        houseId: 'house_1',
        firstName: 'A',
        lastName: 'B',
        email: 'resident@example.test',
      };
    }
    if (col === 'users') return { messagingToken: ['tok_resident'] };
    return null;
  };
  const collection = (col: string) => ({
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    get: jest.fn(() => Promise.resolve({ empty: true, docs: [] })),
    doc: jest.fn((id: string) => ({
      path: `${col}/${id}`,
      get: jest.fn(() => {
        const data = docData(col);
        return Promise.resolve({
          exists: data !== null,
          id,
          data: () => data ?? undefined,
          get: (f: string) => data?.[f],
        });
      }),
      set: jest.fn((data: Record<string, unknown>) => {
        if (col === 'payments') {
          if (isFallbackWrite(data)) {
            mockLog.push('payments:fallback');
            if (mockFailFallbackWrite) return Promise.reject(new Error('unavailable'));
          } else {
            mockLog.push('payments:record');
          }
        }
        if (col === 'webhookEvents') mockLog.push(`webhookEvents:${String(data.status)}`);
        return Promise.resolve();
      }),
      update: jest.fn(() => Promise.resolve()),
    })),
  });
  const firestoreFn: any = jest.fn(() => ({
    collection,
    runTransaction: jest.fn(async (fn: (txn: any) => Promise<unknown>) =>
      fn({
        get: jest.fn(() => Promise.resolve({ exists: false, get: () => undefined })),
        set: jest.fn((ref: { path: string }, data: Record<string, unknown>) => {
          // A failure's record is written here; a success's rentApplied marker isn't one.
          if (ref.path.startsWith('payments/') && 'status' in data) mockLog.push('payments:record');
        }),
        update: jest.fn((ref: { path: string }, data: Record<string, unknown>) => {
          if (ref.path.startsWith('guests/') && 'rentOwed' in data) mockLog.push('rentOwed');
        }),
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
      send: jest.fn(() => {
        mockLog.push('fcm:resident');
        return Promise.resolve('msg');
      }),
    })),
  };
});

jest.mock('../../util/notifications', () => ({
  sendFcmToHouseAdmins: jest.fn(() => {
    mockLog.push('fcm:admins');
    return Promise.resolve();
  }),
}));

jest.mock('../../util/email', () => ({
  regroupEmail: 'noreply@example.test',
  sendEmail: jest.fn(() => {
    mockLog.push('email');
    return Promise.resolve();
  }),
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

const IDS = { guestId: 'guest_1', houseId: 'house_1' };

const deliver = async (type: string, metadata: Record<string, string>) => {
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

/** Index of the first log entry matching `entry`, failing loudly when absent. */
const at = (entry: string) => {
  const i = mockLog.indexOf(entry);
  if (i < 0) throw new Error(`"${entry}" never happened; log: ${mockLog.join(', ')}`);
  return i;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockLog.length = 0;
  mockFailFallbackWrite = false;
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fake';
  process.env.STRIPE_TEST_WEBHOOK_SECRET = 'whsec_test_fake';
  process.env.STRIPE_CONNECT_WEBHOOK_SECRET = 'whsec_connect_fake';
  process.env.STRIPE_CONNECT_TEST_WEBHOOK_SECRET = 'whsec_connect_test_fake';
});

describe('payment_intent.succeeded, PaymentIntent without metadata.guestUserId', () => {
  it('writes the fallback after the record, before the rentOwed decrement and every notification', async () => {
    const res = await deliver('payment_intent.succeeded', IDS);

    expect(res.status).toHaveBeenCalledWith(200);
    const fallback = at('payments:fallback');
    expect(at('payments:record')).toBeLessThan(fallback);
    expect(fallback).toBeLessThan(at('rentOwed'));
    expect(fallback).toBeLessThan(at('fcm:resident'));
    expect(fallback).toBeLessThan(at('fcm:admins'));
    expect(fallback).toBeLessThan(at('email'));
  });

  it('when the fallback write fails: 500, claim released, no rentOwed change, no FCM, no email', async () => {
    mockFailFallbackWrite = true;

    const res = await deliver('payment_intent.succeeded', IDS);

    expect(res.status).toHaveBeenCalledWith(500);
    // The record still landed first; only the fallback failed.
    expect(at('payments:record')).toBeLessThan(at('payments:fallback'));
    expect(mockLog).toContain('webhookEvents:failed');
    expect(mockLog).not.toContain('webhookEvents:done');
    expect(mockLog).not.toContain('rentOwed');
    expect(mockLog).not.toContain('fcm:resident');
    expect(mockLog).not.toContain('fcm:admins');
    expect(mockLog).not.toContain('email');
  });
});

describe('PaymentIntent with metadata.guestUserId', () => {
  it.each(['payment_intent.succeeded', 'payment_intent.payment_failed'])(
    '%s makes no second (fallback) write to the payment doc',
    async (type) => {
      const res = await deliver(type, { ...IDS, guestUserId: 'uid_meta' });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(mockLog).toContain('payments:record');
      expect(mockLog).not.toContain('payments:fallback');
    },
  );
});

describe('payment_intent.payment_failed, PaymentIntent without metadata.guestUserId', () => {
  it('writes the fallback after the record and before every notification', async () => {
    const res = await deliver('payment_intent.payment_failed', IDS);

    expect(res.status).toHaveBeenCalledWith(200);
    const fallback = at('payments:fallback');
    expect(at('payments:record')).toBeLessThan(fallback);
    expect(fallback).toBeLessThan(at('fcm:resident'));
    expect(fallback).toBeLessThan(at('fcm:admins'));
  });
});
