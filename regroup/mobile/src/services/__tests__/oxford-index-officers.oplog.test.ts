/**
 * oxford/index.ts officer adapters against the normalized Firebase operation
 * log (meetings, votes, elections, EES and financial records:
 * oxford-index.oplog.test.ts).
 *
 * Characterization for the React Native 0.88 upgrade (plan Task 10 Step 1).
 * This file stays byte-identical through the Task 10 migration (group 10d): a
 * mapping mistake in the rewrite fails here instead of being copied into an
 * edited expectation. Assertions are on outcomes and log entries only, never
 * on mock call chains or snapshot shapes.
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
  seedQuery,
} from '../../../__mocks__/firebase-modular/log';
import {
  createOfficer,
  getActiveOfficers,
  getOfficers,
  removeOfficer,
  updateOfficer,
} from '../oxford';
import { Officer } from '../../entities/oxford';
import { logException } from '../../util/logging';

const OFFICERS = 'houses/h1/officers';
const officer = (fields: Record<string, unknown>) =>
  fields as unknown as Omit<Officer, 'id'> & { houseId: string };

beforeEach(() => {
  resetOpLog();
});

describe('reads', () => {
  it('getOfficers reads the whole subcollection, doc id winning over a stored id', async () => {
    seedQuery(OFFICERS, [{ id: 'o1', role: 'treasurer' }]);
    seedDoc(`${OFFICERS}/o2`, { id: 'stale', role: 'president' });

    expect(await getOfficers('h1')).toEqual([
      { id: 'o1', role: 'treasurer' },
      { id: 'o2', role: 'president' },
    ]);
    expect(getOpLog()).toEqual([{ op: 'getDocs', path: OFFICERS, constraints: [] }]);
  });

  it('getActiveOfficers filters on isActive == true', async () => {
    seedQuery(OFFICERS, [
      { id: 'o1', isActive: true },
      { id: 'o2', isActive: false },
    ]);

    expect(await getActiveOfficers('h1')).toEqual([{ id: 'o1', isActive: true }]);
    expect(getOpLog()).toEqual([
      { op: 'getDocs', path: OFFICERS, constraints: [['where', 'isActive', '==', true]] },
    ]);
  });

  it('getOfficers wraps a failed read', async () => {
    const error = new Error('unavailable');
    failNext('getDocs', error, OFFICERS);

    await expect(getOfficers('h1')).rejects.toThrow('Failed to load officers');
    expect(logException).toHaveBeenCalledWith(error);
  });

  it('getActiveOfficers wraps a failed read', async () => {
    failNext('getDocs', new Error('unavailable'), OFFICERS);
    await expect(getActiveOfficers('h1')).rejects.toThrow('Failed to load active officers');
  });
});

describe('createOfficer', () => {
  it('queries active holders of the role, deactivates them and sets the new officer in one batch', async () => {
    seedQuery(OFFICERS, [
      { id: 'o1', role: 'treasurer', isActive: true },
      { id: 'o2', role: 'treasurer', isActive: false },
      { id: 'o3', role: 'president', isActive: true },
    ]);

    const result = await createOfficer(
      officer({ houseId: 'h1', role: 'treasurer', guestId: 'g1', isActive: true }),
    );

    expect(result).toEqual({
      houseId: 'h1',
      role: 'treasurer',
      guestId: 'g1',
      isActive: true,
      id: 'auto-1',
    });
    expect(getOpLog()).toEqual([
      {
        op: 'getDocs',
        path: OFFICERS,
        constraints: [
          ['where', 'role', '==', 'treasurer'],
          ['where', 'isActive', '==', true],
        ],
      },
      { op: 'batch.update', path: `${OFFICERS}/o1`, data: { isActive: false } },
      {
        op: 'batch.set',
        path: `${OFFICERS}/auto-1`,
        data: { houseId: 'h1', role: 'treasurer', guestId: 'g1', isActive: true, id: 'auto-1' },
      },
      { op: 'batch.commit', path: '' },
    ]);
    expect(readDoc(`${OFFICERS}/o1`)?.isActive).toBe(false);
    expect(readDoc(`${OFFICERS}/o3`)?.isActive).toBe(true);
  });

  it('commits only the new officer when no one holds the role', async () => {
    await createOfficer(officer({ houseId: 'h1', role: 'secretary', isActive: true }));

    expect(getOpLog().map((e) => e.op)).toEqual(['getDocs', 'batch.set', 'batch.commit']);
  });

  it('wraps a failed commit and writes nothing', async () => {
    seedQuery(OFFICERS, [{ id: 'o1', role: 'treasurer', isActive: true }]);
    failNext('batch.commit', new Error('permission-denied'));

    await expect(
      createOfficer(officer({ houseId: 'h1', role: 'treasurer', isActive: true })),
    ).rejects.toThrow('Failed to create officer');
    expect(readDoc(`${OFFICERS}/o1`)?.isActive).toBe(true);
    expect(readDoc(`${OFFICERS}/auto-1`)).toBeUndefined();
  });
});

describe('updateOfficer / removeOfficer', () => {
  it('updateOfficer updates the officer with every given field, houseId included', async () => {
    seedDoc(`${OFFICERS}/o1`, { role: 'treasurer' });

    await updateOfficer('o1', { houseId: 'h1', isActive: false });

    expect(getOpLog()).toEqual([
      { op: 'update', path: `${OFFICERS}/o1`, data: { houseId: 'h1', isActive: false } },
    ]);
  });

  it('updateOfficer refuses without a houseId, before any op', async () => {
    await expect(updateOfficer('o1', { isActive: false })).rejects.toThrow(
      'houseId required to update officer in subcollection',
    );
    expect(getOpLog()).toEqual([]);
  });

  it('updateOfficer wraps a failed update', async () => {
    await expect(updateOfficer('gone', { houseId: 'h1' })).rejects.toThrow(
      'Failed to update officer',
    );
  });

  it('removeOfficer deletes the officer', async () => {
    seedDoc(`${OFFICERS}/o1`, { role: 'treasurer' });

    await removeOfficer('o1', 'h1');

    expect(getOpLog()).toEqual([{ op: 'delete', path: `${OFFICERS}/o1` }]);
    expect(readDoc(`${OFFICERS}/o1`)).toBeUndefined();
  });

  it('removeOfficer refuses without a houseId, before any op', async () => {
    await expect(removeOfficer('o1')).rejects.toThrow(
      'houseId required to remove officer from subcollection',
    );
    expect(getOpLog()).toEqual([]);
  });

  it('removeOfficer wraps a failed delete', async () => {
    failNext('delete', new Error('permission-denied'), `${OFFICERS}/o1`);
    await expect(removeOfficer('o1', 'h1')).rejects.toThrow('Failed to remove officer');
  });
});
