/**
 * oxford/ees.ts against the normalized Firebase operation log.
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
  createEESRecords,
  getEESRecords,
  getEESRecordsForRecentWeeks,
  markEESPaid,
} from '../oxford/ees';

const ISO = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

beforeEach(() => {
  resetOpLog();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('createEESRecords', () => {
  it('writes one unpaid payment record per guest in a single batch', async () => {
    await createEESRecords('h1', '2026-10-05', ['g1', 'g2'], 42.5);

    const record = (id: string, guestId: string) => ({
      id,
      guestId,
      houseId: 'h1',
      weekStart: '2026-10-05',
      amount: 42.5,
      paid: false,
      createdAt: ISO,
      type: 'payment',
    });
    expect(getOpLog()).toEqual([
      { op: 'batch.set', path: 'ees-records/auto-1', data: record('auto-1', 'g1') },
      { op: 'batch.set', path: 'ees-records/auto-2', data: record('auto-2', 'g2') },
      { op: 'batch.commit', path: '' },
    ]);
    expect(readDoc('ees-records/auto-2')).toEqual(
      expect.objectContaining({ guestId: 'g2', paid: false }),
    );
  });

  it('commits an empty batch for no guests', async () => {
    await createEESRecords('h1', '2026-10-05', [], 10);
    expect(getOpLog()).toEqual([{ op: 'batch.commit', path: '' }]);
  });

  it('reports a failed commit and stores nothing', async () => {
    failNext('batch.commit', new Error('unavailable'));

    await expect(createEESRecords('h1', '2026-10-05', ['g1'], 10)).rejects.toThrow(
      'Failed to create EES records',
    );
    expect(readDoc('ees-records/auto-1')).toBeUndefined();
  });
});

describe('reads and markEESPaid', () => {
  it("reads the house's records for one week", async () => {
    seedQuery('ees-records', [
      { id: 'e1', houseId: 'h1', weekStart: '2026-10-05', amount: 10 },
      { id: 'e2', houseId: 'h1', weekStart: '2026-09-28', amount: 10 },
    ]);

    const records = await getEESRecords('h1', '2026-10-05');

    expect(records).toEqual([{ id: 'e1', houseId: 'h1', weekStart: '2026-10-05', amount: 10 }]);
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

  it('reads recent weeks with one in query, at most 10 Mondays', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-07T12:00:00Z') });

    await getEESRecordsForRecentWeeks('h1', 3);
    await getEESRecordsForRecentWeeks('h1', 50);

    const [three, capped] = getOpLog();
    expect(three.constraints).toEqual([
      ['where', 'houseId', '==', 'h1'],
      ['where', 'weekStart', 'in', ['2026-10-05', '2026-09-28', '2026-09-21']],
    ]);
    expect((capped.constraints?.[1][3] as string[]).length).toBe(10);
  });

  it('marks a record paid with paidAt', async () => {
    seedDoc('ees-records/e1', { paid: false, amount: 10 });

    await markEESPaid('e1');

    expect(getOpLog()).toEqual([
      { op: 'update', path: 'ees-records/e1', data: { paid: true, paidAt: ISO } },
    ]);
    expect(readDoc('ees-records/e1')).toEqual(expect.objectContaining({ paid: true, amount: 10 }));
  });
});
