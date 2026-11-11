/**
 * createPaymentIntent: what a replayed idempotency key returns (RENT-012).
 *
 * The app keys each rent payment on resident, house, UTC day and amount. A
 * second tap at the same amount the same day replays that key, and Stripe
 * answers with its stored response for the ORIGINAL create: the intent as it
 * was then, `requires_payment_method`, even if it has since been paid. Handing
 * that client secret back sends the resident into a payment sheet for an intent
 * that already succeeded. So on a replay the callable reads the intent's current
 * status, and a succeeded one comes back as `{ alreadyPaid: true }` with no
 * client secret: nothing the client can confirm, so no second charge.
 *
 * Plan: docs/superpowers/plans/2026-11-08-regroup-launch-p6-payment-suites.md,
 * Task 5 (RENT-012).
 */

jest.mock('firebase-functions/v2/https', () => {
  const actual = jest.requireActual('firebase-functions/v2/https');
  return {
    ...actual,
    onCall: (_optsOrHandler: any, handler?: Function) => ({
      run: typeof _optsOrHandler === 'function' ? _optsOrHandler : handler,
    }),
  };
});

jest.mock('firebase-functions', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock('firebase-functions/params', () => ({
  defineSecret: jest.fn((name: string) => ({ name })),
}));

jest.mock('../../api/firestore', () => ({
  app: {},
  ratsFirestore: {},
  guestCollection: {},
  houseCollection: {},
  weekSummariesCollection: {},
  userCollection: {},
  notificationCollection: {},
  meetingCollection: {},
}));

jest.mock('../../util/guest', () => ({ transferStats: jest.fn() }));

const mockCreate = jest.fn();
const mockRetrieve = jest.fn();
const mockConfirm = jest.fn();

jest.mock('../../util/stripe', () => ({
  createStripeClient: jest.fn(() => ({
    paymentIntents: {
      create: mockCreate,
      retrieve: mockRetrieve,
      confirm: mockConfirm,
    },
  })),
  mapStripeError: jest.fn((e: any) => e),
}));

const mockGet = jest.fn();

jest.mock('firebase-admin', () => ({
  firestore: Object.assign(
    jest.fn(() => ({
      collection: jest.fn(() => ({
        doc: jest.fn(() => ({ get: mockGet })),
      })),
    })),
    { FieldValue: { delete: jest.fn(() => 'DELETE') } },
  ),
  app: jest.fn(() => ({})),
  initializeApp: jest.fn(),
}));

import { createPaymentIntent } from '../../callable/payments';

const run = (req: any) => (createPaymentIntent as any).run(req);

const HOUSE = {
  stripeAccountId: 'acct_test_123',
  stripeStatus: 'active',
  adminIds: ['admin-user'],
  superAdminIds: [],
  ownerId: 'admin-user',
};

const KEY = 'guest-doc-1-house-1-2026-11-09-5000';

/** House, then the resident's guest doc with 20000 cents owed. */
function seedDocs() {
  mockGet.mockResolvedValueOnce({ exists: true, data: () => HOUSE }).mockResolvedValueOnce({
    exists: true,
    data: () => ({ userId: 'resident-uid', houseId: 'house-1', rentOwed: 20000 }),
  });
}

const request = (data: Record<string, unknown> = {}) => ({
  auth: { uid: 'resident-uid', token: {} },
  data: {
    amount: 5000,
    houseId: 'house-1',
    guestId: 'guest-doc-1',
    idempotencyKey: KEY,
    ...data,
  },
});

/** Stripe's create response; `replayed` mirrors the Idempotent-Replayed header. */
function created(replayed: boolean) {
  const intent = {
    id: 'pi_first',
    client_secret: 'pi_first_secret_abc',
    status: 'requires_payment_method',
  };
  Object.defineProperty(intent, 'lastResponse', {
    enumerable: false,
    value: { headers: replayed ? { 'idempotent-replayed': 'true' } : {} },
  });
  return intent;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGet.mockReset();
  mockCreate.mockReset();
  mockRetrieve.mockReset();
});

describe('createPaymentIntent — replayed idempotency key', () => {
  it('returns alreadyPaid and no client secret when the replayed intent has succeeded', async () => {
    seedDocs();
    mockCreate.mockResolvedValueOnce(created(true));
    mockRetrieve.mockResolvedValueOnce({ id: 'pi_first', status: 'succeeded' });

    const result = await run(request());

    expect(result).toEqual({ alreadyPaid: true });
    expect(mockRetrieve).toHaveBeenCalledWith('pi_first');
  });

  it('makes no second charge: one create under the same key, and nothing confirmed', async () => {
    seedDocs();
    mockCreate.mockResolvedValueOnce(created(true));
    mockRetrieve.mockResolvedValueOnce({ id: 'pi_first', status: 'succeeded' });

    const result = await run(request());

    // No client secret means the app has nothing it could confirm a second time.
    expect(result).not.toHaveProperty('clientSecret');
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate.mock.calls[0][1]).toEqual({ idempotencyKey: KEY });
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('returns the client secret when the replayed intent is still unpaid', async () => {
    // The resident closed the sheet and tapped again: the same intent can still be paid.
    seedDocs();
    mockCreate.mockResolvedValueOnce(created(true));
    mockRetrieve.mockResolvedValueOnce({
      id: 'pi_first',
      status: 'requires_payment_method',
    });

    const result = await run(request());

    expect(result).toEqual({ clientSecret: 'pi_first_secret_abc' });
  });

  it('does not read the intent back on a fresh create', async () => {
    seedDocs();
    mockCreate.mockResolvedValueOnce(created(false));

    const result = await run(request());

    expect(result).toEqual({ clientSecret: 'pi_first_secret_abc' });
    expect(mockRetrieve).not.toHaveBeenCalled();
  });

  it('surfaces a failed read-back as an error rather than a stale client secret', async () => {
    seedDocs();
    mockCreate.mockResolvedValueOnce(created(true));
    const stripeDown = Object.assign(new Error('Stripe unavailable'), {
      type: 'StripeConnectionError',
    });
    mockRetrieve.mockRejectedValueOnce(stripeDown);

    await expect(run(request())).rejects.toBe(stripeDown);
  });
});
