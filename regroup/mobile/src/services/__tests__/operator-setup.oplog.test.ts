/**
 * operator-setup.ts against the normalized Firebase operation log.
 *
 * Characterization for the React Native 0.88 upgrade (plan Task 10 Step 1).
 * This file stays byte-identical through the Task 10 migration (group 10c): a
 * mapping mistake in the rewrite fails here instead of being copied into an
 * edited expectation. Assertions are on outcomes and log entries only, never
 * on mock call chains or snapshot shapes. The finishOperatorSetup callable is
 * the file's only Firebase call.
 */
jest.mock('../../../firebase-setup', () => require('../../../__mocks__/firebase-modular/setup'));
jest.mock('@react-native-firebase/functions', () =>
  require('../../../__mocks__/firebase-modular/functions'),
);
jest.mock('../../util/logging', () => ({ logException: jest.fn() }));

import { failNext, getOpLog, resetOpLog, seedCall } from '../../../__mocks__/firebase-modular/log';
import { finishOperatorSetup, finishOperatorSetupIfNeeded } from '../operator-setup';
import { User } from '../../entities/User';

const CALL = { op: 'call', path: 'finishOperatorSetup' };

beforeEach(() => {
  resetOpLog();
});

describe('finishOperatorSetup', () => {
  it('calls finishOperatorSetup with no data; completed is completed', async () => {
    seedCall('finishOperatorSetup', { completed: true, houseIds: ['h1'] });

    expect(await finishOperatorSetup('u1')).toBe('completed');
    expect(getOpLog()).toEqual([CALL]);
  });

  it('counts an empty grant as completed without repairOnly', async () => {
    seedCall('finishOperatorSetup', { completed: true, houseIds: [] });

    expect(await finishOperatorSetup('u1')).toBe('completed');
  });

  it('counts an empty grant as not-needed with repairOnly', async () => {
    seedCall('finishOperatorSetup', { completed: true, houseIds: [] });

    expect(await finishOperatorSetup('u1', { repairOnly: true })).toBe('not-needed');
    expect(getOpLog()).toEqual([CALL]);
  });

  it('is incomplete when the server reports completed: false', async () => {
    seedCall('finishOperatorSetup', { completed: false });

    expect(await finishOperatorSetup('u1')).toBe('incomplete');
  });

  it('is failed, not thrown, when the callable throws', async () => {
    failNext('call', new Error('internal'), 'finishOperatorSetup');

    expect(await finishOperatorSetup('u1')).toBe('failed');
    expect(getOpLog()).toEqual([CALL]);
  });
});

describe('finishOperatorSetupIfNeeded', () => {
  it('does not call the server for a user with nothing to recover', async () => {
    expect(await finishOperatorSetupIfNeeded({ id: 'u1', housesOwned: [] })).toBe('not-needed');
    expect(getOpLog()).toEqual([]);
  });

  it('calls the server for an incomplete operator who owns a house', async () => {
    seedCall('finishOperatorSetup', { completed: true, houseIds: ['h1'] });

    const user: Partial<User> = { id: 'u1', housesOwned: ['h1'] };
    expect(await finishOperatorSetupIfNeeded(user)).toBe('completed');
    expect(getOpLog()).toEqual([CALL]);
  });

  it('calls the server in repair mode for a completed operator missing a claim', async () => {
    seedCall('finishOperatorSetup', { completed: true, houseIds: [] });

    const user = {
      id: 'u1',
      orgSetupCompleted: true,
      subscriptionMetadata: { houses: { h1: {} } },
    } as unknown as Partial<User>;
    expect(await finishOperatorSetupIfNeeded(user, { admin: {}, superAdmin: {} })).toBe(
      'not-needed',
    );
    expect(getOpLog()).toEqual([CALL]);
  });
});
