// Writers of one part of subscriptionMetadata write only what they change, in a
// transaction. Writing back a whole copy read earlier put back what changed in
// between: the checkout lock erased (a checkout under way refused), or houses
// createHouses had just added dropped (freed property-cap slots).

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
jest.mock('../../api/stripe', () => ({
  cancelSubscription: jest.fn(async () => ({ status: 'active', cancel_at_period_end: true })),
  uncancelSubscription: jest.fn(async () => ({ status: 'active', cancel_at_period_end: false })),
}));

// One stored user doc. getUser returns the copy read before the record moved
// on; transactions read the stored doc. Updates apply dotted keys as Firestore
// does, so a write of the whole map replaces it.
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
  getHouse: jest.fn(async () => undefined),
  getInvitationsForHouse: jest.fn(async () => []),
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
import { recordResidentAccepted } from '../../util/residentCapacity';

const call = (fn: unknown, data: object) =>
  (fn as Function)({ auth: { uid: 'op', token: { email: 'op@test.com' } }, data });

const TIER_PLAN = {
  subscriptionId: 'sub_1',
  customerId: 'cus_1',
  status: 'trialing',
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

beforeEach(() => jest.clearAllMocks());

describe('a resident added or removed', () => {
  it('leaves a checkout lock taken after the read', async () => {
    const houses = { h1: { numberOfGuests: 2 } };
    recordMovedOn(
      { ...TIER_PLAN, houses },
      { ...TIER_PLAN, houses, checkoutStartedAt: 1_700_000_000_000 },
    );
    await call(updateSubscriptionGuests, { ownerUserId: 'op', houseIds: ['h1'], action: 'add' });

    expect(mockStored.subscriptionMetadata.checkoutStartedAt).toBe(1_700_000_000_000);
    expect(mockStored.subscriptionMetadata.houses).toEqual({ h1: { numberOfGuests: 3 } });
  });

  it('counts from the stored map, and keeps a house added meanwhile', async () => {
    recordMovedOn(
      { ...TIER_PLAN, houses: { h1: { numberOfGuests: 2 } } },
      { ...TIER_PLAN, houses: { h1: { numberOfGuests: 4 }, h2: { numberOfGuests: 0 } } },
    );
    await call(updateSubscriptionGuests, { ownerUserId: 'op', houseIds: ['h1'], action: 'remove' });

    expect(mockStored.subscriptionMetadata.houses).toEqual({
      h1: { numberOfGuests: 3 },
      h2: { numberOfGuests: 0 },
    });
  });

  it('refuses a house removed meanwhile, and leaves it removed', async () => {
    recordMovedOn(
      { ...TIER_PLAN, houses: { h1: { numberOfGuests: 2 } } },
      { ...TIER_PLAN, houses: {} },
    );
    await expect(
      call(updateSubscriptionGuests, { ownerUserId: 'op', houseIds: ['h1'], action: 'add' }),
    ).rejects.toMatchObject({ code: 'failed-precondition' });

    expect(mockStored.subscriptionMetadata.houses).toEqual({});
  });

  // Two adds at one below the cap both passed a check on their own reads.
  it('checks the resident cap against the stored count', async () => {
    recordMovedOn(
      { ...TIER_PLAN, maxResidents: 3, houses: { h1: { numberOfGuests: 2 } } },
      { ...TIER_PLAN, maxResidents: 3, houses: { h1: { numberOfGuests: 3 } } },
    );
    await expect(
      call(updateSubscriptionGuests, { ownerUserId: 'op', houseIds: ['h1'], action: 'add' }),
    ).rejects.toMatchObject({ code: 'failed-precondition' });

    expect(mockStored.subscriptionMetadata.houses).toEqual({ h1: { numberOfGuests: 3 } });
  });

  // The invitation check admits a house missing from the owner's map (counting
  // its pending invitations), so the accepted resident is counted there too,
  // else every redeem would free a slot and the cap would never hold.
  it('on accepting an invitation, counts a house missing from the map, and logs it', async () => {
    recordMovedOn({ ...TIER_PLAN, houses: {} }, { ...TIER_PLAN, houses: {} });
    await recordResidentAccepted('op', 'h1');

    expect(mockStored.subscriptionMetadata.houses).toEqual({ h1: { numberOfGuests: 1 } });
    const { logger } = jest.requireMock<{ logger: { warn: jest.Mock } }>('firebase-functions');
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('not on the plan'),
      expect.objectContaining({ ownerId: 'op', houseId: 'h1' }),
    );
  });

  it('on accepting an invitation, leaves the lock and counts from the stored map', async () => {
    recordMovedOn(
      { ...TIER_PLAN, status: 'canceled', houses: { h1: { numberOfGuests: 1 } } },
      {
        ...TIER_PLAN,
        status: 'canceled',
        houses: { h1: { numberOfGuests: 5 } },
        checkoutStartedAt: 42,
      },
    );
    await recordResidentAccepted('op', 'h1');

    expect(mockStored.subscriptionMetadata.checkoutStartedAt).toBe(42);
    expect(mockStored.subscriptionMetadata.houses).toEqual({ h1: { numberOfGuests: 6 } });
  });
});

describe('a house added to or removed from the plan', () => {
  it('keeps a house createHouses added meanwhile', async () => {
    recordMovedOn(
      { ...TIER_PLAN, houses: { h1: { numberOfGuests: 0 } } },
      { ...TIER_PLAN, houses: { h1: { numberOfGuests: 0 }, h2: { numberOfGuests: 0 } } },
    );
    await call(updateSubscriptionHouses, { ownerUserId: 'op', action: 'add', houseIds: ['h3'] });

    expect(Object.keys(mockStored.subscriptionMetadata.houses).sort()).toEqual(['h1', 'h2', 'h3']);
  });

  it('checks the property cap against the stored map, not the stale read', async () => {
    recordMovedOn(
      { ...TIER_PLAN, houses: { h1: { numberOfGuests: 0 } } },
      {
        ...TIER_PLAN,
        houses: { h1: { numberOfGuests: 0 }, h2: { numberOfGuests: 0 }, h3: { numberOfGuests: 0 } },
      },
    );
    await expect(
      call(updateSubscriptionHouses, { ownerUserId: 'op', action: 'add', houseIds: ['h4'] }),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(Object.keys(mockStored.subscriptionMetadata.houses)).toHaveLength(3);
  });

  it('checks the property cap with the stored plan, after a downgrade meanwhile', async () => {
    recordMovedOn(
      { ...TIER_PLAN, houses: { h1: { numberOfGuests: 0 } } },
      { ...TIER_PLAN, tier: 'starter', maxProperties: 1, houses: { h1: { numberOfGuests: 0 } } },
    );
    await expect(
      call(updateSubscriptionHouses, { ownerUserId: 'op', action: 'add', houseIds: ['h2'] }),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(Object.keys(mockStored.subscriptionMetadata.houses)).toEqual(['h1']);
  });

  it('removes only the deleted house, leaving the lock', async () => {
    recordMovedOn(
      { ...TIER_PLAN, houses: { h1: { numberOfGuests: 0 } } },
      {
        ...TIER_PLAN,
        houses: { h1: { numberOfGuests: 0 }, h2: { numberOfGuests: 0 } },
        checkoutStartedAt: 42,
      },
    );
    await call(updateSubscriptionHouses, { ownerUserId: 'op', action: 'remove', houseIds: ['h1'] });

    expect(mockStored.subscriptionMetadata.houses).toEqual({ h2: { numberOfGuests: 0 } });
    expect(mockStored.subscriptionMetadata.checkoutStartedAt).toBe(42);
  });
});

describe('a plan set to cancel, or resumed', () => {
  it('cancelling writes only the status, and returns the record as stored', async () => {
    recordMovedOn(
      { ...TIER_PLAN, status: 'active', houses: {} },
      { ...TIER_PLAN, status: 'active', houses: { h1: { numberOfGuests: 1 } } },
    );
    const result = await call(cancelUserSubscription, {
      user: CLIENT_USER,
      subscriptionId: 'sub_1',
    });

    expect(mockStored.subscriptionMetadata).toMatchObject({
      status: 'cancelling',
      houses: { h1: { numberOfGuests: 1 } },
    });
    expect(result.subscriptionMetadata).toMatchObject({
      subscriptionId: 'sub_1',
      tier: 'professional',
      status: 'cancelling',
      houses: { h1: { numberOfGuests: 1 } },
      lastUpdatedAt: expect.any(String),
    });
  });
  it('resuming writes only the status, and returns the record as stored', async () => {
    recordMovedOn(
      { ...TIER_PLAN, status: 'cancelling', houses: {} },
      { ...TIER_PLAN, status: 'cancelling', houses: { h1: { numberOfGuests: 1 } } },
    );
    const result = await call(reactivateOperatorSubscription, { user: CLIENT_USER });

    expect(mockStored.subscriptionMetadata).toMatchObject({
      status: 'active',
      houses: { h1: { numberOfGuests: 1 } },
    });
    expect(result.subscriptionMetadata).toMatchObject({
      subscriptionId: 'sub_1',
      status: 'active',
      houses: { h1: { numberOfGuests: 1 } },
    });
  });
  it("doesn't set the status on a record that now names another subscription", async () => {
    recordMovedOn(
      { ...TIER_PLAN, status: 'active', houses: {} },
      { ...TIER_PLAN, subscriptionId: 'sub_2', status: 'trialing', houses: {} },
    );
    const result = await call(cancelUserSubscription, {
      user: CLIENT_USER,
      subscriptionId: 'sub_1',
    });

    expect(mockStored.subscriptionMetadata).toMatchObject({
      subscriptionId: 'sub_2',
      status: 'trialing',
    });
    // The record as stored, not a cancel that wasn't written.
    expect(result.subscriptionMetadata).toMatchObject({
      subscriptionId: 'sub_2',
      status: 'trialing',
    });
  });
});
