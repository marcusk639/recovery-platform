/**
 * issues.ts against the normalized Firebase operation log.
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
import { createIssue, dismissIssue, removeIssue, resolveIssue, updateIssueStatus } from '../issues';
import { HouseIssue, IssueStatus } from '../../entities/Issue';
import { House } from '../../entities/House';

const issue = (fields: Record<string, unknown>) => fields as unknown as HouseIssue;

const makeHouse = () =>
  ({
    id: 'h1',
    name: 'Oak',
    issues: {
      i1: { id: 'i1', status: 'open', resolution: 'old note' },
      i2: { id: 'i2', status: 'open' },
    },
  }) as unknown as House;

beforeEach(() => {
  resetOpLog();
});

describe('createIssue', () => {
  it('sets issues/{issue.id} with status forced to open', async () => {
    const result = await createIssue(issue({ id: 'i1', houseId: 'h1', status: 'resolved' }));

    expect(result).toEqual({ id: 'i1', houseId: 'h1', status: 'open' });
    expect(getOpLog()).toEqual([
      { op: 'set', path: 'issues/i1', data: { id: 'i1', houseId: 'h1', status: 'open' } },
    ]);
  });

  it('sets issues/{auto id} for an issue without an id', async () => {
    const result = await createIssue(issue({ houseId: 'h1' }));

    expect(result).toEqual({ houseId: 'h1', status: 'open', id: 'auto-1' });
    expect(getOpLog()).toEqual([
      { op: 'set', path: 'issues/auto-1', data: { houseId: 'h1', status: 'open', id: 'auto-1' } },
    ]);
  });
});

describe('removeIssue', () => {
  it('batch-deletes the issue doc and updates only house.issues', async () => {
    seedDoc('houses/h1', { name: 'Oak' });
    seedDoc('issues/i1', { id: 'i1' });

    const result = await removeIssue(makeHouse(), issue({ id: 'i1' }));

    expect(result.issues).toEqual({ i2: { id: 'i2', status: 'open' } });
    expect(getOpLog()).toEqual([
      { op: 'batch.delete', path: 'issues/i1' },
      {
        op: 'batch.update',
        path: 'houses/h1',
        data: { issues: { i2: { id: 'i2', status: 'open' } } },
      },
      { op: 'batch.commit', path: '' },
    ]);
    expect(readDoc('issues/i1')).toBeUndefined();
    expect(readDoc('houses/h1')).toEqual({
      name: 'Oak',
      issues: { i2: { id: 'i2', status: 'open' } },
    });
  });

  it('rejects when the batch commit fails', async () => {
    failNext('batch.commit', new Error('permission-denied'));

    await expect(removeIssue(makeHouse(), issue({ id: 'i1' }))).rejects.toThrow(
      'permission-denied',
    );
  });
});

describe('updateIssueStatus', () => {
  it('updates houses/{id} with the whole issues map', async () => {
    seedDoc('houses/h1', { name: 'Oak' });

    const result = await updateIssueStatus(makeHouse(), 'i2', IssueStatus.IN_PROGRESS);

    const issues = {
      i1: { id: 'i1', status: 'open', resolution: 'old note' },
      i2: { id: 'i2', status: 'in_progress', invalid: false, resolution: '' },
    };
    expect(result).toEqual({ id: 'h1', name: 'Oak', issues });
    expect(getOpLog()).toEqual([{ op: 'update', path: 'houses/h1', data: { issues } }]);
  });

  it('throws without any op for an issue not on the house', async () => {
    await expect(updateIssueStatus(makeHouse(), 'nope', IssueStatus.RESOLVED)).rejects.toThrow(
      'Issue nope not found on house h1',
    );
    expect(getOpLog()).toEqual([]);
  });

  it('resolveIssue keeps the existing resolution when none is given', async () => {
    seedDoc('houses/h1', { name: 'Oak' });

    await resolveIssue(makeHouse(), 'i1');

    expect(getOpLog()[0].data).toEqual({
      issues: {
        i1: { id: 'i1', status: 'resolved', invalid: false, resolution: 'old note' },
        i2: { id: 'i2', status: 'open' },
      },
    });
  });

  it('resolveIssue writes the given resolution', async () => {
    seedDoc('houses/h1', { name: 'Oak' });

    await resolveIssue(makeHouse(), 'i1', 'fixed');

    expect((getOpLog()[0].data as any).issues.i1).toEqual({
      id: 'i1',
      status: 'resolved',
      invalid: false,
      resolution: 'fixed',
    });
  });

  it('dismissIssue marks it invalid and clears the resolution without an explanation', async () => {
    seedDoc('houses/h1', { name: 'Oak' });

    await dismissIssue(makeHouse(), 'i1');

    expect((getOpLog()[0].data as any).issues.i1).toEqual({
      id: 'i1',
      status: 'dismissed',
      invalid: true,
      resolution: '',
    });
  });

  it('rejects when the update fails', async () => {
    failNext('update', new Error('permission-denied'), 'houses/h1');

    await expect(dismissIssue(makeHouse(), 'i1', 'dup')).rejects.toThrow('permission-denied');
  });
});
