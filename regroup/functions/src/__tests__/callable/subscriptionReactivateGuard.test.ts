// reactivateOperatorSubscription restarts a canceled tier plan by creating a new
// Stripe subscription. It now takes the checkout lock (util/checkoutGuard), so a
// Reactivate and a checkout, or two Reactivates, for one account can't both
// create one; it checks Stripe for a live subscription the record doesn't show;
// and it refuses a tier no longer for sale, as checkout does.

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

const mockReactivate = jest.fn();
const mockFindLive = jest.fn();
jest.mock('../../api/stripe', () => ({
  reactivateSubscription: (...a: unknown[]) => mockReactivate(...a),
  uncancelSubscription: jest.fn(),
  findLiveSubscriptionForUser: (...a: unknown[]) => mockFindLive(...a),
  failedBeforeSubscription: (e: { beforeSubscription?: boolean } | null) => !!e?.beforeSubscription,
}));

// One stored user doc, read by getUser and through the guard's transaction.
let mockStored: Record<string, any> | undefined;
const mockUpdateUser = jest.fn(async (_uid: string, data: Record<string, any>) => {
  if (mockStored && data.subscriptionMetadata)
    mockStored.subscriptionMetadata = data.subscriptionMetadata;
});
jest.mock('../../api/firestore', () => ({
  userCollection: { doc: (id: string) => ({ id }) },
  ratsFirestore: {
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        get: async () => ({ exists: mockStored !== undefined, data: () => mockStored }),
        update: (_ref: unknown, data: Record<string, unknown>) => {
          if (mockStored && 'subscriptionMetadata.checkoutStartedAt' in data) {
            mockStored.subscriptionMetadata = {
              ...mockStored.subscriptionMetadata,
              checkoutStartedAt: data['subscriptionMetadata.checkoutStartedAt'],
            };
          }
        },
      }),
  },
  getUser: jest.fn(async () => (mockStored ? { ...mockStored } : undefined)),
  updateUser: (uid: string, data: Record<string, any>) => mockUpdateUser(uid, data),
  getHouse: jest.fn(),
  upsertSubscriptionDoc: jest.fn(),
}));
jest.mock('../../util/operatorSubscriptionWrite', () => ({ writeOperatorSubscription: jest.fn() }));
jest.mock('../../util/email', () => ({ sendEmail: jest.fn(), regroupEmail: 'x@y.z' }));
jest.mock('../../api/stripeDeletion', () => ({ closeOperatorBilling: jest.fn() }));
jest.mock('../../util/operatorHouses', () => ({ setOperatorHousesStatus: jest.fn() }));
jest.mock('../../util/houseRoles', () => ({ isPrimaryOwner: jest.fn() }));
jest.mock('../../util/salesSwitch', () => ({ isSalesOpen: async () => true }));
jest.mock('../../util/superAdminClaim', () => ({ grantPotentialSuperAdminClaim: jest.fn() }));

import { reactivateOperatorSubscription } from '../../callable/subscriptions';
import { CHECKOUT_LOCK_MS, CHECKOUT_REFUSAL_MESSAGES } from '../../util/checkoutGuard';

const CANCELED = {
  status: 'canceled',
  subscriptionId: 'sub_old',
  customerId: 'cus_1',
  houseType: 'traditional',
  tier: 'starter',
  houses: {},
};
const storeUser = (meta: object) => {
  mockStored = { id: 'user-1', email: 'op@rats-e2e.com', subscriptionMetadata: { ...meta } };
};
const reactivate = () =>
  (reactivateOperatorSubscription as unknown as Function)({
    auth: { uid: 'user-1', token: { email: 'op@rats-e2e.com' } },
    data: { user: { id: 'user-1', subscriptionMetadata: { ...CANCELED } } },
  });
const NEW_SUB = {
  status: 'active',
  subscriptionId: 'sub_new',
  customerId: 'cus_1',
  houseType: 'traditional',
  tier: 'starter',
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.TIER_BILLING_ENABLED = 'true';
  process.env.STRIPE_PRICE_TRAD_STARTER = 'price_starter';
  mockFindLive.mockResolvedValue(null);
  mockReactivate.mockResolvedValue({ ...NEW_SUB });
});

describe('reactivateOperatorSubscription: one subscription per account', () => {
  it('restarts a canceled plan still for sale, and clears the lock with the new record', async () => {
    storeUser(CANCELED);
    const result = await reactivate();
    expect(mockReactivate).toHaveBeenCalledTimes(1);
    expect(result.subscriptionMetadata.subscriptionId).toBe('sub_new');
    expect(mockStored!.subscriptionMetadata.checkoutStartedAt).toBeUndefined();
  });

  it('holds the checkout lock while Stripe creates the subscription', async () => {
    storeUser(CANCELED);
    let lockDuringCreate: unknown;
    mockReactivate.mockImplementation(async () => {
      lockDuringCreate = mockStored!.subscriptionMetadata.checkoutStartedAt;
      return { ...NEW_SUB };
    });
    await reactivate();
    expect(typeof lockDuringCreate).toBe('number');
    expect(lockDuringCreate as number).toBeGreaterThan(0);
  });

  it('refuses while another checkout or Reactivate holds the lock, before Stripe', async () => {
    storeUser({ ...CANCELED, checkoutStartedAt: Date.now() - 1000 });
    await expect(reactivate()).rejects.toMatchObject({
      code: 'failed-precondition',
      message: CHECKOUT_REFUSAL_MESSAGES['checkout-in-progress'],
      details: { reason: 'checkout-in-progress' },
    });
    expect(mockReactivate).not.toHaveBeenCalled();
  });

  it('goes ahead once an old lock has expired', async () => {
    storeUser({ ...CANCELED, checkoutStartedAt: Date.now() - CHECKOUT_LOCK_MS - 1000 });
    await reactivate();
    expect(mockReactivate).toHaveBeenCalledTimes(1);
  });

  it('refuses when Stripe already has a live subscription the record does not show', async () => {
    storeUser(CANCELED);
    mockFindLive.mockResolvedValue({ id: 'sub_orphan', status: 'active' });
    await expect(reactivate()).rejects.toMatchObject({
      code: 'failed-precondition',
      details: { reason: 'unrecorded-subscription' },
    });
    expect(mockReactivate).not.toHaveBeenCalled();
    expect(mockStored!.subscriptionMetadata.checkoutStartedAt).toBe(0);
  });

  it('releases the lock when Stripe fails before any subscription exists', async () => {
    storeUser(CANCELED);
    mockReactivate.mockRejectedValue(
      Object.assign(new Error('card declined'), { beforeSubscription: true }),
    );
    await expect(reactivate()).rejects.toThrow('card declined');
    expect(mockStored!.subscriptionMetadata.checkoutStartedAt).toBe(0);
  });

  it('keeps the lock when the Stripe error leaves it unclear whether a subscription exists', async () => {
    storeUser(CANCELED);
    mockReactivate.mockRejectedValue(new Error('timeout'));
    await expect(reactivate()).rejects.toThrow('timeout');
    expect(mockStored!.subscriptionMetadata.checkoutStartedAt).toBeGreaterThan(0);
  });

  it('refuses a tier no longer for sale, so the operator picks a plan at checkout', async () => {
    storeUser({ ...CANCELED, houseType: 'oxford', tier: 'network' });
    await expect(reactivate()).rejects.toMatchObject({
      code: 'failed-precondition',
      message: 'This plan is no longer offered. Choose a plan to subscribe again.',
    });
    expect(mockReactivate).not.toHaveBeenCalled();
  });
});
