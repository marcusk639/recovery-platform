/**
 * feedback.ts against the normalized Firebase operation log.
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
  seedQuery,
} from '../../../__mocks__/firebase-modular/log';
import { createBugReport, createFeedback, getFeedback } from '../feedback';
import { BugReport } from '../../entities/BugReport';
import { Feedback } from '../../entities/Feedback';

beforeEach(() => {
  resetOpLog();
});

describe('getFeedback', () => {
  it('queries feedback by one == clause and keys the result by the stored id field', async () => {
    seedDoc('feedback/f1', { id: 'f1', houseId: 'h1', text: 'a' });
    seedDoc('feedback/f2', { id: 'f2', houseId: 'h2', text: 'b' });

    expect(await getFeedback('houseId', 'h1')).toEqual({
      f1: { id: 'f1', houseId: 'h1', text: 'a' },
    });
    expect(getOpLog()).toEqual([
      { op: 'getDocs', path: 'feedback', constraints: [['where', 'houseId', '==', 'h1']] },
    ]);
  });

  it('keys by the stored id field, not the doc id: docs without one collapse', async () => {
    seedQuery('feedback', [
      { id: 'f1', userId: 'u1' },
      { id: 'f2', userId: 'u1' },
    ]);

    expect(await getFeedback('userId', 'u1')).toEqual({ undefined: { userId: 'u1' } });
  });

  it('returns an empty map when nothing matches', async () => {
    expect(await getFeedback('houseId', 'none')).toEqual({});
  });

  it('rejects when the query fails', async () => {
    failNext('getDocs', new Error('unavailable'), 'feedback');
    await expect(getFeedback('houseId', 'h1')).rejects.toThrow('unavailable');
  });
});

describe('createFeedback / createBugReport', () => {
  it('sets feedback/{fresh id}, overwriting any id the caller set', async () => {
    const feedback = { id: 'mine', text: 'great' } as unknown as Feedback;

    const result = await createFeedback(feedback);

    expect(result).toEqual({ id: 'auto-1', text: 'great' });
    expect(getOpLog()).toEqual([
      { op: 'set', path: 'feedback/auto-1', data: { id: 'auto-1', text: 'great' } },
    ]);
    expect(readDoc('feedback/auto-1')).toEqual({ id: 'auto-1', text: 'great' });
  });

  it('sets bugs/{fresh id}', async () => {
    const result = await createBugReport({ text: 'crash' } as unknown as BugReport);

    expect(result).toEqual({ id: 'auto-1', text: 'crash' });
    expect(getOpLog()).toEqual([
      { op: 'set', path: 'bugs/auto-1', data: { id: 'auto-1', text: 'crash' } },
    ]);
  });

  it('rejects when the write fails', async () => {
    failNext('set', new Error('permission-denied'), 'bugs/auto-1');
    await expect(createBugReport({ text: 'crash' } as unknown as BugReport)).rejects.toThrow(
      'permission-denied',
    );
  });
});
