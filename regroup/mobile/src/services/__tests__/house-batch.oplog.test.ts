/**
 * house.tsx batches and callables against the normalized Firebase operation
 * log (reads and single-document writes: house.oplog.test.ts).
 *
 * Characterization for the React Native 0.88 upgrade (plan Task 10 Step 1).
 * This file stays byte-identical through the Task 10 migration (group 10c): a
 * mapping mistake in the rewrite fails here instead of being copied into an
 * edited expectation. Assertions are on outcomes and log entries only, never
 * on mock call chains or snapshot shapes. Storage is not part of the log.
 */
jest.mock('../../../firebase-setup', () => require('../../../__mocks__/firebase-modular/setup'));
jest.mock('@react-native-firebase/firestore', () =>
  require('../../../__mocks__/firebase-modular/firestore'),
);
jest.mock('@react-native-firebase/functions', () =>
  require('../../../__mocks__/firebase-modular/functions'),
);
jest.mock('@react-native-firebase/storage', () =>
  require('../../../__mocks__/firebase-modular/storage'),
);
jest.mock('../../../google/timezone', () => ({ getTimezone: jest.fn(async () => 'UTC') }));
jest.mock('../../util/logging', () => ({ logException: jest.fn() }));

import {
  failNext,
  getOpLog,
  readDoc,
  resetOpLog,
  seedCall,
  seedDoc,
} from '../../../__mocks__/firebase-modular/log';
import {
  createHouseBatch,
  promoteGuestsToAdmin,
  removeAdminPrivileges,
  removeAdminPrivilegesForGuests,
  removeGuestPrivileges,
  updateHouseBatch,
} from '../house';
import Admin from '../../entities/Admin';
import { Guest } from '../../entities/Guest';
import { House } from '../../entities/House';
import { Admins, Guests } from '../../types';
import { geohash } from '../../util/geolocation';

const ISO = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

beforeEach(() => {
  resetOpLog();
});

describe('createHouseBatch', () => {
  it('batch-sets each admin and the house under auto ids, then commits', async () => {
    const admins = [{ houseIds: [] }, { houseIds: [] }] as unknown as Admin[];

    const result = await createHouseBatch({ name: 'Oak', lat: 30, lng: -90 } as House, admins);

    const house = {
      name: 'Oak',
      lat: 30,
      lng: -90,
      adminIds: ['auto-1', 'auto-2'],
      id: 'auto-3',
      createdAt: ISO,
      geohash: geohash(30, -90),
      timezone: 'UTC',
    };
    expect(result).toEqual({
      house,
      admins: [
        { houseIds: [], id: 'auto-1' },
        { houseIds: [], id: 'auto-2' },
      ],
    });
    expect(getOpLog()).toEqual([
      { op: 'batch.set', path: 'admins/auto-1', data: { houseIds: [], id: 'auto-1' } },
      { op: 'batch.set', path: 'admins/auto-2', data: { houseIds: [], id: 'auto-2' } },
      { op: 'batch.set', path: 'houses/auto-3', data: house },
      { op: 'batch.commit', path: '' },
    ]);
    expect(readDoc('houses/auto-3')?.adminIds).toEqual(['auto-1', 'auto-2']);
  });

  it('stores geohash unknown for a house without coordinates', async () => {
    await createHouseBatch({ name: 'Oak' } as House, []);

    expect(getOpLog()[0].data).toEqual(expect.objectContaining({ geohash: 'unknown' }));
  });

  it('replaces a commit failure with a generic message and stores nothing', async () => {
    failNext('batch.commit', new Error('denied'));

    await expect(createHouseBatch({ name: 'Oak' } as House, [])).rejects.toThrow(
      'Failed to create house.',
    );
    expect(readDoc('houses/auto-1')).toBeUndefined();
  });
});

describe('guest and admin privilege callables', () => {
  it('promoteGuestsToAdmin calls promoteGuestsToAdmin with the guest list', async () => {
    seedCall('promoteGuestsToAdmin', { ok: true });

    expect(await promoteGuestsToAdmin([{ id: 'g1' } as Guest])).toEqual({ ok: true });
    expect(getOpLog()).toEqual([
      { op: 'call', path: 'promoteGuestsToAdmin', data: [{ id: 'g1' }] },
    ]);
  });

  it('promoteGuestsToAdmin makes no call for an empty list', async () => {
    expect(await promoteGuestsToAdmin([])).toBeUndefined();
    expect(getOpLog()).toEqual([]);
  });

  it('removeAdminPrivilegesForGuests calls removePrivilegesForGuests with role admin', async () => {
    await removeAdminPrivilegesForGuests([{ id: 'g1' } as Guest]);

    expect(getOpLog()).toEqual([
      {
        op: 'call',
        path: 'removePrivilegesForGuests',
        data: { role: 'admin', guests: [{ id: 'g1' }] },
      },
    ]);
  });

  it('removeGuestPrivileges calls removePrivilegesForGuests with role guest', async () => {
    seedCall('removePrivilegesForGuests', { removed: 1 });

    expect(await removeGuestPrivileges([{ id: 'g1' } as Guest])).toEqual({ removed: 1 });
    expect(getOpLog()).toEqual([
      {
        op: 'call',
        path: 'removePrivilegesForGuests',
        data: { role: 'guest', guests: [{ id: 'g1' }] },
      },
    ]);
  });

  it('removeGuestPrivileges makes no call for an empty list', async () => {
    expect(await removeGuestPrivileges([])).toBeUndefined();
    expect(getOpLog()).toEqual([]);
  });

  it('removeAdminPrivileges calls deleteAdminAuthorization with both house lists', async () => {
    seedCall('deleteAdminAuthorization', true);

    expect(await removeAdminPrivileges({ id: 'a1' } as Admin, ['h1'], ['h2'])).toBe(true);
    expect(getOpLog()).toEqual([
      {
        op: 'call',
        path: 'deleteAdminAuthorization',
        data: { admin: { id: 'a1' }, adminHouseIds: ['h1'], superAdminHouseIds: ['h2'] },
      },
    ]);
  });
});

describe('updateHouseBatch', () => {
  const phases = { p1: { name: 'P1', order: 1 } };
  const houseBefore = { id: 'h1', lat: 30, lng: -90, imageUrl: '', phases } as unknown as House;

  beforeEach(() => {
    seedDoc('houses/h1', { id: 'h1' });
    seedDoc('admins/a1', { id: 'a1' });
    seedDoc('guests/g1', { id: 'g1' });
    seedDoc('guests/g2', { id: 'g2' });
  });

  it('calls invites and privilege callables, then commits house/admin and guest batches', async () => {
    const house = {
      id: 'h1',
      lat: 30,
      lng: -90,
      imageUrl: '',
      phases,
      pendingAdminInvites: ['a@example.com'],
      pendingGuestInvites: ['g@example.com'],
      chores: { k1: { name: 'Dishes' }, k2: { name: '' } },
    } as unknown as Partial<House>;
    const guestsBefore = {
      g1: { id: 'g1', isAdmin: false },
      g2: { id: 'g2', isAdmin: true },
      g3: { id: 'g3' },
    } as unknown as Guests;
    const guestsAfter = {
      g1: { id: 'g1', isAdmin: true },
      g2: { id: 'g2', isAdmin: false },
    } as unknown as Guests;
    const adminsBefore = {
      a1: { id: 'a1', houseIds: ['h1', 'h2'] },
      a2: { id: 'a2' },
    } as unknown as Admins;
    const adminsAfter = { a1: { id: 'a1', houseIds: ['h2'] } } as unknown as Admins;
    seedCall('createInvitation', { token: 't1' });

    const result = await updateHouseBatch(
      house,
      houseBefore,
      guestsBefore,
      guestsAfter,
      adminsBefore,
      adminsAfter,
    );

    const g1 = { id: 'g1', isAdmin: true };
    const g2 = { id: 'g2', isAdmin: false };
    const a1 = { id: 'a1', houseIds: ['h2'] };
    expect(getOpLog()).toEqual([
      {
        op: 'call',
        path: 'createInvitation',
        data: { email: 'a@example.com', houseId: 'h1', role: 'admin' },
      },
      {
        op: 'call',
        path: 'createInvitation',
        data: { email: 'g@example.com', houseId: 'h1', role: 'guest', initialPhase: 'P1' },
      },
      { op: 'call', path: 'promoteGuestsToAdmin', data: [g1] },
      { op: 'call', path: 'removePrivilegesForGuests', data: { role: 'admin', guests: [g2] } },
      {
        op: 'call',
        path: 'deleteAdminAuthorization',
        data: { admin: a1, adminHouseIds: ['h1'], superAdminHouseIds: ['h1'] },
      },
      {
        op: 'batch.update',
        path: 'houses/h1',
        data: { ...house, chores: { Dishes: { name: 'Dishes' } } },
      },
      { op: 'batch.update', path: 'admins/a1', data: a1 },
      { op: 'batch.delete', path: 'admins/a2' },
      { op: 'batch.commit', path: '' },
      { op: 'batch.update', path: 'guests/g1', data: g1 },
      { op: 'batch.update', path: 'guests/g2', data: g2 },
      { op: 'batch.delete', path: 'guests/g3' },
      { op: 'batch.set', path: 'guest-archive/g3', data: { id: 'g3' } },
      { op: 'batch.commit', path: '' },
    ]);
    expect(result).toEqual([[{ token: 't1' }, { token: 't1' }], {}, {}, {}, undefined, undefined]);
    expect(readDoc('guest-archive/g3')).toEqual({ id: 'g3' });
  });

  it('uploads a changed photo and recomputes the geohash for moved coordinates', async () => {
    const house = { id: 'h1', lat: 31, lng: -91, imageUrl: 'file:///h1.jpg' } as Partial<House>;

    await updateHouseBatch(house, houseBefore, {}, {}, {}, {});

    expect(getOpLog()).toEqual([
      {
        op: 'batch.update',
        path: 'houses/h1',
        data: {
          id: 'h1',
          lat: 31,
          lng: -91,
          imageUrl: 'https://mock-storage/houses/h1/photo',
          geohash: geohash(31, -91),
        },
      },
      { op: 'batch.commit', path: '' },
    ]);
  });

  it('rethrows a commit failure', async () => {
    failNext('batch.commit', new Error('denied'));

    await expect(
      updateHouseBatch({ id: 'h1', lat: 30, lng: -90, imageUrl: '' }, houseBefore, {}, {}, {}, {}),
    ).rejects.toThrow('denied');
  });
});
