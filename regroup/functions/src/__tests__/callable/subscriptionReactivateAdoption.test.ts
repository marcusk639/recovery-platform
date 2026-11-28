// A Reactivate whose records failed after Stripe's create leaves its replacement
// live and paid for. The next Reactivate records it instead of creating another
// (subscriptionReactivateReplacement.test.ts), but only when it is unambiguous,
// judged on the stored record, and whatever the sales switch or the tier's sale
// status: an operator who has paid must be able to get back in.

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
const mockFindLives = jest.fn();
const mockIsUnrecordedReplacement = jest.fn();
const mockReplacementFrom = jest.fn((sub: { id: string; status: string }) => ({
  subscriptionId: sub.id,
  customerId: 'cus_1',
  status: sub.status,
  houseType: 'traditional',
  tier: 'professional',
  houses: {},
}));
jest.mock('../../api/stripe', () => ({
  reactivateSubscription: (...a: unknown[]) => mockReactivate(...a),
  findLiveSubscriptionsForUser: (...a: unknown[]) => mockFindLives(...a),
  failedBeforeSubscription: () => false,
  isUnrecordedReplacement: (...a: unknown[]) => mockIsUnrecordedReplacement(...a),
  replacementMetadataFrom: (sub: { id: string; status: string }, ...rest: unknown[]) =>
    mockReplacementFrom(sub, ...(rest as [])),
}));

// One stored user doc; getUser returns the copy read before it moved on.
let mockStored: Record<string, any>;
let mockFailRecordWrite = false;
const mockApplyUpdate = (data: Record<string, unknown>) => {
  if (mockFailRecordWrite && 'subscriptionMetadata' in data) throw new Error('ABORTED');
  for (const [key, value] of Object.entries(data)) {
    const [top, nested] = key.split('.');
    if (nested) mockStored[top] = { ...mockStored[top], [nested]: value };
    else mockStored[top] = value;
  }
};
jest.mock('../../api/firestore', () => ({
  userCollection: { doc: (id: string) => ({ id }) },
  stripUndefinedDeep: (v: unknown) => v,
  ratsFirestore: {
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      // All-or-nothing, like Firestore: a throw writes nothing.
      const before = JSON.parse(JSON.stringify(mockStored));
      try {
        return await fn({
          get: async () => ({ exists: true, data: () => mockStored }),
          update: (_ref: unknown, data: Record<string, unknown>) => mockApplyUpdate(data),
        });
      } catch (error) {
        mockStored = before;
        throw error;
      }
    },
  },
  getUser: jest.fn(async () => JSON.parse(JSON.stringify(mockStored))),
  updateUser: jest.fn(),
  getHouse: jest.fn(),
  upsertSubscriptionDoc: jest.fn(),
}));
jest.mock('../../util/houseRoles', () => ({ isPrimaryOwner: async () => true }));
jest.mock('../../util/email', () => ({ sendEmail: jest.fn(), regroupEmail: 'x@y.z' }));
jest.mock('../../util/operatorHouses', () => ({ setOperatorHousesStatus: jest.fn() }));
let mockSalesOpen = true;
jest.mock('../../util/salesSwitch', () => ({ isSalesOpen: async () => mockSalesOpen }));
jest.mock('../../util/superAdminClaim', () => ({ grantPotentialSuperAdminClaim: jest.fn() }));

import { reactivateOperatorSubscription } from '../../callable/subscriptions';

const CANCELED = {
  subscriptionId: 'sub_old',
  customerId: 'cus_1',
  status: 'canceled',
  houseType: 'traditional',
  tier: 'professional',
  maxResidents: 20,
  maxProperties: 3,
  houses: {},
};
// Untrusted: another customer and tier than the stored record.
const reactivate = () =>
  (reactivateOperatorSubscription as unknown as Function)({
    auth: { uid: 'op', token: { email: 'op@test.com' } },
    data: {
      user: {
        id: 'op',
        subscriptionMetadata: {
          status: 'canceled',
          subscriptionId: 'sub_old',
          customerId: 'cus_client',
          tier: 'starter',
        },
      },
    },
  });
const storeOperator = (meta: object = {}) => {
  mockStored = { id: 'op', email: 'op@test.com', subscriptionMetadata: { ...CANCELED, ...meta } };
};
const LEFT_LIVE = { id: 'sub_new', status: 'active' };
const housesStatus = () =>
  jest.requireMock<{ setOperatorHousesStatus: jest.Mock }>('../../util/operatorHouses')
    .setOperatorHousesStatus;
const loggedError = () =>
  jest.requireMock<{ logger: { error: jest.Mock } }>('firebase-functions').logger.error;

beforeEach(() => {
  jest.clearAllMocks();
  mockFailRecordWrite = false;
  mockSalesOpen = true;
  process.env.TIER_BILLING_ENABLED = 'true';
  process.env.STRIPE_PRICE_TRAD_PROFESSIONAL = 'price_pro';
  mockFindLives.mockResolvedValue([LEFT_LIVE]);
  mockIsUnrecordedReplacement.mockReturnValue(true);
});
afterEach(() => {
  delete process.env.TIER_BILLING_ENABLED;
  delete process.env.STRIPE_PRICE_TRAD_PROFESSIONAL;
  delete process.env.STRIPE_PRICE_OXFORD_NETWORK;
});

describe('adopting the replacement an earlier Reactivate left live', () => {
  it('judges it on the stored record, not the client copy, and records it in place of the lock', async () => {
    storeOperator();
    let lockWhileJudged: unknown;
    mockIsUnrecordedReplacement.mockImplementation(() => {
      lockWhileJudged = mockStored.subscriptionMetadata.checkoutStartedAt;
      return true;
    });
    await reactivate();

    expect(mockIsUnrecordedReplacement).toHaveBeenCalledWith(
      LEFT_LIVE,
      expect.objectContaining({ customerId: 'cus_1', tier: 'professional' }),
    );
    expect(mockReplacementFrom).toHaveBeenCalledWith(
      LEFT_LIVE,
      expect.objectContaining({ customerId: 'cus_1', tier: 'professional' }),
      'cus_1',
    );
    expect(mockReactivate).not.toHaveBeenCalled();
    expect(lockWhileJudged as number).toBeGreaterThan(0);
    expect(mockStored.subscriptionMetadata.subscriptionId).toBe('sub_new');
    expect(mockStored.subscriptionMetadata.checkoutStartedAt).toBeUndefined();
  });

  // Two live, unrecorded subscriptions: adopting one would leave the other
  // billing with nothing pointing at it, and nothing would look again.
  it('refuses when Stripe holds two, creating nothing, logging both, and freeing the lock', async () => {
    storeOperator();
    mockFindLives.mockResolvedValue([LEFT_LIVE, { id: 'sub_second', status: 'active' }]);

    await expect(reactivate()).rejects.toMatchObject({
      code: 'failed-precondition',
      details: { reason: 'unrecorded-subscription' },
    });
    expect(mockReactivate).not.toHaveBeenCalled();
    expect(mockStored.subscriptionMetadata).toMatchObject({
      subscriptionId: 'sub_old',
      checkoutStartedAt: 0,
    });
    expect(loggedError()).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ subscriptionIds: ['sub_new', 'sub_second'] }),
    );
  });

  it.each([
    ['sales are closed', () => (mockSalesOpen = false), {}],
    [
      'the tier is no longer for sale',
      // Still priced: preflight requires every tier's price id.
      () => (process.env.STRIPE_PRICE_OXFORD_NETWORK = 'price_net'),
      { houseType: 'oxford', tier: 'network' },
    ],
    ['tier billing is off', () => delete process.env.TIER_BILLING_ENABLED, {}],
  ])('records it even when %s: the operator has paid', async (_label, close, meta) => {
    storeOperator(meta);
    close();
    await reactivate();

    expect(mockStored.subscriptionMetadata.subscriptionId).toBe('sub_new');
  });

  it('with nothing to adopt, still refuses while sales are closed, and frees the lock', async () => {
    storeOperator();
    mockFindLives.mockResolvedValue([]);
    mockSalesOpen = false;

    await expect(reactivate()).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mockReactivate).not.toHaveBeenCalled();
    expect(mockStored.subscriptionMetadata.checkoutStartedAt).toBe(0);
  });

  // The gates run under the lock, so each refusal must free it.
  it.each<[string, () => unknown, object]>([
    [
      'the tier is no longer for sale',
      () => (process.env.STRIPE_PRICE_OXFORD_NETWORK = 'price_net'),
      { houseType: 'oxford', tier: 'network' },
    ],
    ['tier billing is off', () => delete process.env.TIER_BILLING_ENABLED, {}],
  ])('with nothing to adopt, refuses when %s, and frees the lock', async (_label, close, meta) => {
    storeOperator(meta);
    mockFindLives.mockResolvedValue([]);
    close();

    await expect(reactivate()).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mockReactivate).not.toHaveBeenCalled();
    expect(mockStored.subscriptionMetadata.checkoutStartedAt).toBe(0);
  });
});

// The record and the house statuses are written together: either fails, neither
// is written, so the next Reactivate adopts the replacement and finishes both.
describe('the record and the house statuses', () => {
  it('are written in one transaction with the replacement', async () => {
    storeOperator();
    await reactivate();

    expect(housesStatus()).toHaveBeenCalledWith('op', 'active', expect.anything());
  });

  it.each([
    ['the house statuses', () => housesStatus().mockRejectedValueOnce(new Error('ABORTED'))],
    ['the record', () => (mockFailRecordWrite = true)],
  ])('when %s fail, leave the record as it was and the lock held', async (_what, fail) => {
    storeOperator();
    fail();

    await expect(reactivate()).rejects.toMatchObject({ code: 'internal' });
    expect(mockStored.subscriptionMetadata.subscriptionId).toBe('sub_old');
    expect(mockStored.subscriptionMetadata.checkoutStartedAt as number).toBeGreaterThan(0);
  });
});
