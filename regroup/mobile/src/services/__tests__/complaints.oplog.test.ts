/**
 * complaints.ts against the normalized Firebase operation log.
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

import {
  failNext,
  getOpLog,
  readDoc,
  resetOpLog,
  seedDoc,
} from '../../../__mocks__/firebase-modular/log';
import { createComplaint, removeComplaint } from '../complaints';
import { Complaint } from '../../entities/Complaint';
import { House } from '../../entities/House';

beforeEach(() => {
  resetOpLog();
});

describe('createComplaint', () => {
  it('sets complaints/{complaint.id} with the complaint', async () => {
    const complaint = { id: 'c1', houseId: 'h1', description: 'noise' } as unknown as Complaint;

    const result = await createComplaint(complaint);

    expect(result).toEqual({ id: 'c1', houseId: 'h1', description: 'noise' });
    expect(getOpLog()).toEqual([
      {
        op: 'set',
        path: 'complaints/c1',
        data: { id: 'c1', houseId: 'h1', description: 'noise' },
      },
    ]);
  });

  it('sets complaints/{auto id} for a complaint without an id', async () => {
    const result = await createComplaint({ houseId: 'h1' } as unknown as Complaint);

    expect(result).toEqual({ houseId: 'h1', id: 'auto-1' });
    expect(getOpLog()).toEqual([
      { op: 'set', path: 'complaints/auto-1', data: { houseId: 'h1', id: 'auto-1' } },
    ]);
  });
});

describe('removeComplaint', () => {
  const house = {
    id: 'h1',
    name: 'Oak',
    complaints: { c1: { id: 'c1' }, c2: { id: 'c2' } },
  } as unknown as House;

  it('batch-deletes the complaint doc and updates only house.complaints', async () => {
    seedDoc('houses/h1', { name: 'Oak', complaints: { c1: { id: 'c1' }, c2: { id: 'c2' } } });
    seedDoc('complaints/c1', { id: 'c1' });

    const result = await removeComplaint(house, { id: 'c1' } as unknown as Complaint);

    expect(result).toEqual({ id: 'h1', name: 'Oak', complaints: { c2: { id: 'c2' } } });
    expect(getOpLog()).toEqual([
      { op: 'batch.delete', path: 'complaints/c1' },
      { op: 'batch.update', path: 'houses/h1', data: { complaints: { c2: { id: 'c2' } } } },
      { op: 'batch.commit', path: '' },
    ]);
    expect(readDoc('complaints/c1')).toBeUndefined();
    expect(readDoc('houses/h1')).toEqual({ name: 'Oak', complaints: { c2: { id: 'c2' } } });
  });

  it('does not mutate the house it was given', async () => {
    seedDoc('houses/h1', { name: 'Oak' });

    await removeComplaint(house, { id: 'c1' } as unknown as Complaint);

    expect(house.complaints).toEqual({ c1: { id: 'c1' }, c2: { id: 'c2' } });
  });

  it('rejects when the batch commit fails', async () => {
    failNext('batch.commit', new Error('permission-denied'));

    await expect(removeComplaint(house, { id: 'c1' } as unknown as Complaint)).rejects.toThrow(
      'permission-denied',
    );
  });
});
