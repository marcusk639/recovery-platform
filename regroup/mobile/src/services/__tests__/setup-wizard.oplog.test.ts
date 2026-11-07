/**
 * setup-wizard.ts against the normalized Firebase operation log.
 *
 * Characterization for the React Native 0.88 upgrade (plan Task 10 Step 1).
 * This file stays byte-identical through the Task 10 migration (group 10c): a
 * mapping mistake in the rewrite fails here instead of being copied into an
 * edited expectation. Assertions are on outcomes and log entries only, never
 * on mock call chains or snapshot shapes. Auth and storage are not part of the
 * log; the token methods live on the signed-in user the test sets.
 */
jest.mock('../../../firebase-setup', () => require('../../../__mocks__/firebase-modular/setup'));
jest.mock('@react-native-firebase/firestore', () =>
  require('../../../__mocks__/firebase-modular/firestore'),
);
jest.mock('@react-native-firebase/functions', () =>
  require('../../../__mocks__/firebase-modular/functions'),
);
jest.mock('@react-native-firebase/auth', () => require('../../../__mocks__/firebase-modular/auth'));
jest.mock('@react-native-firebase/storage', () =>
  require('../../../__mocks__/firebase-modular/storage'),
);
jest.mock('../../../google/timezone', () => ({ getTimezone: jest.fn(async () => 'UTC') }));
jest.mock('../../util/logging', () => ({ logException: jest.fn() }));

import {
  failNext,
  getOpLog,
  resetOpLog,
  seedCall,
  seedDoc,
} from '../../../__mocks__/firebase-modular/log';
import {
  addAdminAuthorization,
  addGuestAuthorization,
  addPotentialSuperAdminPrivilege,
  createAdminInvite,
  createGuestInvite,
  initializeHouses,
  uploadHousePhotos,
} from '../setup-wizard';
import { CREATE_HOUSES_RETRY_MESSAGE } from '../setup-wizard-errors';
import Admin from '../../entities/Admin';
import { Guest } from '../../entities/Guest';
import { User } from '../../entities/User';
import { Houses } from '../../types';

const { setCurrentUser } = jest.requireMock<{ setCurrentUser: (user: unknown) => void }>(
  '@react-native-firebase/auth',
);

const photo = (houseId: string) => `https://mock-storage/houses/${houseId}/photo`;

beforeEach(() => {
  resetOpLog();
  setCurrentUser({
    uid: 'u1',
    getIdToken: async (force: boolean) => `token-${force}`,
    getIdTokenResult: async (force: boolean) => ({ token: `token-${force}`, claims: {} }),
  });
});

describe('addPotentialSuperAdminPrivilege', () => {
  it('returns the givePotentialSuperAdminPrivilege callable without calling it', async () => {
    const callable = await addPotentialSuperAdminPrivilege();
    expect(getOpLog()).toEqual([]);

    await callable();
    expect(getOpLog()).toEqual([{ op: 'call', path: 'givePotentialSuperAdminPrivilege' }]);
  });
});

describe('addAdminAuthorization', () => {
  it('calls addAdminAuthorization with the admin, then force-refreshes the token', async () => {
    seedCall('addAdminAuthorization', true);

    expect(await addAdminAuthorization({ id: 'a1' } as Admin)).toBe('token-true');
    expect(getOpLog()).toEqual([{ op: 'call', path: 'addAdminAuthorization', data: { id: 'a1' } }]);
  });

  it('throws when the callable returns no data', async () => {
    seedCall('addAdminAuthorization', null);

    await expect(addAdminAuthorization({ id: 'a1' } as Admin)).rejects.toEqual({
      message: 'Something went wrong.',
    });
  });
});

describe('addGuestAuthorization', () => {
  it('calls addGuestAuthorization with the guest, then force-refreshes the token', async () => {
    seedCall('addGuestAuthorization', true);

    expect(await addGuestAuthorization({ id: 'g1' } as Guest)).toBe('token-true');
    expect(getOpLog()).toEqual([{ op: 'call', path: 'addGuestAuthorization', data: { id: 'g1' } }]);
  });

  it('throws when the callable returns no data', async () => {
    seedCall('addGuestAuthorization', null);

    await expect(addGuestAuthorization({ id: 'g1' } as Guest)).rejects.toEqual({
      message: 'Something went wrong',
    });
  });
});

describe('createAdminInvite / createGuestInvite', () => {
  it('calls createInvitation with the admin role', async () => {
    seedCall('createInvitation', { token: 't1' });

    expect(await createAdminInvite('a@example.com', 'h1')).toEqual({ token: 't1' });
    expect(getOpLog()).toEqual([
      {
        op: 'call',
        path: 'createInvitation',
        data: { email: 'a@example.com', houseId: 'h1', role: 'admin' },
      },
    ]);
  });

  it('calls createInvitation with the guest role and initial phase', async () => {
    await createGuestInvite('g@example.com', 'h1', 'P1');

    expect(getOpLog()).toEqual([
      {
        op: 'call',
        path: 'createInvitation',
        data: { email: 'g@example.com', houseId: 'h1', role: 'guest', initialPhase: 'P1' },
      },
    ]);
  });
});

describe('uploadHousePhotos', () => {
  it('uploads each house photo and makes no Firestore call', async () => {
    const houses = {
      h1: { id: 'h1', imageUrl: 'file:///h1.jpg' },
      h2: { id: 'h2' },
    } as unknown as Houses;

    expect(await uploadHousePhotos(houses)).toEqual([{ houseId: 'h1', url: photo('h1') }]);
    expect(getOpLog()).toEqual([]);
  });
});

describe('initializeHouses', () => {
  const wizardHouses = () =>
    ({
      local1: {
        id: 'local1',
        name: 'House 1',
        lat: 1,
        lng: 2,
        imageUrl: 'file:///h1.jpg',
        pendingAdminInvites: ['a@example.com', 'a@example.com'],
      },
    }) as unknown as Houses;
  const created = {
    houseIds: ['h1'],
    idMap: { local1: 'h1' },
    admin: { id: 'a1' },
    subscriptionMetadata: { houses: { h1: {} } },
  };

  it('creates houses by callable, writes the photo, then sends the invitations', async () => {
    seedCall('createHouses', created);
    seedDoc('houses/h1', { id: 'h1' });

    const result = await initializeHouses(wizardHouses(), { id: 'u1' } as User);

    expect(getOpLog()).toEqual([
      {
        op: 'call',
        path: 'createHouses',
        data: {
          houses: [
            {
              name: 'House 1',
              lat: 1,
              lng: 2,
              timezone: 'UTC',
              pendingAdminInvites: ['a@example.com'],
              requestKey: 'local1',
            },
          ],
        },
      },
      { op: 'update', path: 'houses/h1', data: { imageUrl: photo('h1'), avatar: photo('h1') } },
      {
        op: 'call',
        path: 'createInvitation',
        data: { email: 'a@example.com', houseId: 'h1', role: 'admin' },
      },
      {
        op: 'call',
        path: 'createInvitation',
        data: { email: 'a@example.com', houseId: 'h1', role: 'admin' },
      },
    ]);
    expect(Object.keys(result.houses)).toEqual(['h1']);
    expect(result.houses.h1).toEqual(expect.objectContaining({ id: 'h1', imageUrl: photo('h1') }));
    expect(result.photoFailures).toBe(0);
    expect(result.inviteFailures).toBe(0);
    expect(result.token).toEqual({ token: 'token-true', claims: {} });
    expect(result.user).toEqual(
      expect.objectContaining({ adminId: 'a1', housesOwned: ['h1'], orgSetupCompleted: true }),
    );
  });

  it('maps a createHouses failure and makes no other call', async () => {
    failNext('call', Object.assign(new Error('boom'), { code: 'internal' }), 'createHouses');

    await expect(initializeHouses(wizardHouses(), { id: 'u1' } as User)).rejects.toThrow(
      CREATE_HOUSES_RETRY_MESSAGE,
    );
    expect(getOpLog().map((e) => e.path)).toEqual(['createHouses']);
  });

  it('counts a failed invitation without failing setup', async () => {
    seedCall('createHouses', created);
    seedDoc('houses/h1', { id: 'h1' });
    failNext('call', new Error('denied'), 'createInvitation');

    const result = await initializeHouses(wizardHouses(), { id: 'u1' } as User);

    expect(result.inviteFailures).toBe(1);
    expect(result.failedInvites).toEqual([{ houseId: 'h1', role: 'admin', houseName: 'House 1' }]);
  });
});
