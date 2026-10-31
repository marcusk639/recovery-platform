/**
 * house.tsx reads and single-document writes against the normalized Firebase
 * operation log (batches and callables: house-batch.oplog.test.ts).
 *
 * Characterization for the React Native 0.88 upgrade (plan Task 10 Step 1).
 * This file stays byte-identical through the Task 10 migration (group 10c): a
 * mapping mistake in the rewrite fails here instead of being copied into an
 * edited expectation. Assertions are on outcomes and log entries only, never
 * on mock call chains or snapshot shapes.
 */
jest.mock('../../../firebase-setup', () => require('../../../__mocks__/firebase-modular/setup'));
jest.mock('@react-native-firebase/firestore', () => {
  const mock = require('../../../__mocks__/firebase-modular/firestore');
  // updateHouseAdmins reads FieldValue through the namespaced `firebase` export,
  // which the shared mock does not carry: expose the mock's own statics there.
  return { ...mock, firebase: { firestore: mock.default } };
});
jest.mock('@react-native-firebase/functions', () =>
  require('../../../__mocks__/firebase-modular/functions'),
);
jest.mock('../../../google/timezone', () => ({ getTimezone: jest.fn(async () => 'UTC') }));
jest.mock('../../util/logging', () => ({ logException: jest.fn() }));

import { getOpLog, readDoc, resetOpLog, seedDoc } from '../../../__mocks__/firebase-modular/log';
import {
  createHouse,
  createHouseId,
  finalizeHouseSetup,
  getHouse,
  getHouses,
  getNearbyHouses,
  searchForHouses,
  updateHouse,
  updateHouseAdmins,
  updateHouseAwaitingVerification,
} from '../house';
import { House } from '../../entities/House';
import { HouseSearch } from '../../entities/HouseSearch';
import { HOUSE_CODE_INVALID } from '../../constants/errors';
import { geohash, getGeohashRange } from '../../util/geolocation';

const ISO = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

beforeEach(() => {
  resetOpLog();
});

describe('getHouse / createHouse / createHouseId', () => {
  it('reads houses/{id}', async () => {
    seedDoc('houses/h1', { id: 'h1', name: 'Oak' });

    expect(await getHouse('h1')).toEqual({ id: 'h1', name: 'Oak' });
    expect(getOpLog()).toEqual([{ op: 'get', path: 'houses/h1' }]);
  });

  it('sets houses/{auto id} for a house without an id', async () => {
    const result = await createHouse({ name: 'Oak' } as House);

    expect(result).toEqual({ name: 'Oak', id: 'auto-1' });
    expect(getOpLog()).toEqual([
      { op: 'set', path: 'houses/auto-1', data: { name: 'Oak', id: 'auto-1' } },
    ]);
  });

  it('mints a house id without touching the log', () => {
    expect(createHouseId()).toBe('auto-1');
    expect(getOpLog()).toEqual([]);
  });
});

describe('getHouses', () => {
  it('queries houses by one where clause and keys the result by id', async () => {
    seedDoc('houses/h1', { id: 'h1', ownerId: 'u1' });
    seedDoc('houses/h2', { id: 'h2', ownerId: 'u2' });

    expect(await getHouses('ownerId', '==', 'u1')).toEqual({ h1: { id: 'h1', ownerId: 'u1' } });
    expect(getOpLog()).toEqual([
      { op: 'getDocs', path: 'houses', constraints: [['where', 'ownerId', '==', 'u1']] },
    ]);
  });
});

describe('updateHouseAdmins', () => {
  it('updates adminIds with arrayUnion and pendingAdminInvites with an empty arrayRemove', async () => {
    seedDoc('houses/h1', { id: 'h1', adminIds: ['a0'], pendingAdminInvites: ['x'] });

    await updateHouseAdmins('h1', 'a1');

    expect(getOpLog()).toEqual([
      {
        op: 'update',
        path: 'houses/h1',
        data: {
          adminIds: { __fv: 'arrayUnion', items: ['a1'] },
          pendingAdminInvites: { __fv: 'arrayRemove', items: [] },
        },
      },
    ]);
    expect(readDoc('houses/h1')).toEqual({
      id: 'h1',
      adminIds: ['a0', 'a1'],
      pendingAdminInvites: ['x'],
    });
  });
});

describe('getNearbyHouses / searchForHouses', () => {
  const range = getGeohashRange(30, -90, 25);
  const constraints = [
    ['where', 'geohash', '>=', range.lower],
    ['where', 'geohash', '<=', range.upper],
  ];

  beforeEach(() => {
    seedDoc('houses/h1', { id: 'h1', geohash: geohash(30, -90), gender: 'female' });
    seedDoc('houses/h2', { id: 'h2', geohash: geohash(30.01, -90.01), gender: 'male' });
    seedDoc('houses/far', { id: 'far', geohash: geohash(45, 10), gender: 'female' });
  });

  it('queries houses between the geohash bounds and keys them by doc id', async () => {
    const houses = await getNearbyHouses(30, -90, 25);

    expect(Object.keys(houses).sort()).toEqual(['h1', 'h2']);
    expect(getOpLog()).toEqual([{ op: 'getDocs', path: 'houses', constraints }]);
  });

  it('searches 25 miles around the location and filters by gender', async () => {
    const search = { filters: { location: { lat: 30, lng: -90 }, gender: 'female' } };

    const result = await searchForHouses(search as unknown as HouseSearch);

    expect(result).toEqual([expect.objectContaining({ id: 'h1' })]);
    expect(getOpLog()).toEqual([{ op: 'getDocs', path: 'houses', constraints }]);
  });
});

describe('updateHouse', () => {
  it('fills the id and drops chores with an empty name or key, keyed by name', async () => {
    seedDoc('houses/h1', { id: 'h1' });
    const values = {
      chores: { k1: { name: 'Dishes' }, k2: { name: ' ' }, ' ': { name: 'Trash' } },
    } as unknown as Partial<House>;

    await updateHouse('h1', values);

    expect(getOpLog()).toEqual([
      {
        op: 'update',
        path: 'houses/h1',
        data: { chores: { Dishes: { name: 'Dishes' } }, id: 'h1' },
      },
    ]);
  });

  it('rejects for a missing house', async () => {
    await expect(updateHouse('missing', { name: 'Oak' })).rejects.toMatchObject({
      code: 'firestore/not-found',
    });
  });
});

describe('updateHouseAwaitingVerification', () => {
  it('finds the house by code and appends the request to awaitingVerification', async () => {
    seedDoc('houses/h1', { id: 'h1', code: 'C1' });
    const request = { firstName: 'F', lastName: 'L', userId: 'u1' };

    await updateHouseAwaitingVerification('C1', request);

    expect(getOpLog()).toEqual([
      { op: 'getDocs', path: 'houses', constraints: [['where', 'code', '==', 'C1']] },
      {
        op: 'update',
        path: 'houses/h1',
        data: { id: 'h1', code: 'C1', awaitingVerification: [request] },
      },
    ]);
  });

  it('throws HOUSE_CODE_INVALID when no house has the code, without writing', async () => {
    await expect(
      updateHouseAwaitingVerification('nope', { firstName: 'F', lastName: 'L', userId: 'u1' }),
    ).rejects.toThrow(HOUSE_CODE_INVALID);
    expect(getOpLog().map((e) => e.op)).toEqual(['getDocs']);
  });
});

describe('finalizeHouseSetup', () => {
  it('updates the house with the final config, setupComplete and updatedAt', async () => {
    seedDoc('houses/h1', { id: 'h1' });

    await finalizeHouseSetup('h1', { name: 'Oak' });

    expect(getOpLog()).toEqual([
      {
        op: 'update',
        path: 'houses/h1',
        data: { id: 'h1', name: 'Oak', setupComplete: true, updatedAt: ISO },
      },
    ]);
  });
});
