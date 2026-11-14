/**
 * treasury.ts against the normalized Firebase operation log.
 *
 * Characterization for the React Native 0.88 upgrade (plan Task 2). This file
 * stays byte-identical from Task 2 to the end of Task 10, the modular Firebase
 * migration. Assertions are on outcomes and log entries only.
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
import {
  approveRecord,
  createFinancialRecord,
  getCurrentWeekRecord,
  getEESIncomeForWeek,
  getFinancialRecord,
  getFinancialRecords,
  getPreviousWeekRecord,
  rejectRecord,
  submitForApproval,
  updateFinancialRecord,
} from '../treasury';

const ISO = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
const RECORDS = 'houses/h1/financial-records';

beforeEach(() => {
  resetOpLog();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('reads', () => {
  it('lists records newest period first with the limit', async () => {
    seedQuery(RECORDS, [
      { id: 'r1', period: '2026-09-28' },
      { id: 'r2', period: '2026-10-05' },
    ]);

    const records = await getFinancialRecords('h1', 5);

    expect(records).toEqual([
      { id: 'r2', period: '2026-10-05' },
      { id: 'r1', period: '2026-09-28' },
    ]);
    expect(getOpLog()).toEqual([
      {
        op: 'getDocs',
        path: RECORDS,
        constraints: [
          ['orderBy', 'period', 'desc'],
          ['limit', 5],
        ],
      },
    ]);
  });

  it('returns a record when it exists', async () => {
    seedDoc(`${RECORDS}/r1`, { period: '2026-10-05', total: 100 });

    expect(await getFinancialRecord('h1', 'r1')).toEqual({
      id: 'r1',
      period: '2026-10-05',
      total: 100,
    });
    expect(getOpLog()).toEqual([{ op: 'get', path: `${RECORDS}/r1` }]);
  });

  it('returns null when the record does not exist', async () => {
    expect(await getFinancialRecord('h1', 'missing')).toBeNull();
  });

  it("finds this week's and last week's record by the Monday period", async () => {
    jest.useFakeTimers({ now: new Date('2026-10-07T12:00:00') });
    seedQuery(RECORDS, [
      { id: 'this', period: '2026-10-05' },
      { id: 'last', period: '2026-09-28' },
    ]);

    expect((await getCurrentWeekRecord('h1'))?.id).toBe('this');
    expect((await getPreviousWeekRecord('h1'))?.id).toBe('last');
    expect(getOpLog()).toEqual([
      {
        op: 'getDocs',
        path: RECORDS,
        constraints: [
          ['where', 'period', '==', '2026-10-05'],
          ['limit', 1],
        ],
      },
      {
        op: 'getDocs',
        path: RECORDS,
        constraints: [
          ['where', 'period', '==', '2026-09-28'],
          ['limit', 1],
        ],
      },
    ]);
  });

  it('returns null when there is no record for the week', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-07T12:00:00') });
    expect(await getCurrentWeekRecord('h1')).toBeNull();
  });

  it("sums the house's EES amounts for the week", async () => {
    seedQuery('ees-records', [
      { id: 'e1', houseId: 'h1', weekStart: '2026-10-05', amount: 120 },
      { id: 'e2', houseId: 'h1', weekStart: '2026-10-05' },
      { id: 'e3', houseId: 'h1', weekStart: '2026-09-28', amount: 999 },
      { id: 'e4', houseId: 'h2', weekStart: '2026-10-05', amount: 999 },
    ]);

    expect(await getEESIncomeForWeek('h1', '2026-10-05')).toBe(120);
    expect(getOpLog()).toEqual([
      {
        op: 'getDocs',
        path: 'ees-records',
        constraints: [
          ['where', 'houseId', '==', 'h1'],
          ['where', 'weekStart', '==', '2026-10-05'],
        ],
      },
    ]);
  });

  it('reports 0 EES income when the read fails', async () => {
    failNext('getDocs', new Error('unavailable'), 'ees-records');
    expect(await getEESIncomeForWeek('h1', '2026-10-05')).toBe(0);
  });
});

describe('writes', () => {
  it('creates a record at a generated id that it also stores', async () => {
    const created = await createFinancialRecord('h1', {
      period: '2026-10-05',
      status: 'draft',
    } as any);

    expect(created).toEqual({ id: 'auto-1', period: '2026-10-05', status: 'draft' });
    expect(getOpLog()).toEqual([
      {
        op: 'set',
        path: `${RECORDS}/auto-1`,
        data: { period: '2026-10-05', status: 'draft', id: 'auto-1' },
      },
    ]);
  });

  it('updates the given fields', async () => {
    seedDoc(`${RECORDS}/r1`, { status: 'draft' });

    await updateFinancialRecord('h1', 'r1', { notes: 'n' } as any);

    expect(getOpLog()).toEqual([{ op: 'update', path: `${RECORDS}/r1`, data: { notes: 'n' } }]);
  });

  it('submits, approves and rejects with exactly their fields', async () => {
    seedDoc(`${RECORDS}/r1`, { status: 'draft' });

    await submitForApproval('h1', 'r1');
    await approveRecord('h1', 'r1', 'u1');
    await rejectRecord('h1', 'r1', 'wrong total');

    expect(getOpLog()).toEqual([
      { op: 'update', path: `${RECORDS}/r1`, data: { status: 'submitted', submittedAt: ISO } },
      {
        op: 'update',
        path: `${RECORDS}/r1`,
        data: { status: 'approved', approvedBy: 'u1', approvedAt: ISO },
      },
      {
        op: 'update',
        path: `${RECORDS}/r1`,
        data: { status: 'rejected', rejectionReason: 'wrong total' },
      },
    ]);
    expect(readDoc(`${RECORDS}/r1`)?.status).toBe('rejected');
  });

  it('reports a failed write with its message', async () => {
    failNext('update', new Error('permission-denied'), `${RECORDS}/r1`);
    await expect(approveRecord('h1', 'r1', 'u1')).rejects.toThrow(
      'Failed to approve financial record',
    );
  });
});
