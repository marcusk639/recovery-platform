// createOperatorSubscription refuses to start a second Stripe subscription for
// an account that already has one (launch item M9: a signed-in existing account
// can now reach web checkout, and the callable can be called directly). The
// guard reads the STORED user record; the client's subscriptionMetadata is
// never trusted. See util/checkoutGuard.ts.

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
jest.mock('../../api/stripeDeletion', () => ({ closeOperatorBilling: jest.fn() }));
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

describe('createOperatorSubscription refuses an account that already has a plan', () => {
  it.each([
    'active',
    'trialing',
    'cancelling',
    'past_due',
    'unpaid',
    'incomplete',
    'pending',
    'paused',
  ])('refuses status %s with a subscription, before Stripe', async (status) => {
    storeUser({ status, subscriptionId: 'sub_live', customerId: 'cus_live', tier: 'starter' });
    await refusedWith('plan-exists');
  });

  it('refuses a stored subscription id even when the status is empty', async () => {
    storeUser({ status: '', subscriptionId: 'sub_live', customerId: 'cus_live' });
    await refusedWith('plan-exists');
  });

  it('refuses a live status with no subscription id (a broken record)', async () => {
    storeUser({ status: 'active', subscriptionId: '' });
    await refusedWith('plan-exists');
  });

  it('refuses a canceled tier plan, pointing to Reactivate, so signup is no second trial', async () => {
    storeUser({ status: 'canceled', subscriptionId: 'sub_old', tier: 'starter', houseType: 'traditional' });
    await refusedWith('plan-ended');
  });

  it("trusts the stored record, not the client's metadata (a direct callable call)", async () => {
    storeUser({ status: 'trialing', subscriptionId: 'sub_live', tier: 'starter' });
    const error = await checkout(NEVER_SUBSCRIBED).catch((e: unknown) => e);
    expect(error).toMatchObject({ details: { reason: 'plan-exists' } });
    expect(mockInitializeTierCustomer).not.toHaveBeenCalled();
  });

  it('refuses an account with no user record', async () => {
    mockStored = undefined;
    await refusedWith('no-account');
  });

  it('refuses a resident account, which the app could never route to the plan', async () => {
    storeUser(NEVER_SUBSCRIBED, { isGuest: true, houseId: 'h1' });
    await refusedWith('not-operator-account');
  });

  it('refuses a house staff account (admin, not owner)', async () => {
    storeUser(NEVER_SUBSCRIBED, { isAdmin: true, isSuperAdmin: false });
    await refusedWith('not-operator-account');
  });

  it('refuses while another checkout for the account holds the lock', async () => {
    storeUser({ ...NEVER_SUBSCRIBED, checkoutStartedAt: Date.now() - 1000 });
    await refusedWith('checkout-in-progress');
  });
});

describe('createOperatorSubscription allows an account with no live plan', () => {
  it('checks out an existing account that never subscribed', async () => {
    storeUser(NEVER_SUBSCRIBED, { potentialSuperAdmin: true });
    await expect(checkout()).resolves.toMatchObject({ claimGranted: true });
    expect(mockInitializeTierCustomer).toHaveBeenCalledTimes(1);
    expect(mockWriteOperatorSubscription).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ subscriptionId: 'sub_new' }),
    );
  });

  it('checks out an incomplete_expired plan: never started, no trial used, Reactivate refuses it', async () => {
    storeUser({ status: 'incomplete_expired', subscriptionId: 'sub_x', tier: 'starter', houseType: 'traditional' });
    await checkout();
    expect(mockInitializeTierCustomer).toHaveBeenCalledTimes(1);
  });

  it('checks out a canceled plan whose tier is no longer for sale (Oxford Network)', async () => {
    storeUser({ status: 'canceled', subscriptionId: 'sub_x', tier: 'network', houseType: 'oxford' });
    await checkout();
    expect(mockInitializeTierCustomer).toHaveBeenCalledTimes(1);
  });

  it('checks out a canceled legacy plan with no tier, which Reactivate refuses', async () => {
    storeUser({ status: 'canceled', subscriptionId: 'sub_legacy', customerId: 'cus_legacy' });
    await checkout();
    expect(mockInitializeTierCustomer).toHaveBeenCalledTimes(1);
  });

  it("takes over a lock older than the lock's lifetime (a crashed checkout)", async () => {
    storeUser({ ...NEVER_SUBSCRIBED, checkoutStartedAt: Date.now() - 10 * 60 * 1000 });
    await checkout();
    expect(mockInitializeTierCustomer).toHaveBeenCalledTimes(1);
  });

  it('locks before Stripe and frees the lock when Stripe fails, so a retry runs at once', async () => {
    storeUser(NEVER_SUBSCRIBED);
    // Thrown before any subscription could exist (api/stripe marks these).
    mockInitializeTierCustomer.mockRejectedValueOnce(
      Object.assign(new Error('card_declined'), { beforeSubscription: true }),
    );
    await expect(checkout()).rejects.toThrow('card_declined');
    expect(mockStored?.subscriptionMetadata.checkoutStartedAt).toBe(0);

    await checkout();
    expect(mockInitializeTierCustomer).toHaveBeenCalledTimes(2);
  });

  it('a concurrent second checkout is refused while the first holds the lock', async () => {
    storeUser(NEVER_SUBSCRIBED);
    let finishStripe: (v: unknown) => void = () => undefined;
    mockInitializeTierCustomer.mockImplementationOnce(
      () => new Promise((resolve) => (finishStripe = resolve)),
    );
    const first = checkout();
    await new Promise((r) => setImmediate(r));
    const second = await checkout().catch((e: unknown) => e);
    expect(second).toMatchObject({ details: { reason: 'checkout-in-progress' } });
    finishStripe({ customerId: 'cus_new', subscriptionId: 'sub_new', status: 'trialing' });
    await first;
    expect(mockInitializeTierCustomer).toHaveBeenCalledTimes(1);
  });
});

describe("releaseCheckout", () => {
  it("frees only its own lock, never one a later checkout took", async () => {
    storeUser({ ...NEVER_SUBSCRIBED, checkoutStartedAt: 222 });
    await releaseCheckout({ uid: "user-1", startedAt: 111 });
    expect(mockStored?.subscriptionMetadata.checkoutStartedAt).toBe(222);
    await releaseCheckout({ uid: "user-1", startedAt: 222 });
    expect(mockStored?.subscriptionMetadata.checkoutStartedAt).toBe(0);
  });
});
