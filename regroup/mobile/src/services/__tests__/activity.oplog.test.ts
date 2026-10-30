/**
 * activity.ts logging and queries against the normalized Firebase operation log.
 *
 * Characterization for the React Native 0.88 upgrade (plan Task 2). This file
 * stays byte-identical from Task 2 to the end of Task 10, the modular Firebase
 * migration: a mapping mistake in the rewrite fails here instead of being
 * copied into an edited expectation. Assertions are on outcomes and log
 * entries only, never on mock call chains or snapshot shapes.
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
  resetOpLog,
  seedDoc,
  seedQuery,
} from '../../../__mocks__/firebase-modular/log';
import {
  getActivities,
  getActivitiesPage,
  getHouseActivities,
  logActivity,
  subscribeToHouseActivities,
} from '../activity';
import { ActivityType } from '../../entities/ActivityModel';

const SERVER_TIME = { __fv: 'serverTimestamp' };
const LISTED = ['active', 'disputed', 'resolved'];
const AT = new Date('2026-10-05T15:00:00.000Z');

function firestoreError(code: string): Error {
  return Object.assign(new Error(`[${code}]`), { code });
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  resetOpLog();
});

describe('logActivity', () => {
  const data = { choreName: 'dishes' } as any;

  it('stamps residentUid from an existing guest doc', async () => {
    seedDoc('guests/g1', { userId: 'u1' });

    const activity = await logActivity('g1', 'h1', ActivityType.CHORE, data, 'u1', AT);

    const written = {
      guestId: 'g1',
      houseId: 'h1',
      type: ActivityType.CHORE,
      timestamp: AT,
      data,
      loggedBy: 'u1',
      loggedAt: SERVER_TIME,
      verified: false,
      status: 'active',
      residentUid: 'u1',
    };
    expect(getOpLog()).toEqual([
      { op: 'get', path: 'guests/g1' },
      { op: 'add', path: 'activities', data: written },
    ]);
    expect(activity.id).toBe('auto-1');
    expect(activity.residentUid).toBe('u1');
  });

  it('omits residentUid when the guest doc does not exist', async () => {
    await logActivity('g1', 'h1', ActivityType.CHORE, data, 'u1', AT);

    expect(getOpLog()[1].data).not.toHaveProperty('residentUid');
  });

  it('omits residentUid when the guest doc has no account', async () => {
    seedDoc('guests/g1', { userId: '' });

    await logActivity('g1', 'h1', ActivityType.CHORE, data, 'u1', AT);

    expect(getOpLog()[1].data).not.toHaveProperty('residentUid');
  });

  it('retries without residentUid when the rules refuse the stamp', async () => {
    seedDoc('guests/g1', { userId: 'u1' });
    failNext('add', firestoreError('firestore/permission-denied'), 'activities');

    const activity = await logActivity('g1', 'h1', ActivityType.CHORE, data, 'u1', AT);

    const log = getOpLog();
    expect(log.map((e) => e.op)).toEqual(['get', 'add', 'add']);
    expect(log[1].data).toHaveProperty('residentUid', 'u1');
    expect(log[2].data).not.toHaveProperty('residentUid');
    expect(activity.id).toBe('auto-1');
  });

  it('rethrows a refusal when it sent no stamp', async () => {
    failNext('add', firestoreError('firestore/permission-denied'), 'activities');

    await expect(logActivity('g1', 'h1', ActivityType.CHORE, data, 'u1', AT)).rejects.toMatchObject(
      {
        code: 'firestore/permission-denied',
      },
    );
    expect(getOpLog().map((e) => e.op)).toEqual(['get', 'add']);
  });
});

describe('getActivities / getHouseActivities', () => {
  beforeEach(() => {
    seedQuery('activities', [
      {
        id: 'a1',
        guestId: 'g1',
        houseId: 'h1',
        status: 'active',
        type: 'chore',
        timestamp: new Date('2026-10-02T00:00:00Z'),
      },
      {
        id: 'a2',
        guestId: 'g1',
        houseId: 'h1',
        status: 'resolved',
        incomplete: true,
        type: 'chore',
        timestamp: new Date('2026-10-03T00:00:00Z'),
      },
      {
        id: 'a3',
        guestId: 'g1',
        houseId: 'h1',
        status: 'deleted',
        type: 'chore',
        timestamp: new Date('2026-10-04T00:00:00Z'),
      },
      {
        id: 'a4',
        guestId: 'g1',
        houseId: 'h1',
        status: 'disputed',
        type: 'meeting',
        timestamp: new Date('2026-10-05T00:00:00Z'),
      },
      {
        id: 'a5',
        guestId: 'g2',
        houseId: 'h1',
        status: 'active',
        type: 'chore',
        timestamp: new Date('2026-10-06T00:00:00Z'),
      },
    ]);
  });

  it('queries the guest range with the listed statuses, newest first, counted only', async () => {
    const start = new Date('2026-10-01T00:00:00Z');
    const end = new Date('2026-10-08T00:00:00Z');

    const result = await getActivities('g1', start, end);

    expect(result.map((a) => a.id)).toEqual(['a4', 'a1']);
    expect(result[0].timestamp).toEqual(new Date('2026-10-05T00:00:00Z'));
    expect(getOpLog()).toEqual([
      {
        op: 'getDocs',
        path: 'activities',
        constraints: [
          ['where', 'guestId', '==', 'g1'],
          ['where', 'timestamp', '>=', start],
          ['where', 'timestamp', '<', end],
          ['where', 'status', 'in', LISTED],
          ['orderBy', 'timestamp', 'desc'],
        ],
      },
    ]);
  });

  it('adds the type filter before the ordering', async () => {
    const start = new Date('2026-10-01T00:00:00Z');
    const end = new Date('2026-10-08T00:00:00Z');

    const result = await getActivities('g1', start, end, ActivityType.MEETING);

    expect(result.map((a) => a.id)).toEqual(['a4']);
    expect(getOpLog()[0].constraints?.slice(4)).toEqual([
      ['where', 'type', '==', ActivityType.MEETING],
      ['orderBy', 'timestamp', 'desc'],
    ]);
  });

  it('queries the house feed with the limit', async () => {
    const result = await getHouseActivities('h1', 3);

    expect(result.map((a) => a.id)).toEqual(['a5', 'a4']);
    expect(getOpLog()[0]).toEqual({
      op: 'getDocs',
      path: 'activities',
      constraints: [
        ['where', 'houseId', '==', 'h1'],
        ['where', 'status', 'in', LISTED],
        ['orderBy', 'timestamp', 'desc'],
        ['limit', 3],
      ],
    });
  });

  it('pages with pageSize + 1 and a startAfter cursor', async () => {
    const start = new Date('2026-10-01T00:00:00Z');
    const end = new Date('2026-10-08T00:00:00Z');

    const first = await getActivitiesPage('g1', start, end, 2);
    expect(first.hasMore).toBe(true);
    expect(first.activities.map((a) => a.id)).toEqual(['a4']);

    const second = await getActivitiesPage('g1', start, end, 2, first.nextCursor);
    expect(second.hasMore).toBe(false);
    expect(second.activities.map((a) => a.id)).toEqual(['a1']);

    const [one, two] = getOpLog();
    expect(one.constraints?.slice(4)).toEqual([
      ['orderBy', 'timestamp', 'desc'],
      ['limit', 3],
    ]);
    expect(two.constraints?.slice(4)).toEqual([
      ['orderBy', 'timestamp', 'desc'],
      ['startAfter', { __snap: 'activities/a2' }],
      ['limit', 3],
    ]);
  });

  it('listens to the house feed with the same constraints', async () => {
    const onUpdate = jest.fn();

    const unsubscribe = subscribeToHouseActivities('h1', onUpdate, 10);
    await flush();

    expect(getOpLog()).toEqual([
      {
        op: 'listen',
        path: 'activities',
        constraints: [
          ['where', 'houseId', '==', 'h1'],
          ['where', 'status', 'in', LISTED],
          ['orderBy', 'timestamp', 'desc'],
          ['limit', 10],
        ],
      },
    ]);
    expect(onUpdate.mock.calls[0][0].map((a: any) => a.id)).toEqual(['a5', 'a4', 'a1']);
    unsubscribe();
  });
});
