/**
 * reportingService.ts against the normalized Firebase operation log.
 *
 * Characterization for the React Native 0.88 upgrade (plan Task 10 Step 1).
 * This file stays byte-identical through the Task 10 migration (group 10d): a
 * mapping mistake in the rewrite fails here instead of being copied into an
 * edited expectation. Assertions are on outcomes and log entries only, never
 * on mock call chains or snapshot shapes. Auth is not part of the log: the
 * signed-in user comes from the auth mock. Week starts are Sunday-anchored in
 * local time (jest.config.js pins TZ to America/Chicago).
 */
jest.mock('../../../firebase-setup', () => require('../../../__mocks__/firebase-modular/setup'));
jest.mock('@react-native-firebase/firestore', () =>
  require('../../../__mocks__/firebase-modular/firestore'),
);
jest.mock('@react-native-firebase/functions', () =>
  require('../../../__mocks__/firebase-modular/functions'),
);
jest.mock('@react-native-firebase/auth', () => require('../../../__mocks__/firebase-modular/auth'));
jest.mock('../../util/logging', () => ({ logException: jest.fn() }));

import { failNext, getOpLog, resetOpLog, seedQuery } from '../../../__mocks__/firebase-modular/log';
import { getComplianceTrend, getDischargeReport, getOccupancyReport } from '../reportingService';
import { Guest } from '../../entities/Guest';

const { setCurrentUser } = jest.requireMock<{ setCurrentUser: (user: unknown) => void }>(
  '@react-native-firebase/auth',
);

const stats = (choresCompleted: number, meetingsAttended: number) => ({
  choresCompleted,
  meetingsAttended,
});
const guests = (list: Record<string, unknown>[]) => list as unknown as Guest[];

beforeEach(() => {
  resetOpLog();
  setCurrentUser({ uid: 'u1' });
  // Wednesday 2026-10-07, noon local: weeks start 2026-09-27 and 2026-10-04.
  jest.useFakeTimers({ now: new Date(2026, 9, 7, 12, 0, 0) });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('getComplianceTrend', () => {
  it('queries the house per chunk of guests and rates each week client-side', async () => {
    seedQuery('week-summaries', [
      { id: 'a', houseId: 'h1', guestId: 'g1', startDate: '2026-10-04', stats: stats(1, 3) },
      { id: 'b', houseId: 'h1', guestId: 'g2', startDate: '2026-10-04', stats: stats(0, 1) },
      { id: 'c', houseId: 'h1', guestId: 'g1', startDate: '2026-09-27', stats: stats(2, 0) },
      { id: 'd', houseId: 'h1', guestId: 'g1', startDate: '2026-09-20', stats: stats(9, 9) },
      { id: 'e', houseId: 'h2', guestId: 'g2', startDate: '2026-10-04', stats: stats(9, 9) },
    ]);

    expect(await getComplianceTrend('h1', ['g1', 'g2'], 2)).toEqual({
      weeks: [
        { weekStart: '2026-09-27', choreRate: 0.5, meetingRate: 0, guestCount: 2 },
        { weekStart: '2026-10-04', choreRate: 0.5, meetingRate: 0.5, guestCount: 2 },
      ],
    });
    expect(getOpLog()).toEqual([
      {
        op: 'getDocs',
        path: 'week-summaries',
        constraints: [
          ['where', 'houseId', '==', 'h1'],
          ['where', 'guestId', 'in', ['g1', 'g2']],
        ],
      },
    ]);
  });

  it('splits more than 30 guests into one query per 30', async () => {
    const ids = Array.from({ length: 31 }, (_, i) => `g${i}`);

    await getComplianceTrend('h1', ids, 1);

    expect(getOpLog()).toEqual([
      {
        op: 'getDocs',
        path: 'week-summaries',
        constraints: [
          ['where', 'houseId', '==', 'h1'],
          ['where', 'guestId', 'in', ids.slice(0, 30)],
        ],
      },
      {
        op: 'getDocs',
        path: 'week-summaries',
        constraints: [
          ['where', 'houseId', '==', 'h1'],
          ['where', 'guestId', 'in', ['g30']],
        ],
      },
    ]);
  });

  it('returns no weeks without a read when there are no guests', async () => {
    expect(await getComplianceTrend('h1', [])).toEqual({ weeks: [] });
    expect(getOpLog()).toEqual([]);
  });

  it('refuses without a signed-in user, before any op', async () => {
    setCurrentUser(null);

    await expect(getComplianceTrend('h1', ['g1'])).rejects.toThrow(
      'getComplianceTrend: user not authenticated',
    );
    expect(getOpLog()).toEqual([]);
  });

  it('replaces a failed query with a generic error', async () => {
    failNext('getDocs', new Error('unavailable'), 'week-summaries');

    await expect(getComplianceTrend('h1', ['g1'])).rejects.toThrow(
      'Failed to fetch compliance trend data',
    );
  });
});

describe('reports computed from passed-in guests', () => {
  afterEach(() => {
    expect(getOpLog()).toEqual([]);
  });

  it('getOccupancyReport counts active guests of the house', async () => {
    const list = guests([
      { id: 'g1', houseId: 'h1', status: 'active' },
      { id: 'g2', houseId: 'h1', status: 'discharged' },
      { id: 'g3', houseId: 'h2', status: 'active' },
    ]);

    expect(await getOccupancyReport('h1', list, 4)).toEqual({
      activeCount: 1,
      capacity: 4,
      occupancyPct: 25,
    });
  });

  it('getOccupancyReport refuses without a signed-in user', async () => {
    setCurrentUser(null);
    await expect(getOccupancyReport('h1', [], 4)).rejects.toThrow(
      'getOccupancyReport: user not authenticated',
    );
  });

  it('getDischargeReport lists residents discharged within the period, newest first', async () => {
    const list = guests([
      {
        id: 'g1',
        houseId: 'h1',
        status: 'discharged',
        moveOutDate: '2026-09-20',
        displayName: 'A',
      },
      { id: 'g2', houseId: 'h1', status: 'discharged', moveOutDate: '2026-10-01', firstName: 'B' },
      { id: 'g3', houseId: 'h1', status: 'discharged', moveOutDate: '2026-05-01' },
      { id: 'g4', houseId: 'h1', status: 'active', moveOutDate: '2026-10-01' },
    ]);

    expect(await getDischargeReport('h1', list, 30)).toEqual({
      period: 30,
      residents: [
        { id: 'g2', displayName: 'B', movedOutDate: '2026-10-01' },
        { id: 'g1', displayName: 'A', movedOutDate: '2026-09-20' },
      ],
      count: 2,
    });
  });
});
