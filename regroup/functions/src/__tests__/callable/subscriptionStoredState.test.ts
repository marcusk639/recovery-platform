// The subscription callables act on the record as stored and the subscription
// as Stripe has it, not on the record read at the start of the call:
// - the caps use the stored plan, so a downgrade meanwhile applies;
// - the houses callable returns the record as stored;
// - cancel and resume write the status Stripe returns, not a hard-coded one,
//   which hid a past_due plan set to cancel, or a trial resumed.
// (Writing only the fields they change: subscriptionMetadataWrites.test.ts.)

class HttpsError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
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
const mockCancel = jest.fn();
const mockUncancel = jest.fn();
jest.mock('../../api/stripe', () => ({
  cancelSubscription: (...a: unknown[]) => mockCancel(...a),
  uncancelSubscription: (...a: unknown[]) => mockUncancel(...a),
}));

// One stored user doc. getUser returns the copy read before the record moved
// on; transactions read the stored doc and apply dotted keys as Firestore does.
let mockStored: Record<string, any>;
let mockStaleRead: Record<string, any>;
const mockApplyUpdate = (data: Record<string, unknown>) => {
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

import {
  cancelUserSubscription,
  reactivateOperatorSubscription,
  updateSubscriptionGuests,
  updateSubscriptionHouses,
} from '../../callable/subscriptions';

const call = (fn: unknown, data: object) =>
  (fn as Function)({ auth: { uid: 'op', token: { email: 'op@test.com' } }, data });

const PLAN = {
  subscriptionId: 'sub_1',
  customerId: 'cus_1',
  houseType: 'traditional',
  tier: 'professional',
  maxResidents: 20,
  maxProperties: 3,
};
const OPERATOR = { id: 'op', email: 'op@test.com' };
// What the client sends; never trusted, the callables read the stored record.
const CLIENT_USER = {
  ...OPERATOR,
  subscriptionMetadata: { status: 'active', subscriptionId: 'sub_1', customerId: 'cus_1' },
};

/** The read the writer starts from, then what the record became meanwhile. */
const recordMovedOn = (read: object, now: object) => {
  mockStaleRead = { ...OPERATOR, subscriptionMetadata: read };
  mockStored = { ...OPERATOR, subscriptionMetadata: now };
};
const cancel = () => call(cancelUserSubscription, { user: CLIENT_USER, subscriptionId: 'sub_1' });
const resume = () => call(reactivateOperatorSubscription, { user: CLIENT_USER });

beforeEach(() => {
  jest.clearAllMocks();
  mockCancel.mockResolvedValue({ id: 'sub_1', status: 'active', cancel_at_period_end: true });
  mockUncancel.mockResolvedValue({ id: 'sub_1', status: 'active', cancel_at_period_end: false });
});

describe('a plan set to cancel', () => {
  it('writes the status Stripe has: a past_due plan stays past_due', async () => {
    recordMovedOn(
      { ...PLAN, status: 'past_due', houses: {} },
      { ...PLAN, status: 'past_due', houses: {} },
    );
    mockCancel.mockResolvedValue({ id: 'sub_1', status: 'past_due', cancel_at_period_end: true });
    await cancel();

    expect(mockStored.subscriptionMetadata.status).toBe('past_due');
  });
});

describe('a plan set to cancel, resumed', () => {
  it('writes the status Stripe has: a trial resumed stays trialing', async () => {
    recordMovedOn(
      { ...PLAN, status: 'cancelling', houses: {} },
      { ...PLAN, status: 'cancelling', houses: {} },
    );
    mockUncancel.mockResolvedValue({
      id: 'sub_1',
      status: 'trialing',
      cancel_at_period_end: false,
    });
    await resume();

    expect(mockStored.subscriptionMetadata.status).toBe('trialing');
  });
});

describe('the caps and the result, from the stored plan', () => {
  it('adding a resident checks the cap with the stored plan, after a downgrade meanwhile', async () => {
    recordMovedOn(
      { ...PLAN, maxResidents: 20, houses: { h1: { numberOfGuests: 2 } } },
      { ...PLAN, tier: 'starter', maxResidents: 2, houses: { h1: { numberOfGuests: 2 } } },
    );
    await expect(
      call(updateSubscriptionGuests, { ownerUserId: 'op', houseIds: ['h1'], action: 'add' }),
    ).rejects.toMatchObject({ code: 'failed-precondition' });

    expect(mockStored.subscriptionMetadata.houses).toEqual({ h1: { numberOfGuests: 2 } });
  });

  it('adding a house returns the record as stored, not the earlier read', async () => {
    recordMovedOn(
      { ...PLAN, status: 'trialing', houses: {} },
      { ...PLAN, status: 'active', houses: {} },
    );
    const result = await call(updateSubscriptionHouses, {
      ownerUserId: 'op',
      action: 'add',
      houseIds: ['h1'],
    });

    expect(result.subscriptionMetadata).toMatchObject({
      status: 'active',
      houses: { h1: { numberOfGuests: 0 } },
      lastUpdatedAt: expect.any(String),
    });
  });
});
