/**
 * oxford/index.ts election, EES and financial-record adapters against the
 * normalized Firebase operation log (officers: oxford-index-officers.oplog
 * .test.ts; business meetings and votes: oxford-index.oplog.test.ts).
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
  resetOpLog,
  seedDoc,
  seedQuery,
} from '../../../__mocks__/firebase-modular/log';
import {
  createEESTransaction,
  createElection,
  createFinancialRecord,
  getEESTransactions,
  getElections,
  getFinancialRecords,
  updateElection,
} from '../oxford';
import { logException } from '../../util/logging';

const ELECTIONS = 'houses/h1/elections';
const RECORDS = 'houses/h1/financial-records';
const as = <T>(fields: Record<string, unknown>) => fields as unknown as T;

beforeEach(() => {
  resetOpLog();
});

describe('elections', () => {
  it('getElections orders by conductedAt desc, doc id winning over a stored id', async () => {
    seedQuery(ELECTIONS, [{ id: 'e1', conductedAt: '2026-01-01' }]);
    seedDoc(`${ELECTIONS}/e2`, { id: 'stale', conductedAt: '2026-06-01' });

    expect(await getElections('h1')).toEqual([
      { id: 'e2', conductedAt: '2026-06-01' },
      { id: 'e1', conductedAt: '2026-01-01' },
    ]);
    expect(getOpLog()).toEqual([
      { op: 'getDocs', path: ELECTIONS, constraints: [['orderBy', 'conductedAt', 'desc']] },
    ]);
  });

  it('getElections wraps a failed read', async () => {
    const error = new Error('unavailable');
    failNext('getDocs', error, ELECTIONS);

    await expect(getElections('h1')).rejects.toThrow('Failed to load elections');
    expect(logException).toHaveBeenCalledWith(error);
  });

  it('createElection sets {auto id} under election.houseId', async () => {
    expect(await createElection(as({ houseId: 'h1', role: 'treasurer' }))).toEqual({
      houseId: 'h1',
      role: 'treasurer',
      id: 'auto-1',
    });
    expect(getOpLog()).toEqual([
      {
        op: 'set',
        path: `${ELECTIONS}/auto-1`,
        data: { houseId: 'h1', role: 'treasurer', id: 'auto-1' },
      },
    ]);
  });

  it('createElection wraps a failed write', async () => {
    failNext('set', new Error('denied'), `${ELECTIONS}/auto-1`);
    await expect(createElection(as({ houseId: 'h1' }))).rejects.toThrow(
      'Failed to create election',
    );
  });

  it('updateElection updates with every given field, houseId included', async () => {
    seedDoc(`${ELECTIONS}/e1`, {});

    await updateElection('e1', as({ houseId: 'h1', winnerId: 'g1' }));

    expect(getOpLog()).toEqual([
      { op: 'update', path: `${ELECTIONS}/e1`, data: { houseId: 'h1', winnerId: 'g1' } },
    ]);
  });

  it('updateElection refuses without a houseId, before any op', async () => {
    await expect(updateElection('e1', {})).rejects.toThrow(
      'houseId required to update election in subcollection',
    );
    expect(getOpLog()).toEqual([]);
  });

  it('updateElection wraps a failed update', async () => {
    await expect(updateElection('gone', { houseId: 'h1' })).rejects.toThrow(
      'Failed to update election',
    );
  });
});

describe('EES transactions', () => {
  it('getEESTransactions queries top-level ees-records by house, newest first', async () => {
    seedQuery('ees-records', [
      { id: 't1', houseId: 'h1', createdAt: '2026-10-01' },
      { id: 't2', houseId: 'h1', createdAt: '2026-10-02' },
      { id: 't3', houseId: 'h2', createdAt: '2026-10-03' },
    ]);

    expect((await getEESTransactions('h1')).map((t) => t.id)).toEqual(['t2', 't1']);
    expect(getOpLog()).toEqual([
      {
        op: 'getDocs',
        path: 'ees-records',
        constraints: [
          ['where', 'houseId', '==', 'h1'],
          ['orderBy', 'createdAt', 'desc'],
        ],
      },
    ]);
  });

  it('getEESTransactions wraps a failed read', async () => {
    failNext('getDocs', new Error('unavailable'), 'ees-records');
    await expect(getEESTransactions('h1')).rejects.toThrow('Failed to load EES transactions');
  });

  it('createEESTransaction sets ees-records/{auto id}', async () => {
    expect(await createEESTransaction(as({ houseId: 'h1', amount: 10 }))).toEqual({
      houseId: 'h1',
      amount: 10,
      id: 'auto-1',
    });
    expect(getOpLog()).toEqual([
      { op: 'set', path: 'ees-records/auto-1', data: { houseId: 'h1', amount: 10, id: 'auto-1' } },
    ]);
  });

  it('createEESTransaction wraps a failed write', async () => {
    failNext('set', new Error('denied'), 'ees-records/auto-1');
    await expect(createEESTransaction(as({ houseId: 'h1' }))).rejects.toThrow(
      'Failed to create EES transaction',
    );
  });
});

describe('financial records', () => {
  it('getFinancialRecords orders the house records by period desc', async () => {
    seedQuery(RECORDS, [
      { id: 'r1', period: '2026-09-28' },
      { id: 'r2', period: '2026-10-05' },
    ]);

    expect((await getFinancialRecords('h1')).map((r) => r.id)).toEqual(['r2', 'r1']);
    expect(getOpLog()).toEqual([
      { op: 'getDocs', path: RECORDS, constraints: [['orderBy', 'period', 'desc']] },
    ]);
  });

  it('getFinancialRecords wraps a failed read', async () => {
    failNext('getDocs', new Error('unavailable'), RECORDS);
    await expect(getFinancialRecords('h1')).rejects.toThrow('Failed to load financial records');
  });

  it('createFinancialRecord sets {auto id} under record.houseId', async () => {
    expect(await createFinancialRecord(as({ houseId: 'h1', period: '2026-10-05' }))).toEqual({
      houseId: 'h1',
      period: '2026-10-05',
      id: 'auto-1',
    });
    expect(getOpLog()).toEqual([
      {
        op: 'set',
        path: `${RECORDS}/auto-1`,
        data: { houseId: 'h1', period: '2026-10-05', id: 'auto-1' },
      },
    ]);
  });

  it('createFinancialRecord wraps a failed write', async () => {
    failNext('set', new Error('denied'), `${RECORDS}/auto-1`);
    await expect(createFinancialRecord(as({ houseId: 'h1' }))).rejects.toThrow(
      'Failed to create financial record',
    );
  });
});
