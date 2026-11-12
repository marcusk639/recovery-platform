/**
 * choreRotation.ts against the normalized Firebase operation log.
 *
 * Characterization for the React Native 0.88 upgrade (plan Task 10 Step 1).
 * This file stays byte-identical through the Task 10 migration (group 10d): a
 * mapping mistake in the rewrite fails here instead of being copied into an
 * edited expectation. Assertions are on outcomes and log entries only, never
 * on mock call chains or snapshot shapes. The week anchor is computed in local
 * time (jest.config.js pins TZ to America/Chicago).
 */
jest.mock('../../../firebase-setup', () => require('../../../__mocks__/firebase-modular/setup'));
jest.mock('@react-native-firebase/firestore', () =>
  require('../../../__mocks__/firebase-modular/firestore'),
);
jest.mock('@react-native-firebase/functions', () =>
  require('../../../__mocks__/firebase-modular/functions'),
);
jest.mock('../../util/logging', () => ({ logException: jest.fn() }));

import {
  failNext,
  getOpLog,
  readDoc,
  resetOpLog,
  seedDoc,
} from '../../../__mocks__/firebase-modular/log';
import {
  advanceRotation,
  getCurrentAssignee,
  getRotation,
  setRotationOrder,
} from '../choreRotation';
import { logException } from '../../util/logging';

const PATH = 'choreRotations/h1';

beforeEach(() => {
  resetOpLog();
  // Wednesday 2026-10-07, noon local; the week's Sunday is 2026-10-04.
  jest.useFakeTimers({ now: new Date(2026, 9, 7, 12, 0, 0) });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('getRotation', () => {
  it('reads choreRotations/{houseId} and returns its data', async () => {
    seedDoc(PATH, { choreName: 'Dishes', guestIds: ['g1'], currentIndex: 0 });

    expect(await getRotation('h1')).toEqual({
      choreName: 'Dishes',
      guestIds: ['g1'],
      currentIndex: 0,
    });
    expect(getOpLog()).toEqual([{ op: 'get', path: PATH }]);
  });

  it('returns null when no rotation exists', async () => {
    expect(await getRotation('h1')).toBeNull();
    expect(getOpLog()).toEqual([{ op: 'get', path: PATH }]);
  });

  it('logs and rethrows a generic error when the read fails', async () => {
    const error = new Error('unavailable');
    failNext('get', error, PATH);

    await expect(getRotation('h1')).rejects.toThrow('Failed to fetch chore rotation');
    expect(logException).toHaveBeenCalledWith(error);
  });
});

describe('setRotationOrder', () => {
  it('sets choreRotations/{houseId} at index 0 anchored to this Sunday', async () => {
    await setRotationOrder('h1', 'Dishes', ['g1', 'g2']);

    expect(getOpLog()).toEqual([
      {
        op: 'set',
        path: PATH,
        data: {
          choreName: 'Dishes',
          guestIds: ['g1', 'g2'],
          currentIndex: 0,
          lastRotatedAt: '2026-10-04',
        },
      },
    ]);
  });

  it('reports a failed write with its message', async () => {
    failNext('set', new Error('permission-denied'), PATH);
    await expect(setRotationOrder('h1', 'Dishes', [])).rejects.toThrow(
      'Failed to set rotation order',
    );
  });
});

describe('advanceRotation', () => {
  it('reads, then updates the index (wrapping) and the Sunday anchor', async () => {
    seedDoc(PATH, {
      choreName: 'Dishes',
      guestIds: ['g1', 'g2'],
      currentIndex: 1,
      lastRotatedAt: '2026-09-27',
    });

    await advanceRotation('h1');

    expect(getOpLog()).toEqual([
      { op: 'get', path: PATH },
      { op: 'update', path: PATH, data: { currentIndex: 0, lastRotatedAt: '2026-10-04' } },
    ]);
    expect(readDoc(PATH)?.currentIndex).toBe(0);
  });

  it('fails without writing when no rotation is configured', async () => {
    await expect(advanceRotation('h1')).rejects.toThrow('Failed to advance chore rotation');
    expect(getOpLog()).toEqual([{ op: 'get', path: PATH }]);
  });
});

describe('getCurrentAssignee', () => {
  it('returns the guest at the current index', async () => {
    seedDoc(PATH, { guestIds: ['g1', 'g2'], currentIndex: 1 });

    expect(await getCurrentAssignee('h1')).toBe('g2');
    expect(getOpLog()).toEqual([{ op: 'get', path: PATH }]);
  });

  it('returns null for an empty rotation', async () => {
    seedDoc(PATH, { guestIds: [], currentIndex: 0 });
    expect(await getCurrentAssignee('h1')).toBeNull();
  });

  it('returns null when no rotation exists', async () => {
    expect(await getCurrentAssignee('h1')).toBeNull();
  });

  it('wraps a read failure in its own message', async () => {
    failNext('get', new Error('unavailable'), PATH);
    await expect(getCurrentAssignee('h1')).rejects.toThrow('Failed to get current chore assignee');
  });
});
