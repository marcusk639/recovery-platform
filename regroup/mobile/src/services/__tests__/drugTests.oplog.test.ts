/**
 * drugTests.ts against the normalized Firebase operation log.
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
  seedQuery,
} from '../../../__mocks__/firebase-modular/log';
import {
  getDrugTestsForGuest,
  getDrugTestsForHouse,
  getPositiveTestCount,
  logDrugTest,
} from '../drugTests';
import { DrugTest } from '../../entities/DrugTest';
import { logException } from '../../util/logging';

const NOW = '2026-10-07T17:00:00.000Z';

beforeEach(() => {
  resetOpLog();
  jest.useFakeTimers({ now: new Date(NOW) });
});

afterEach(() => {
  jest.useRealTimers();
});

type Input = Omit<DrugTest, 'id' | 'createdAt' | 'escalationTriggered'>;
const input = (result: string) =>
  ({ guestId: 'g1', houseId: 'h1', testDate: '2026-10-07', result }) as unknown as Input;

describe('logDrugTest', () => {
  it('sets drug-tests/{auto id} with id, createdAt and no escalation for a negative', async () => {
    const record = await logDrugTest(input('negative'));

    const expected = {
      guestId: 'g1',
      houseId: 'h1',
      testDate: '2026-10-07',
      result: 'negative',
      id: 'auto-1',
      escalationTriggered: false,
      createdAt: NOW,
    };
    expect(record).toEqual(expected);
    expect(getOpLog()).toEqual([{ op: 'set', path: 'drug-tests/auto-1', data: expected }]);
  });

  it('flags escalation for a positive result', async () => {
    expect((await logDrugTest(input('positive'))).escalationTriggered).toBe(true);
    expect(readDoc('drug-tests/auto-1')?.escalationTriggered).toBe(true);
  });

  it('flags escalation for a refused test', async () => {
    expect((await logDrugTest(input('refused'))).escalationTriggered).toBe(true);
  });

  it('logs and rethrows a generic error when the write fails', async () => {
    const error = new Error('permission-denied');
    failNext('set', error, 'drug-tests/auto-1');

    await expect(logDrugTest(input('negative'))).rejects.toThrow('Failed to log drug test result');
    expect(logException).toHaveBeenCalledWith(error);
  });
});

describe('history queries', () => {
  beforeEach(() => {
    seedQuery('drug-tests', [
      { id: 't1', guestId: 'g1', houseId: 'h1', testDate: '2026-10-01', result: 'negative' },
      { id: 't2', guestId: 'g1', houseId: 'h1', testDate: '2026-10-05', result: 'positive' },
      { id: 't3', guestId: 'g2', houseId: 'h1', testDate: '2026-10-03', result: 'refused' },
      { id: 't4', guestId: 'g1', houseId: 'h1', testDate: '2026-05-01', result: 'positive' },
    ]);
  });

  it('lists a guest’s tests newest first with the default limit', async () => {
    const tests = await getDrugTestsForGuest('g1');

    expect(tests.map((t) => t.testDate)).toEqual(['2026-10-05', '2026-10-01', '2026-05-01']);
    expect(getOpLog()).toEqual([
      {
        op: 'getDocs',
        path: 'drug-tests',
        constraints: [
          ['where', 'guestId', '==', 'g1'],
          ['orderBy', 'testDate', 'desc'],
          ['limit', 50],
        ],
      },
    ]);
  });

  it('lists a house’s tests newest first with the given limit', async () => {
    const tests = await getDrugTestsForHouse('h1', 2);

    expect(tests.map((t) => t.testDate)).toEqual(['2026-10-05', '2026-10-03']);
    expect(getOpLog()).toEqual([
      {
        op: 'getDocs',
        path: 'drug-tests',
        constraints: [
          ['where', 'houseId', '==', 'h1'],
          ['orderBy', 'testDate', 'desc'],
          ['limit', 2],
        ],
      },
    ]);
  });

  it('uses 100 as the default house limit', async () => {
    await getDrugTestsForHouse('h1');
    expect(getOpLog()[0].constraints?.[2]).toEqual(['limit', 100]);
  });

  it('counts positive or refused tests since the cutoff (ISO string compare)', async () => {
    expect(await getPositiveTestCount('g1')).toBe(1);

    const since = new Date(NOW);
    since.setDate(since.getDate() - 90);
    expect(getOpLog()).toEqual([
      {
        op: 'getDocs',
        path: 'drug-tests',
        constraints: [
          ['where', 'guestId', '==', 'g1'],
          ['where', 'result', 'in', ['positive', 'refused']],
          ['where', 'testDate', '>=', since.toISOString()],
        ],
      },
    ]);
  });

  it('wraps a guest query failure', async () => {
    failNext('getDocs', new Error('unavailable'), 'drug-tests');
    await expect(getDrugTestsForGuest('g1')).rejects.toThrow('Failed to fetch drug test history');
  });

  it('wraps a house query failure', async () => {
    failNext('getDocs', new Error('unavailable'), 'drug-tests');
    await expect(getDrugTestsForHouse('h1')).rejects.toThrow('Failed to fetch house drug tests');
  });

  it('wraps a count query failure', async () => {
    failNext('getDocs', new Error('unavailable'), 'drug-tests');
    await expect(getPositiveTestCount('g1')).rejects.toThrow('Failed to count positive tests');
  });
});
