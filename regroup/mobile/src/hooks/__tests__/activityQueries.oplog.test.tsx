/**
 * Activity and week-summary hook queries, guest listener and the typed page
 * query against the normalized Firebase operation log.
 *
 * Characterization for the React Native 0.88 upgrade (plan Task 10b, from the
 * independent review's coverage gaps): verified to pass on both the namespaced
 * code and the modular rewrite, and kept byte-identical through Task 10f.
 * Assertions are on log entries only: paths and constraints in order.
 */
jest.mock('../../../firebase-setup', () => require('../../../__mocks__/firebase-modular/setup'));
jest.mock('@react-native-firebase/firestore', () =>
  require('../../../__mocks__/firebase-modular/firestore'),
);
jest.mock('@react-native-firebase/functions', () =>
  require('../../../__mocks__/firebase-modular/functions'),
);
jest.mock('../../util/logging', () => ({ logException: jest.fn() }));

import { act, renderHook, waitFor } from '@testing-library/react-native';
import { getOpLog, resetOpLog } from '../../../__mocks__/firebase-modular/log';
import { ActivityStatus, ActivityType } from '../../entities/ActivityModel';
import { getActivitiesOnce, useActivities, useActivityCount } from '../activity/useActivities';
import {
  getWeekSummaryOnce,
  useWeekSummary,
  useWeekSummaryHistory,
} from '../activity/useWeekSummary';
import { getActivitiesPage } from '../../services/activity';
import { subscribeToGuest } from '../../services/guest';

const START = '2026-10-05';
const END = '2026-10-11';

beforeEach(() => {
  resetOpLog();
});

describe('activity hooks', () => {
  it('useActivities: guest, house, type, status, range, newest first, limited', async () => {
    renderHook(() =>
      useActivities({
        guestId: 'g1',
        houseId: 'h1',
        type: ActivityType.CHORE,
        status: ActivityStatus.DISPUTED,
        startDate: START,
        endDate: END,
        limit: 25,
      }),
    );

    await waitFor(() => expect(getOpLog()).toHaveLength(1));
    expect(getOpLog()).toEqual([
      {
        op: 'listen',
        path: 'activities',
        constraints: [
          ['where', 'guestId', '==', 'g1'],
          ['where', 'houseId', '==', 'h1'],
          ['where', 'type', '==', ActivityType.CHORE],
          ['where', 'status', '==', ActivityStatus.DISPUTED],
          ['where', 'timestamp', '>=', new Date(START)],
          ['where', 'timestamp', '<=', new Date(END)],
          ['orderBy', 'timestamp', 'desc'],
          ['limit', 25],
        ],
      },
    ]);
  });

  it('useActivities: a house-only list leaves out the optional filters', async () => {
    renderHook(() => useActivities({ houseId: 'h1' }));

    await waitFor(() => expect(getOpLog()).toHaveLength(1));
    expect(getOpLog()[0].constraints).toEqual([
      ['where', 'houseId', '==', 'h1'],
      ['orderBy', 'timestamp', 'desc'],
      ['limit', 100],
    ]);
  });

  it('useActivityCount: the same filters, with no ordering or limit', async () => {
    renderHook(() =>
      useActivityCount({
        guestId: 'g1',
        houseId: 'h1',
        type: ActivityType.MEETING,
        status: ActivityStatus.DISPUTED,
        startDate: START,
        endDate: END,
      }),
    );

    await waitFor(() => expect(getOpLog()).toHaveLength(1));
    expect(getOpLog()).toEqual([
      {
        op: 'listen',
        path: 'activities',
        constraints: [
          ['where', 'guestId', '==', 'g1'],
          ['where', 'houseId', '==', 'h1'],
          ['where', 'type', '==', ActivityType.MEETING],
          ['where', 'status', '==', ActivityStatus.DISPUTED],
          ['where', 'timestamp', '>=', new Date(START)],
          ['where', 'timestamp', '<=', new Date(END)],
        ],
      },
    ]);
  });

  it('getActivitiesOnce: reads once with the useActivities query', async () => {
    await getActivitiesOnce({ guestId: 'g1', houseId: 'h1', limit: 10 });

    expect(getOpLog()).toEqual([
      {
        op: 'getDocs',
        path: 'activities',
        constraints: [
          ['where', 'guestId', '==', 'g1'],
          ['where', 'houseId', '==', 'h1'],
          ['orderBy', 'timestamp', 'desc'],
          ['limit', 10],
        ],
      },
    ]);
  });

  it('getActivitiesPage: the type filter comes before ordering, cursor and limit', async () => {
    const start = new Date('2026-10-01T00:00:00Z');
    const end = new Date('2026-10-08T00:00:00Z');

    await getActivitiesPage('g1', 'h1', start, end, 2, undefined, ActivityType.WORK);

    expect(getOpLog()[0].constraints?.slice(5)).toEqual([
      ['where', 'type', '==', ActivityType.WORK],
      ['orderBy', 'timestamp', 'desc'],
      ['limit', 3],
    ]);
  });
});

describe('week-summary hooks', () => {
  it('useWeekSummary listens to week-summaries/{guestId}_{weekStart}', async () => {
    renderHook(() => useWeekSummary('g1', 'h1', START));

    await waitFor(() => expect(getOpLog()).toHaveLength(1));
    expect(getOpLog()).toEqual([{ op: 'listen', path: `week-summaries/g1_${START}` }]);
  });

  it('getWeekSummaryOnce reads the same doc once', async () => {
    await getWeekSummaryOnce('g1', 'h1', START);

    expect(getOpLog()).toEqual([{ op: 'get', path: `week-summaries/g1_${START}` }]);
  });

  it('useWeekSummaryHistory: guest, house, newest week first, limited', async () => {
    renderHook(() => useWeekSummaryHistory('g1', 'h1', 6));

    await waitFor(() => expect(getOpLog()).toHaveLength(1));
    expect(getOpLog()).toEqual([
      {
        op: 'listen',
        path: 'week-summaries',
        constraints: [
          ['where', 'guestId', '==', 'g1'],
          ['where', 'houseId', '==', 'h1'],
          ['orderBy', 'startDate', 'desc'],
          ['limit', 6],
        ],
      },
    ]);
  });
});

describe('guest listener', () => {
  it('subscribeToGuest listens to guests/{id}', async () => {
    const unsubscribe = subscribeToGuest({ id: 'g1' } as never, jest.fn());
    await act(async () => {});

    expect(getOpLog()).toEqual([{ op: 'listen', path: 'guests/g1' }]);
    unsubscribe();
  });
});
