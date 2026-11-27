// The Stripe side of createOperatorSubscription's double-billing guard (launch
// item M9, review fixes): the checkout lock is freed only when no subscription
// can exist, a live Stripe subscription the record doesn't show is refused, and
// a reversed checkout frees the lock so "Please try again" works at once.

class HttpsError extends Error {
  code: string;
  details?: unknown;
  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
  }
}
jest.mock('firebase-functions/v2/https', () => ({
  onCall: (_opts: unknown, handler: Function) => handler,
  HttpsError,
}));
jest.mock('firebase-functions', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));
jest.mock('firebase-functions/params', () => ({
  defineSecret: jest.fn((name: string) => ({ name })),
}));
jest.mock('stripe', () => jest.fn().mockImplementation(() => ({})));
jest.mock('firebase-admin', () => ({
  firestore: Object.assign(
    jest.fn(() => ({})),
    {},
  ),
}));

const mockInitializeTierCustomer = jest.fn();
// No subscription in Stripe that the record doesn't show (subscriptionCheckoutStripe.test.ts).
const mockFindLive = jest.fn();
jest.mock('../../api/stripe', () => ({
  initializeTierCustomer: (...a: unknown[]) => mockInitializeTierCustomer(...a),
  findLiveSubscriptionForUser: (...a: unknown[]) => mockFindLive(...a),
  failedBeforeSubscription: (e: { beforeSubscription?: boolean } | null) => !!e?.beforeSubscription,
}));

// One stored user doc, read and written through the guard's transaction.
let mockStored: Record<string, any> | undefined;
const mockTxUpdate = jest.fn((_ref: unknown, data: Record<string, unknown>) => {
  if (mockStored && 'subscriptionMetadata' in data) {
    mockStored.subscriptionMetadata = data.subscriptionMetadata;
  }
  if (mockStored && 'subscriptionMetadata.checkoutStartedAt' in data) {
    mockStored.subscriptionMetadata = {
      ...mockStored.subscriptionMetadata,
      checkoutStartedAt: data['subscriptionMetadata.checkoutStartedAt'],
    };
  }
});
const mockUpsertSubscriptionDoc = jest.fn();
jest.mock('../../api/firestore', () => ({
  userCollection: { doc: (id: string) => ({ id }) },
  ratsFirestore: {
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        get: async () => ({ exists: mockStored !== undefined, data: () => mockStored }),
        update: (ref: unknown, data: Record<string, unknown>) => mockTxUpdate(ref, data),
      }),
  },
  getUser: jest.fn(async () => mockStored),
  updateUser: jest.fn(),
  getHouse: jest.fn(),
  upsertSubscriptionDoc: (...a: unknown[]) => mockUpsertSubscriptionDoc(...a),
}));
const mockWriteOperatorSubscription = jest.fn(async (_uid: string, meta: object) => ({
  ...meta,
  houses: {},
}));
jest.mock('../../util/operatorSubscriptionWrite', () => ({
  writeOperatorSubscription: (uid: string, meta: object) =>
    mockWriteOperatorSubscription(uid, meta),
}));
jest.mock('../../util/email', () => ({ sendEmail: jest.fn(), regroupEmail: 'x@y.z' }));
const mockCloseOperatorBilling = jest.fn();
jest.mock('../../api/stripeDeletion', () => ({
  closeOperatorBilling: (...a: unknown[]) => mockCloseOperatorBilling(...a),
}));
jest.mock('../../util/operatorHouses', () => ({ setOperatorHousesStatus: jest.fn() }));
jest.mock('../../util/houseRoles', () => ({ isPrimaryOwner: jest.fn() }));
jest.mock('../../util/salesSwitch', () => ({ isSalesOpen: async () => true }));
const mockGrantClaim = jest.fn().mockResolvedValue(true);
jest.mock('../../util/superAdminClaim', () => ({
  grantPotentialSuperAdminClaim: (...a: unknown[]) => mockGrantClaim(...a),
}));

import { createOperatorSubscription } from '../../callable/subscriptions';
import { CHECKOUT_REFUSAL_MESSAGES, releaseCheckout } from '../../util/checkoutGuard';

const NEVER_SUBSCRIBED = { status: '', subscriptionId: '', customerId: '', houses: {} };
const checkout = (clientMeta: object = NEVER_SUBSCRIBED) =>
  (createOperatorSubscription as unknown as Function)({
    auth: { uid: 'user-1' },
    data: {
      user: { id: 'user-1', email: 'op@test.com', subscriptionMetadata: clientMeta },
      paymentMethod: 'pm_test',
      houseType: 'traditional',
      tier: 'starter',
    },
  });
const storeUser = (subscriptionMetadata: object, extra: object = {}) => {
  mockStored = { id: 'user-1', ...extra, subscriptionMetadata: { ...subscriptionMetadata } };
};
const refusedWith = async (reason: string) => {
  const error = await checkout().catch((e: unknown) => e);
  expect(error).toMatchObject({
    code: 'failed-precondition',
    message: CHECKOUT_REFUSAL_MESSAGES[reason as keyof typeof CHECKOUT_REFUSAL_MESSAGES],
    details: { reason },
  });
  // Refused before Stripe: no customer, no subscription, nothing written.
  expect(mockInitializeTierCustomer).not.toHaveBeenCalled();
  expect(mockWriteOperatorSubscription).not.toHaveBeenCalled();
  expect(mockUpsertSubscriptionDoc).not.toHaveBeenCalled();
  expect(mockGrantClaim).not.toHaveBeenCalled();
};

beforeEach(() => {
  jest.clearAllMocks();
  mockFindLive.mockResolvedValue(null);
  mockStored = undefined;
  process.env.TIER_BILLING_ENABLED = 'true';
  process.env.STRIPE_PRICE_TRAD_STARTER = 'price_starter';
  mockInitializeTierCustomer.mockResolvedValue({
    customerId: 'cus_new',
    subscriptionId: 'sub_new',
    status: 'trialing',
    tier: 'starter',
    houseType: 'traditional',
  });
});
afterEach(() => {
  delete process.env.TIER_BILLING_ENABLED;
  delete process.env.STRIPE_PRICE_TRAD_STARTER;
});

const lockOf = () => mockStored?.subscriptionMetadata?.checkoutStartedAt;

describe('the checkout lock after a Stripe error', () => {
  it('stays when the error came after the subscription create, so a retry is refused', async () => {
    storeUser(NEVER_SUBSCRIBED);
    mockInitializeTierCustomer.mockRejectedValueOnce(new Error('Request timed out'));
    await expect(checkout()).rejects.toThrow('Request timed out');
    expect(lockOf()).toBeGreaterThan(0);

    const retry = await checkout().catch((e: unknown) => e);
    expect(retry).toMatchObject({ details: { reason: 'checkout-in-progress' } });
    expect(mockInitializeTierCustomer).toHaveBeenCalledTimes(1);
  });

  it('is freed when the error came before any subscription could exist', async () => {
    storeUser(NEVER_SUBSCRIBED);
    mockInitializeTierCustomer.mockRejectedValueOnce(
      Object.assign(new Error('Your card was declined.'), { beforeSubscription: true }),
    );
    await expect(checkout()).rejects.toThrow('declined');
    expect(lockOf()).toBe(0);
  });
});

describe('a live Stripe subscription the record does not show', () => {
  it('is refused before Stripe is asked for another, and the lock is freed', async () => {
    storeUser(NEVER_SUBSCRIBED);
    mockFindLive.mockResolvedValue({ id: 'sub_orphan', status: 'trialing' });
    const error = await checkout().catch((e: unknown) => e);
    expect(error).toMatchObject({
      code: 'failed-precondition',
      message: CHECKOUT_REFUSAL_MESSAGES['unrecorded-subscription'],
      details: { reason: 'unrecorded-subscription' },
    });
    expect(mockFindLive).toHaveBeenCalledWith('user-1', 'op@test.com');
    expect(mockInitializeTierCustomer).not.toHaveBeenCalled();
    expect(lockOf()).toBe(0);
  });

  it('a failed Stripe search refuses the checkout rather than guess, and frees the lock', async () => {
    storeUser(NEVER_SUBSCRIBED);
    mockFindLive.mockRejectedValue(new Error('stripe down'));
    await expect(checkout()).rejects.toMatchObject({ code: 'unavailable' });
    expect(mockInitializeTierCustomer).not.toHaveBeenCalled();
    expect(lockOf()).toBe(0);
  });

  it('is not searched for when the record already refuses', async () => {
    storeUser({ status: 'active', subscriptionId: 'sub_1' });
    await expect(checkout()).rejects.toMatchObject({ details: { reason: 'plan-exists' } });
    expect(mockFindLive).not.toHaveBeenCalled();
  });
});

describe('a checkout whose records could not be written', () => {
  beforeEach(() => mockWriteOperatorSubscription.mockRejectedValueOnce(new Error('firestore down')));

  it('frees the lock once the new subscription is cancelled, so "try again" works', async () => {
    storeUser(NEVER_SUBSCRIBED);
    mockCloseOperatorBilling.mockResolvedValue(undefined);
    await expect(checkout()).rejects.toThrow(/cancelled it/);
    expect(mockCloseOperatorBilling).toHaveBeenCalledWith('user-1', 'sub_new', 'cus_new');
    expect(lockOf()).toBe(0);
  });

  it('keeps the lock when the cancel fails too: a live subscription has no record', async () => {
    storeUser(NEVER_SUBSCRIBED);
    mockCloseOperatorBilling.mockRejectedValue(new Error('stripe down'));
    await expect(checkout()).rejects.toThrow(/contact support/);
    expect(lockOf()).toBeGreaterThan(0);
  });
});

describe('the first lock on an account with no subscription record', () => {
  it('writes a whole record, with an empty houses map', async () => {
    mockStored = { id: 'user-1' };
    await checkout();
    expect(mockTxUpdate).toHaveBeenCalledWith(expect.anything(), {
      subscriptionMetadata: { status: '', houses: {}, checkoutStartedAt: expect.any(Number) },
    });
  });
});
