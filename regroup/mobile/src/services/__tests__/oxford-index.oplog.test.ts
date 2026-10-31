/**
 * oxford/index.ts business-meeting and vote adapters against the normalized
 * Firebase operation log (officers: oxford-index-officers.oplog.test.ts;
 * elections, EES and financial records: oxford-index-records.oplog.test.ts).
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
  seedDoc,
  seedQuery,
} from '../../../__mocks__/firebase-modular/log';
import {
  createBusinessMeeting,
  deleteBusinessMeeting,
  getBusinessMeetings,
  getVotesForMeeting,
  updateBusinessMeeting,
} from '../oxford';
import { logException } from '../../util/logging';

const MEETINGS = 'houses/h1/business-meetings';
const as = <T>(fields: Record<string, unknown>) => fields as unknown as T;

beforeEach(() => {
  resetOpLog();
});

describe('business meetings', () => {
  it('getBusinessMeetings orders by scheduledDate desc, without a limit by default', async () => {
    seedQuery(MEETINGS, [
      { id: 'm1', scheduledDate: '2026-09-01' },
      { id: 'm2', scheduledDate: '2026-10-01' },
    ]);

    expect((await getBusinessMeetings('h1')).map((m) => m.id)).toEqual(['m2', 'm1']);
    expect(getOpLog()).toEqual([
      { op: 'getDocs', path: MEETINGS, constraints: [['orderBy', 'scheduledDate', 'desc']] },
    ]);
  });

  it('getBusinessMeetings adds the given limit', async () => {
    await getBusinessMeetings('h1', 5);
    expect(getOpLog()).toEqual([
      {
        op: 'getDocs',
        path: MEETINGS,
        constraints: [
          ['orderBy', 'scheduledDate', 'desc'],
          ['limit', 5],
        ],
      },
    ]);
  });

  it('getBusinessMeetings wraps a failed read', async () => {
    const error = new Error('unavailable');
    failNext('getDocs', error, MEETINGS);

    await expect(getBusinessMeetings('h1')).rejects.toThrow('Failed to load business meetings');
    expect(logException).toHaveBeenCalledWith(error);
  });

  it('createBusinessMeeting sets {auto id} under meeting.houseId (no createdAt added)', async () => {
    const result = await createBusinessMeeting(as({ houseId: 'h1', scheduledDate: '2026-10-10' }));

    expect(result).toEqual({ houseId: 'h1', scheduledDate: '2026-10-10', id: 'auto-1' });
    expect(getOpLog()).toEqual([
      {
        op: 'set',
        path: `${MEETINGS}/auto-1`,
        data: { houseId: 'h1', scheduledDate: '2026-10-10', id: 'auto-1' },
      },
    ]);
  });

  it('createBusinessMeeting wraps a failed write', async () => {
    failNext('set', new Error('permission-denied'), `${MEETINGS}/auto-1`);
    await expect(createBusinessMeeting(as({ houseId: 'h1' }))).rejects.toThrow(
      'Failed to create business meeting',
    );
  });

  it('updateBusinessMeeting updates with every given field, houseId included', async () => {
    seedDoc(`${MEETINGS}/m1`, { scheduledDate: '2026-10-01' });

    await updateBusinessMeeting('m1', as({ houseId: 'h1', minutes: 'ok' }));

    expect(getOpLog()).toEqual([
      { op: 'update', path: `${MEETINGS}/m1`, data: { houseId: 'h1', minutes: 'ok' } },
    ]);
  });

  it('updateBusinessMeeting refuses without a houseId, before any op', async () => {
    await expect(updateBusinessMeeting('m1', {})).rejects.toThrow(
      'houseId required to update business meeting in subcollection',
    );
    expect(getOpLog()).toEqual([]);
  });

  it('updateBusinessMeeting wraps a failed update', async () => {
    await expect(updateBusinessMeeting('gone', as({ houseId: 'h1' }))).rejects.toThrow(
      'Failed to update business meeting',
    );
  });

  it('deleteBusinessMeeting deletes the meeting', async () => {
    seedDoc(`${MEETINGS}/m1`, {});

    await deleteBusinessMeeting('m1', 'h1');

    expect(getOpLog()).toEqual([{ op: 'delete', path: `${MEETINGS}/m1` }]);
    expect(readDoc(`${MEETINGS}/m1`)).toBeUndefined();
  });

  it('deleteBusinessMeeting refuses without a houseId, before any op', async () => {
    await expect(deleteBusinessMeeting('m1')).rejects.toThrow(
      'houseId required to delete business meeting from subcollection',
    );
    expect(getOpLog()).toEqual([]);
  });

  it('deleteBusinessMeeting wraps a failed delete', async () => {
    failNext('delete', new Error('permission-denied'), `${MEETINGS}/m1`);
    await expect(deleteBusinessMeeting('m1', 'h1')).rejects.toThrow(
      'Failed to delete business meeting',
    );
  });
});

describe('votes', () => {
  it('getVotesForMeeting queries the house votes by meetingId', async () => {
    seedQuery('houses/h1/votes', [
      { id: 'v1', meetingId: 'm1' },
      { id: 'v2', meetingId: 'm2' },
    ]);

    expect(await getVotesForMeeting('m1', 'h1')).toEqual([{ id: 'v1', meetingId: 'm1' }]);
    expect(getOpLog()).toEqual([
      { op: 'getDocs', path: 'houses/h1/votes', constraints: [['where', 'meetingId', '==', 'm1']] },
    ]);
  });

  it('getVotesForMeeting refuses without a houseId, before any op', async () => {
    await expect(getVotesForMeeting('m1')).rejects.toThrow(
      'houseId required to query votes in subcollection',
    );
    expect(getOpLog()).toEqual([]);
  });

  it('getVotesForMeeting wraps a failed read', async () => {
    failNext('getDocs', new Error('unavailable'), 'houses/h1/votes');
    await expect(getVotesForMeeting('m1', 'h1')).rejects.toThrow('Failed to load votes');
  });
});
