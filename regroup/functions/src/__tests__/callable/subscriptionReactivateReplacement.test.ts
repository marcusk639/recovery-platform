// Reactivate's replacement replaces the operator's whole plan, built from the
// record it read before Stripe created the subscription. Written as is, it put
// back that read's houses map: a resident counted while Stripe worked (an
// invitation redeemed) was lost, and a house deleted meanwhile came back. The
// replacement is written in a transaction that keeps the stored houses map.

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

// As the real one: the replacement carries the houses map of the record it was given.
const mockReactivate = jest.fn(async (_customer: string, meta: { houses?: object }) => ({
  subscriptionId: 'sub_new',
  customerId: 'cus_1',
  status: 'active',
  houseType: 'traditional',
  tier: 'professional',
  houses: meta.houses ?? {},
}));
const mockFindLive = jest.fn();
const mockIsUnrecordedReplacement = jest.fn();
jest.mock('../../api/stripe', () => ({
  reactivateSubscription: (customer: string, meta: { houses?: object }) =>
    mockReactivate(customer, meta),
  findLiveSubscriptionForUser: (...a: unknown[]) => mockFindLive(...a),
  // Reactivate looks for every live unrecorded subscription.
  findLiveSubscriptionsForUser: async (...a: unknown[]) => {
    const live = await mockFindLive(...a);
    return live ? [live] : [];
  },
  failedBeforeSubscription: () => false,
  // Which live subscription is a replacement is tested in api/reactivate.test.ts.
  isUnrecordedReplacement: (...a: unknown[]) => mockIsUnrecordedReplacement(...a),
  replacementMetadataFrom: (sub: { id: string; status: string }) => ({
    subscriptionId: sub.id,
    customerId: 'cus_1',
    status: sub.status,
    houseType: 'traditional',
    tier: 'professional',
    houses: {},
  }),
}));

// One stored user doc; getUser returns the copy read before it moved on.
let mockStored: Record<string, any>;
let mockStaleRead: Record<string, any>;
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
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        get: async () => ({ exists: true, data: () => mockStored }),
        update: (_ref: unknown, data: Record<string, unknown>) => mockApplyUpdate(data),
      }),
  },
  getUser: jest.fn(async () => JSON.parse(JSON.stringify(mockStaleRead))),
  updateUser: jest.fn(async (_id: string, data: Record<string, unknown>) => mockApplyUpdate(data)),
  getHouse: jest.fn(),
  upsertSubscriptionDoc: jest.fn(),
}));
jest.mock('../../util/houseRoles', () => ({ isPrimaryOwner: async () => true }));
jest.mock('../../util/email', () => ({ sendEmail: jest.fn(), regroupEmail: 'x@y.z' }));
jest.mock('../../util/operatorHouses', () => ({ setOperatorHousesStatus: jest.fn() }));
jest.mock('../../util/salesSwitch', () => ({ isSalesOpen: async () => true }));
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
};
const reactivate = () =>
  (reactivateOperatorSubscription as unknown as Function)({
    auth: { uid: 'op', token: { email: 'op@test.com' } },
    data: { user: { id: 'op', subscriptionMetadata: { ...CANCELED } } },
  });

const storeOperator = (houses: object = {}) => {
  mockStaleRead = { id: 'op', email: 'op@test.com', subscriptionMetadata: { ...CANCELED, houses } };
  mockStored = JSON.parse(JSON.stringify(mockStaleRead));
};
const upsertSubscriptionDoc = () =>
  jest.requireMock<{ upsertSubscriptionDoc: jest.Mock }>('../../api/firestore')
    .upsertSubscriptionDoc;
const setOperatorHousesStatus = () =>
  jest.requireMock<{ setOperatorHousesStatus: jest.Mock }>('../../util/operatorHouses')
    .setOperatorHousesStatus;
const loggedError = () =>
  jest.requireMock<{ logger: { error: jest.Mock } }>('firebase-functions').logger.error;
const UNFINISHED = /plan restarted, but we couldn't finish setting up your account/i;

beforeEach(() => {
  jest.clearAllMocks();
  mockFailRecordWrite = false;
  mockFindLive.mockResolvedValue(null);
  mockIsUnrecordedReplacement.mockReturnValue(false);
  process.env.TIER_BILLING_ENABLED = 'true';
  process.env.STRIPE_PRICE_TRAD_PROFESSIONAL = 'price_pro';
});
afterEach(() => {
  delete process.env.TIER_BILLING_ENABLED;
  delete process.env.STRIPE_PRICE_TRAD_PROFESSIONAL;
});

describe("Reactivate's replacement", () => {
  it('keeps a resident counted, and a house removed, while Stripe created it', async () => {
    mockStaleRead = {
      id: 'op',
      email: 'op@test.com',
      subscriptionMetadata: {
        ...CANCELED,
        houses: { h1: { numberOfGuests: 1 }, h2: { numberOfGuests: 0 } },
      },
    };
    mockStored = {
      id: 'op',
      email: 'op@test.com',
      subscriptionMetadata: { ...CANCELED, houses: { h1: { numberOfGuests: 2 } } },
    };

    const result = await reactivate();

    expect(mockStored.subscriptionMetadata).toMatchObject({
      subscriptionId: 'sub_new',
      status: 'active',
      houses: { h1: { numberOfGuests: 2 } },
    });
    // The new record replaces the lock Reactivate took.
    expect(mockStored.subscriptionMetadata.checkoutStartedAt).toBeUndefined();
    expect(result.subscriptionMetadata.houses).toEqual({ h1: { numberOfGuests: 2 } });
  });
});

// The replacement has no trial: Stripe has charged by the time these writes run.
// The webhooks find a subscription only through its subscriptions doc, so it
// is seeded first: if a later write fails, the next event still finds it.
describe('after Stripe created the replacement', () => {
  it('seeds the subscriptions doc before the record names the new subscription', async () => {
    storeOperator();
    let recordAtSeed: unknown;
    upsertSubscriptionDoc().mockImplementation(async () => {
      recordAtSeed = mockStored.subscriptionMetadata.subscriptionId;
    });
    await reactivate();

    expect(upsertSubscriptionDoc()).toHaveBeenCalledWith(
      expect.objectContaining({ stripeSubscriptionId: 'sub_new', userId: 'op' }),
    );
    expect(recordAtSeed).toBe('sub_old');
  });

  it.each([
    [
      'the subscriptions doc',
      () => upsertSubscriptionDoc().mockRejectedValueOnce(new Error('ABORTED')),
    ],
    ['the record', () => (mockFailRecordWrite = true)],
    [
      'the house statuses',
      () => setOperatorHousesStatus().mockRejectedValueOnce(new Error('ABORTED')),
    ],
  ])(
    'when %s fails, logs the new ids for support and says the plan restarted',
    async (_what, fail) => {
      storeOperator();
      fail();
      await expect(reactivate()).rejects.toMatchObject({ code: 'internal', message: UNFINISHED });

      expect(loggedError()).toHaveBeenCalledWith(
        expect.stringContaining('by hand'),
        expect.objectContaining({ userId: 'op', subscriptionId: 'sub_new', customerId: 'cus_1' }),
      );
    },
  );
});

// Seeding the subscriptions doc first doesn't let the webhooks write the record
// or the houses for a subscription the record doesn't name. So a retry finishes
// the job: the replacement an earlier attempt left live is recorded instead of
// refused, and a plan already live has its house statuses set again.
describe('a retry after the replacement was left unfinished', () => {
  const LEFT_LIVE = { id: 'sub_new', status: 'active' };

  it('records the replacement left live in Stripe, creating no other', async () => {
    storeOperator({ h1: { numberOfGuests: 1 } });
    mockFindLive.mockResolvedValue(LEFT_LIVE);
    mockIsUnrecordedReplacement.mockReturnValue(true);

    await reactivate();

    expect(mockReactivate).not.toHaveBeenCalled();
    expect(mockIsUnrecordedReplacement).toHaveBeenCalledWith(
      LEFT_LIVE,
      expect.objectContaining({ customerId: 'cus_1', tier: 'professional' }),
    );
    expect(mockStored.subscriptionMetadata).toMatchObject({
      subscriptionId: 'sub_new',
      status: 'active',
      houses: { h1: { numberOfGuests: 1 } },
    });
    expect(upsertSubscriptionDoc()).toHaveBeenCalledWith(
      expect.objectContaining({ stripeSubscriptionId: 'sub_new' }),
    );
    // In the record's own transaction (subscriptionReactivateAdoption.test.ts).
    expect(setOperatorHousesStatus()).toHaveBeenCalledWith('op', 'active', expect.anything());
  });

  it('still refuses any other live subscription the record does not show', async () => {
    storeOperator();
    mockFindLive.mockResolvedValue({ id: 'sub_other', status: 'active' });

    await expect(reactivate()).rejects.toMatchObject({
      code: 'failed-precondition',
      details: { reason: 'unrecorded-subscription' },
    });
    expect(mockReactivate).not.toHaveBeenCalled();
    expect(mockStored.subscriptionMetadata.subscriptionId).toBe('sub_old');
  });

  // The record and house statuses are written together, so a live record's
  // houses were written with it; a Reactivate then writes nothing (a write
  // from this read could undo a cancellation that lands meanwhile).
  it('leaves the house statuses of a plan already live alone', async () => {
    mockStaleRead = {
      id: 'op',
      email: 'op@test.com',
      subscriptionMetadata: { ...CANCELED, subscriptionId: 'sub_new', status: 'active' },
    };
    // The plan's cancellation lands after Reactivate read it as live.
    mockStored = JSON.parse(JSON.stringify(mockStaleRead));
    mockStored.subscriptionMetadata.status = 'canceled';

    await reactivate();

    expect(mockReactivate).not.toHaveBeenCalled();
    expect(setOperatorHousesStatus()).not.toHaveBeenCalled();
    expect(mockStored.subscriptionMetadata.status).toBe('canceled');
  });
});
