/**
 * users.tsx Firestore and callable operations against the normalized Firebase
 * operation log (auth-only functions: users-auth.oplog.test.ts).
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
  readDoc,
  resetOpLog,
  seedCall,
  seedDoc,
} from '../../../__mocks__/firebase-modular/log';
import {
  createAnonUser,
  createUser,
  getHouseOwner,
  getUser,
  getUserFinishingSetup,
  requestAccountVerification,
  updateOptionalInfo,
  updateUser,
} from '../users';
import Admin from '../../entities/Admin';
import { Guest } from '../../entities/Guest';
import { User } from '../../entities/User';

const { setCurrentUser } = jest.requireMock<{ setCurrentUser: (user: unknown) => void }>(
  '@react-native-firebase/auth',
);

beforeEach(() => {
  resetOpLog();
  setCurrentUser({
    uid: 'u1',
    getIdTokenResult: async () => ({ claims: { admin: { h1: true }, superAdmin: { h1: true } } }),
  });
});

describe('getUser', () => {
  it('reads users/{id}', async () => {
    seedDoc('users/u1', { id: 'u1' });

    expect(await getUser('u1')).toEqual({ id: 'u1' });
    expect(getOpLog()).toEqual([{ op: 'get', path: 'users/u1' }]);
  });
});

describe('getUserFinishingSetup', () => {
  it('reads the user once when there is nothing to recover', async () => {
    seedDoc('users/u1', { id: 'u1', housesOwned: [] });

    expect(await getUserFinishingSetup('u1')).toEqual({
      user: { id: 'u1', housesOwned: [] },
      setupRecoveryFailed: false,
    });
    expect(getOpLog()).toEqual([{ op: 'get', path: 'users/u1' }]);
  });

  it('does not call the server for a completed operator whose token has every claim', async () => {
    seedDoc('users/u1', {
      id: 'u1',
      orgSetupCompleted: true,
      subscriptionMetadata: { houses: { h1: {} } },
    });

    await getUserFinishingSetup('u1');

    expect(getOpLog()).toEqual([{ op: 'get', path: 'users/u1' }]);
  });

  it('finishes setup by callable, then reads the user again', async () => {
    seedDoc('users/u1', { id: 'u1', housesOwned: ['h1'] });
    seedCall('finishOperatorSetup', { completed: true, houseIds: ['h1'] });

    const result = await getUserFinishingSetup('u1');

    expect(getOpLog()).toEqual([
      { op: 'get', path: 'users/u1' },
      { op: 'call', path: 'finishOperatorSetup' },
      { op: 'get', path: 'users/u1' },
    ]);
    expect(result).toEqual({
      user: {
        id: 'u1',
        housesOwned: ['h1'],
        orgSetupCompleted: true,
        isAdmin: true,
        isSuperAdmin: true,
      },
      setupRecoveryFailed: false,
    });
  });

  it('reports a failed recovery for an incomplete setup without reloading', async () => {
    seedDoc('users/u1', { id: 'u1', housesOwned: ['h1'] });
    failNext('call', new Error('internal'), 'finishOperatorSetup');

    const result = await getUserFinishingSetup('u1');

    expect(result.setupRecoveryFailed).toBe(true);
    expect(getOpLog().map((e) => e.op)).toEqual(['get', 'call']);
  });
});

describe('createAnonUser', () => {
  it('sets users/{uid} with the uid as id', async () => {
    await createAnonUser({ uid: 'anon1', isAnonymous: true } as User);

    expect(getOpLog()).toEqual([
      { op: 'set', path: 'users/anon1', data: { uid: 'anon1', isAnonymous: true, id: 'anon1' } },
    ]);
  });
});

describe('createUser', () => {
  it('creates the auth account, then sets users/{uid} without the password', async () => {
    const result = await createUser({ email: 'a@example.com', password: 'pw', firstName: 'F' });

    const expected = {
      email: 'a@example.com',
      password: undefined,
      firstName: 'F',
      uid: 'test-uid',
      emailVerified: true,
      phoneNumber: '',
      isAdmin: false,
      isManager: false,
      houseAccountVerified: false,
      houseCode: '',
      isAnonymous: undefined,
    };
    expect(result).toEqual(expected);
    expect(getOpLog()).toEqual([{ op: 'set', path: 'users/test-uid', data: expected }]);
    expect(readDoc('users/test-uid')).not.toHaveProperty('password');
  });
});

describe('updateUser', () => {
  it('updates users/{id} with the id and values and returns the merged user', async () => {
    seedDoc('users/u1', { id: 'u1', firstName: 'F' });

    const result = await updateUser({ id: 'u1', firstName: 'F' }, { lastName: 'L' });

    expect(result).toEqual({ id: 'u1', firstName: 'F', lastName: 'L' });
    expect(getOpLog()).toEqual([
      { op: 'update', path: 'users/u1', data: { id: 'u1', lastName: 'L' } },
    ]);
  });
});

describe('requestAccountVerification', () => {
  it('finds the house by code and appends the verification request', async () => {
    seedDoc('houses/h1', { id: 'h1', code: 'C1' });

    await requestAccountVerification('C1', 'F', 'L', 'u1');

    expect(getOpLog()).toEqual([
      { op: 'getDocs', path: 'houses', constraints: [['where', 'code', '==', 'C1']] },
      {
        op: 'update',
        path: 'houses/h1',
        data: {
          id: 'h1',
          code: 'C1',
          awaitingVerification: [{ firstName: 'F', lastName: 'L', userId: 'u1' }],
        },
      },
    ]);
  });
});

describe('updateOptionalInfo', () => {
  const avatarUrl = 'https://mock-storage/users/u1/avatar';

  beforeEach(() => {
    seedDoc('users/u1', { uid: 'u1' });
    seedDoc('guests/g1', { id: 'g1' });
    seedDoc('admins/a1', { id: 'a1' });
  });

  it('uploads the avatar, then batch-updates user, guest and admin and commits', async () => {
    const user = {
      uid: 'u1',
      avatar: 'file:///a.jpg',
      subscriptionMetadata: { houses: {} },
    } as unknown as User;

    await updateOptionalInfo(user, { id: 'g1' } as Guest, { id: 'a1' } as Admin);

    expect(getOpLog()).toEqual([
      { op: 'batch.update', path: 'users/u1', data: { uid: 'u1', avatar: avatarUrl } },
      { op: 'batch.update', path: 'guests/g1', data: { id: 'g1', avatar: avatarUrl } },
      { op: 'batch.update', path: 'admins/a1', data: { id: 'a1', avatar: avatarUrl } },
      { op: 'batch.commit', path: '' },
    ]);
    expect(readDoc('users/u1')).toEqual({ uid: 'u1', avatar: avatarUrl });
  });

  it('updates only the user when there is no guest or admin', async () => {
    await updateOptionalInfo(
      { uid: 'u1', firstName: 'F' } as User,
      undefined as unknown as Guest,
      undefined as unknown as Admin,
    );

    expect(getOpLog()).toEqual([
      { op: 'batch.update', path: 'users/u1', data: { uid: 'u1', firstName: 'F' } },
      { op: 'batch.commit', path: '' },
    ]);
  });
});

describe('getHouseOwner', () => {
  it('queries users whose housesOwned contains the house and returns the first', async () => {
    seedDoc('users/u1', { id: 'u1', housesOwned: ['h1'] });
    seedDoc('users/u2', { id: 'u2', housesOwned: ['h2'] });

    expect(await getHouseOwner('h1')).toEqual({ id: 'u1', housesOwned: ['h1'] });
    expect(getOpLog()).toEqual([
      {
        op: 'getDocs',
        path: 'users',
        constraints: [['where', 'housesOwned', 'array-contains', 'h1']],
      },
    ]);
  });

  it('throws when no user owns the house', async () => {
    await expect(getHouseOwner('none')).rejects.toThrow(TypeError);
  });
});
