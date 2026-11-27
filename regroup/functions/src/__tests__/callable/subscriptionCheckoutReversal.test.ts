// A checkout whose records fail after Stripe created the subscription is
// reversed: the subscription is cancelled and the operator is told to try
// again. writeOperatorSubscription may already have replaced the user record
// with the cancelled plan by then. Left there, every retry is refused as
// plan-exists, and nothing repairs it: the subscription.deleted webhook finds a
// subscription only through its subscriptions doc, which was never written.
// So the reversal puts back the record the checkout replaced.

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
jest.mock('../../api/stripe', () => ({
  initializeTierCustomer: (...a: unknown[]) => mockInitializeTierCustomer(...a),
  findLiveSubscriptionForUser: async () => null,
  failedBeforeSubscription: () => false,
}));

// One stored user doc. Updates apply top-level and dotted keys as Firestore does.
let mockStored: Record<string, any> | undefined;
const mockApplyUpdate = (data: Record<string, unknown>) => {
  if (!mockStored) return;
  for (const [key, value] of Object.entries(data)) {
    const [top, nested] = key.split('.');
    if (nested) mockStored[top] = { ...mockStored[top], [nested]: value };
    else mockStored[top] = value;
  }
};
const mockUpsertSubscriptionDoc = jest.fn();
jest.mock('../../api/firestore', () => ({
  userCollection: { doc: (id: string) => ({ id }) },
  ratsFirestore: {
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        get: async () => ({ exists: mockStored !== undefined, data: () => mockStored }),
        update: (_ref: unknown, data: Record<string, unknown>) => mockApplyUpdate(data),
      }),
  },
  getUser: jest.fn(async () => mockStored),
  updateUser: jest.fn(),
  getHouse: jest.fn(),
  upsertSubscriptionDoc: (...a: unknown[]) => mockUpsertSubscriptionDoc(...a),
}));
// As the real writer: replaces the metadata, keeps the stored houses map, and
// sets potentialSuperAdmin.
const mockWriteOperatorSubscription = jest.fn(async (_uid: string, meta: object) => {
  const written = { ...meta, houses: mockStored?.subscriptionMetadata?.houses ?? {} };
  mockApplyUpdate({ subscriptionMetadata: written, potentialSuperAdmin: true });
  return written;
});
jest.mock('../../util/operatorSubscriptionWrite', () => ({
  writeOperatorSubscription: (uid: string, meta: object) =>
    mockWriteOperatorSubscription(uid, meta),
}));
const mockCloseOperatorBilling = jest.fn();
const mockSubscriptionEnded = jest.fn();
jest.mock('../../api/stripeDeletion', () => ({
  closeOperatorBilling: (...a: unknown[]) => mockCloseOperatorBilling(...a),
  subscriptionEnded: (...a: unknown[]) => mockSubscriptionEnded(...a),
}));
jest.mock('../../util/email', () => ({ sendEmail: jest.fn(), regroupEmail: 'x@y.z' }));
jest.mock('../../util/operatorHouses', () => ({ setOperatorHousesStatus: jest.fn() }));
jest.mock('../../util/houseRoles', () => ({ isPrimaryOwner: jest.fn() }));
jest.mock('../../util/salesSwitch', () => ({ isSalesOpen: async () => true }));
jest.mock('../../util/superAdminClaim', () => ({
  grantPotentialSuperAdminClaim: async () => true,
}));

import { createOperatorSubscription } from '../../callable/subscriptions';

const REVERSED =
  "We couldn't finish setting up your subscription, so we cancelled it. You have not been charged. Please try again.";
const ORPHANED =
  "We couldn't finish setting up your subscription. Please contact support before trying again, so you aren't billed twice.";

// Never trusted: the guard reads the stored record.
const CLIENT_META = { status: '', subscriptionId: '', customerId: '', houses: {} };
const checkout = () =>
  (createOperatorSubscription as unknown as Function)({
    auth: { uid: 'user-1' },
    data: {
      user: { id: 'user-1', email: 'op@test.com', subscriptionMetadata: CLIENT_META },
      paymentMethod: 'pm_test',
      houseType: 'traditional',
      tier: 'starter',
    },
  });
const storeUser = (subscriptionMetadata: object | undefined, extra: object = {}) => {
  mockStored = { id: 'user-1', ...extra };
  if (subscriptionMetadata) mockStored.subscriptionMetadata = { ...subscriptionMetadata };
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.TIER_BILLING_ENABLED = 'true';
  process.env.STRIPE_PRICE_TRAD_STARTER = 'price_starter';
  mockInitializeTierCustomer.mockResolvedValue({
    customerId: 'cus_new',
    subscriptionId: 'sub_new',
    subscriptionItemId: 'si_new',
    status: 'trialing',
  });
  mockCloseOperatorBilling.mockResolvedValue(undefined);
  mockSubscriptionEnded.mockResolvedValue(false);
  mockUpsertSubscriptionDoc.mockRejectedValueOnce(new Error('firestore unavailable'));
});
afterEach(() => {
  delete process.env.TIER_BILLING_ENABLED;
  delete process.env.STRIPE_PRICE_TRAD_STARTER;
});

describe('a reversed checkout leaves the account able to retry', () => {
  it('puts back the record of an account that never subscribed, and the retry checks out', async () => {
    storeUser({ status: '', subscriptionId: '', customerId: '', houses: { h1: 2 } });
    await expect(checkout()).rejects.toMatchObject({ code: 'internal', message: REVERSED });

    expect(mockCloseOperatorBilling).toHaveBeenCalledWith('user-1', 'sub_new', 'cus_new');
    expect(mockStored!.subscriptionMetadata).toMatchObject({
      status: '',
      subscriptionId: '',
      houses: { h1: 2 },
      checkoutStartedAt: 0,
    });
    expect(mockStored!.potentialSuperAdmin).toBe(false);

    await expect(checkout()).resolves.toMatchObject({
      subscriptionMetadata: expect.objectContaining({ subscriptionId: 'sub_new' }),
    });
    expect(mockInitializeTierCustomer).toHaveBeenCalledTimes(2);
  });

  it('puts back a canceled legacy plan, which may check out again', async () => {
    storeUser(
      { status: 'canceled', subscriptionId: 'sub_legacy', customerId: 'cus_legacy', houses: {} },
      { potentialSuperAdmin: true },
    );
    await expect(checkout()).rejects.toMatchObject({ message: REVERSED });

    expect(mockStored!.subscriptionMetadata).toMatchObject({
      status: 'canceled',
      subscriptionId: 'sub_legacy',
      customerId: 'cus_legacy',
      checkoutStartedAt: 0,
    });
    expect(mockStored!.potentialSuperAdmin).toBe(true);
    await checkout();
    expect(mockInitializeTierCustomer).toHaveBeenCalledTimes(2);
  });

  it('gives an account with no metadata yet the empty record claimCheckout wrote', async () => {
    storeUser(undefined);
    await expect(checkout()).rejects.toMatchObject({ message: REVERSED });

    expect(mockStored!.subscriptionMetadata).toEqual({
      status: '',
      houses: {},
      checkoutStartedAt: 0,
    });
    await checkout();
    expect(mockInitializeTierCustomer).toHaveBeenCalledTimes(2);
  });

  it('only frees the lock when the record write itself failed', async () => {
    storeUser({ status: '', subscriptionId: '', houses: {} });
    mockWriteOperatorSubscription.mockRejectedValueOnce(new Error('write failed'));
    mockUpsertSubscriptionDoc.mockReset();
    await expect(checkout()).rejects.toMatchObject({ message: REVERSED });

    expect(mockStored!.subscriptionMetadata).toEqual({
      status: '',
      subscriptionId: '',
      houses: {},
      checkoutStartedAt: 0,
    });
  });

  it('keeps the record and the lock when the cancel failed: that subscription is still live', async () => {
    storeUser({ status: '', subscriptionId: '', houses: {} });
    mockCloseOperatorBilling.mockRejectedValueOnce(new Error('stripe down'));
    await expect(checkout()).rejects.toMatchObject({ code: 'internal', message: ORPHANED });

    expect(mockStored!.subscriptionMetadata.subscriptionId).toBe('sub_new');
    expect(mockStored!.potentialSuperAdmin).toBe(true);
  });

  // closeOperatorBilling cancels, then deletes the customer. If only the delete
  // failed (or the cancel's response was lost), nothing bills: Stripe says so.
  it('treats a cancel that errored as done when Stripe shows the subscription ended', async () => {
    storeUser({ status: '', subscriptionId: '', houses: {} });
    mockCloseOperatorBilling.mockRejectedValueOnce(new Error('customer delete failed'));
    mockSubscriptionEnded.mockResolvedValueOnce(true);
    await expect(checkout()).rejects.toMatchObject({ code: 'internal', message: REVERSED });

    expect(mockSubscriptionEnded).toHaveBeenCalledWith('sub_new');
    expect(mockStored!.subscriptionMetadata).toMatchObject({
      subscriptionId: '',
      checkoutStartedAt: 0,
    });
    await checkout();
    expect(mockInitializeTierCustomer).toHaveBeenCalledTimes(2);
  });

  it('keeps the record when Stripe cannot say whether the subscription ended', async () => {
    storeUser({ status: '', subscriptionId: '', houses: {} });
    mockCloseOperatorBilling.mockRejectedValueOnce(new Error('stripe down'));
    mockSubscriptionEnded.mockRejectedValueOnce(new Error('stripe down'));
    await expect(checkout()).rejects.toMatchObject({ message: ORPHANED });
    expect(mockStored!.subscriptionMetadata.subscriptionId).toBe('sub_new');
  });

  // The 60s timeout doesn't stop the callable's code: a slow checkout can
  // resume after its lock expired and a retry took it over. Keyed per attempt,
  // both would create a subscription, so the attempt checks its lock last.
  it('stops before Stripe creates the subscription once a retry has taken over its lock', async () => {
    storeUser({ status: '', subscriptionId: '', houses: {} });
    mockUpsertSubscriptionDoc.mockReset(); // never reached: no queued failure to leak
    mockInitializeTierCustomer.mockImplementationOnce(async (...args: unknown[]) => {
      mockStored!.subscriptionMetadata.checkoutStartedAt = 1_700_000_999_000;
      await (args[6] as { beforeCreate: () => Promise<void> }).beforeCreate();
      return { customerId: 'cus_new', subscriptionId: 'sub_new', status: 'trialing' };
    });
    await expect(checkout()).rejects.toMatchObject({ code: 'aborted' });
    expect(mockWriteOperatorSubscription).not.toHaveBeenCalled();
    expect(mockStored!.subscriptionMetadata.checkoutStartedAt).toBe(1_700_000_999_000);
  });

  // The reversal deleted the customer. Keyed by day, the retry got that deleted
  // customer back from Stripe (or a key-reuse error with a new card) until the
  // next UTC day. Each attempt is keyed by its own checkout lock instead.
  it('starts the retry as a new Stripe attempt, keyed by its own checkout lock', async () => {
    storeUser({ status: '', subscriptionId: '', houses: {} });
    let clock = 1_700_000_000_000;
    const now = jest.spyOn(Date, 'now').mockImplementation(() => (clock += 1_000));
    try {
      await expect(checkout()).rejects.toMatchObject({ message: REVERSED });
      await checkout();
    } finally {
      now.mockRestore();
    }
    const [first, retry] = mockInitializeTierCustomer.mock.calls.map((args) => args[6]?.key);
    expect(typeof first).toBe('string');
    expect(typeof retry).toBe('string');
    expect(retry).not.toBe(first);
  });
});
