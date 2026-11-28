// The field-only writers of users/{uid}.subscriptionMetadata, against the
// in-memory Firestore, whose transactions run again when a document they read
// changed before the commit, as Firestore's do. mem.beforeCommit lands a
// competing write between a writer's read and its commit.

jest.mock('../../api/firestore', () => {
  const { apiFirestore, mem } = require('../helpers/memFirestore');
  return {
    ...apiFirestore,
    // Stand-in for the real deep strip (the real module needs an initialized app).
    stripUndefinedDeep: (v: unknown) => JSON.parse(JSON.stringify(v)),
    getUser: async (id: string) => mem.get(`users/${id}`),
    getHouse: async (id: string) => mem.get(`houses/${id}`),
  };
});
jest.mock('firebase-functions', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));
// util/operatorHouses reads houses through firebase-admin: the same store.
jest.mock('firebase-admin', () => ({
  firestore: Object.assign(() => require('../helpers/memFirestore').memDb, {
    FieldValue: require('../helpers/memFirestore').fieldValue,
  }),
}));

import { mem, memDb } from '../helpers/memFirestore';
import {
  changeSubscriptionHouses,
  setSubscriptionStatus,
  writeReplacementSubscription,
  type SubscriptionHouses,
} from '../../util/operatorSubscriptionWrite';
import { recordResidentAccepted } from '../../util/residentCapacity';

const PLAN = { subscriptionId: 'sub_1', status: 'active', tier: 'professional', maxResidents: 3 };
const seed = (meta: object, extra: object = {}) =>
  mem.seed('users/op', { id: 'op', subscriptionMetadata: meta, ...extra });
const stored = () => mem.get('users/op')!.subscriptionMetadata as Record<string, any>;
const addOne = (h: SubscriptionHouses) => ({
  ...h,
  h1: { numberOfGuests: h.h1.numberOfGuests + 1 },
});
/** Runs `race` once, between the writer's read and its commit. */
const raceOnce = (race: () => Promise<unknown>) => {
  let raced = false;
  mem.beforeCommit = async () => {
    if (raced) return;
    raced = true;
    await race();
  };
};

beforeEach(() => mem.reset());

describe('changeSubscriptionHouses', () => {
  it('lands both of two racing increments, and leaves the checkout lock', async () => {
    seed({ ...PLAN, checkoutStartedAt: 42, houses: { h1: { numberOfGuests: 1 } } });
    raceOnce(() => changeSubscriptionHouses('op', addOne));
    await changeSubscriptionHouses('op', addOne);

    expect(stored().houses).toEqual({ h1: { numberOfGuests: 3 } });
    expect(stored().checkoutStartedAt).toBe(42);
  });

  it('holds the cap when a racing add takes the last slot', async () => {
    seed({ ...PLAN, maxResidents: 3, houses: { h1: { numberOfGuests: 2 } } });
    const addUnderCap = (h: SubscriptionHouses, meta: Record<string, any>) => {
      if (h.h1.numberOfGuests + 1 > meta.maxResidents) throw new Error('over the cap');
      return addOne(h);
    };
    raceOnce(() => changeSubscriptionHouses('op', addUnderCap));

    await expect(changeSubscriptionHouses('op', addUnderCap)).rejects.toThrow('over the cap');
    expect(stored().houses).toEqual({ h1: { numberOfGuests: 3 } });
  });

  it('writes only the houses map and lastUpdatedAt, returning the metadata as written', async () => {
    seed({ ...PLAN, houses: { h1: { numberOfGuests: 1 } } });
    const written = await changeSubscriptionHouses('op', addOne);

    expect(stored()).toEqual({
      ...PLAN,
      houses: { h1: { numberOfGuests: 2 } },
      lastUpdatedAt: expect.any(String),
    });
    expect(written).toEqual(stored());
  });
});

describe('setSubscriptionStatus', () => {
  it('writes only the status, returning the record as stored', async () => {
    seed({ ...PLAN, checkoutStartedAt: 42, houses: { h1: { numberOfGuests: 1 } } });
    const result = await setSubscriptionStatus('op', 'sub_1', 'cancelling');

    expect(result.written).toBe(true);
    expect(stored()).toEqual({
      ...PLAN,
      status: 'cancelling',
      checkoutStartedAt: 42,
      houses: { h1: { numberOfGuests: 1 } },
      lastUpdatedAt: expect.any(String),
    });
    expect(result.subscriptionMetadata).toEqual(stored());
  });

  it('writes nothing to a record that now names another subscription', async () => {
    seed({ ...PLAN, subscriptionId: 'sub_2', status: 'trialing' });
    const before = mem.get('users/op');
    const result = await setSubscriptionStatus('op', 'sub_1', 'cancelling');

    expect(result).toEqual({ written: false, subscriptionMetadata: before!.subscriptionMetadata });
    expect(mem.get('users/op')).toEqual(before);
  });
});

describe('writeReplacementSubscription', () => {
  // Written apart, a failure between them left a record naming the replacement
  // with its houses still canceled, which nothing would repair.
  it("writes the houses' statuses in the record's own transaction", async () => {
    seed({ ...PLAN, status: 'canceled', houses: {} });
    mem.seed('houses/h1', { id: 'h1', ownerId: 'op', subscriptionStatus: 'canceled' });
    await writeReplacementSubscription('op', { subscriptionId: 'sub_new', status: 'active' });

    expect(stored()).toMatchObject({ subscriptionId: 'sub_new', status: 'active' });
    expect(mem.get('houses/h1')).toMatchObject({ subscriptionStatus: 'active' });
  });

  it('writes neither the record nor the houses when the commit fails', async () => {
    seed({ ...PLAN, status: 'canceled', houses: {} });
    mem.seed('houses/h1', { id: 'h1', ownerId: 'op', subscriptionStatus: 'canceled' });
    mem.beforeCommit = () => {
      throw new Error('UNAVAILABLE');
    };

    await expect(
      writeReplacementSubscription('op', { subscriptionId: 'sub_new', status: 'active' }),
    ).rejects.toThrow('UNAVAILABLE');
    expect(stored()).toMatchObject({ subscriptionId: 'sub_1', status: 'canceled' });
    expect(mem.get('houses/h1')).toMatchObject({ subscriptionStatus: 'canceled' });
  });

  // The failing-commit test above can't tell these apart: a batch of the houses'
  // own would hit the same failing hook. Only the transaction may write them.
  it("writes the houses through the record's transaction, not a batch of their own", async () => {
    seed({ ...PLAN, status: 'canceled', houses: {} });
    mem.seed('houses/h1', { id: 'h1', ownerId: 'op', subscriptionStatus: 'canceled' });
    const batch = jest.spyOn(memDb, 'batch');
    try {
      await writeReplacementSubscription('op', { subscriptionId: 'sub_new', status: 'active' });
      expect(batch).not.toHaveBeenCalled();
      expect(mem.get('houses/h1')).toMatchObject({ subscriptionStatus: 'active' });
    } finally {
      batch.mockRestore();
    }
  });

  it('keeps the stored houses map, drops the lock, and leaves potentialSuperAdmin alone', async () => {
    seed(
      { ...PLAN, status: 'canceled', checkoutStartedAt: 42, houses: { h1: { numberOfGuests: 2 } } },
      { potentialSuperAdmin: false },
    );
    raceOnce(() => changeSubscriptionHouses('op', addOne));
    await writeReplacementSubscription('op', {
      subscriptionId: 'sub_new',
      status: 'active',
      houses: { stale: { numberOfGuests: 9 } },
      maxResidents: undefined,
    });

    expect(stored()).toEqual({
      subscriptionId: 'sub_new',
      status: 'active',
      houses: { h1: { numberOfGuests: 3 } },
    });
    expect(mem.get('users/op')!.potentialSuperAdmin).toBe(false);
  });
});

// recordResidentAccepted, through changeSubscriptionHouses: a resident accepted
// by invitation is counted on the stored map.
describe('recordResidentAccepted', () => {
  const TIER = { ...PLAN, houseType: 'traditional' };

  it('counts alongside a racing increment', async () => {
    seed({ ...TIER, houses: { h1: { numberOfGuests: 1 } } });
    mem.seed('houses/h1', { id: 'h1' });
    raceOnce(() => changeSubscriptionHouses('op', addOne));
    await recordResidentAccepted('op', 'h1');

    expect(stored().houses).toEqual({ h1: { numberOfGuests: 3 } });
  });

  // A late redeem for a deleted house must not bring back the slot
  // onHouseDeleted freed: the operator would be over the property cap with a
  // phantom house. (A house that exists but isn't on the plan is counted.)
  it("doesn't bring back a house deleted since the invitation", async () => {
    seed({ ...TIER, houses: { h2: { numberOfGuests: 0 } } });
    await recordResidentAccepted('op', 'h1');

    expect(stored().houses).toEqual({ h2: { numberOfGuests: 0 } });
  });

  // onHouseDeleted can free the slot after the house was found but before the
  // count commits. The transaction runs again on the changed map, and must see
  // the house gone rather than add it back as a house missing from the plan.
  it("doesn't bring back a house deleted while the count was being written", async () => {
    seed({ ...TIER, houses: { h1: { numberOfGuests: 1 } } });
    mem.seed('houses/h1', { id: 'h1' });
    raceOnce(async () => {
      await memDb.collection('houses').doc('h1').delete();
      await changeSubscriptionHouses('op', (h) => {
        const rest = { ...h };
        delete rest.h1;
        return rest;
      });
    });
    await recordResidentAccepted('op', 'h1');

    expect(stored().houses).toEqual({});
  });
});
