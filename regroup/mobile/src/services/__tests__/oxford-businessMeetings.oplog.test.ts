/**
 * oxford/businessMeetings.ts against the normalized Firebase operation log.
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
  getBusinessMeetings,
  updateBusinessMeeting,
} from '../oxford/businessMeetings';
import { BusinessMeeting } from '../../entities/oxford/BusinessMeeting';
import { logException } from '../../util/logging';

const MEETINGS = 'houses/h1/business-meetings';
const NOW = '2026-10-07T17:00:00.000Z';

beforeEach(() => {
  resetOpLog();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('createBusinessMeeting', () => {
  it('sets houses/{houseId}/business-meetings/{auto id} with id, houseId and createdAt', async () => {
    jest.useFakeTimers({ now: new Date(NOW) });
    const meeting = {
      scheduledDate: '2026-10-10',
      houseId: 'other',
    } as unknown as Omit<BusinessMeeting, 'id'>;

    const result = await createBusinessMeeting('h1', meeting);

    const expected = { scheduledDate: '2026-10-10', houseId: 'h1', id: 'auto-1', createdAt: NOW };
    expect(result).toEqual(expected);
    expect(getOpLog()).toEqual([{ op: 'set', path: `${MEETINGS}/auto-1`, data: expected }]);
  });

  it('logs and rethrows a generic error when the write fails', async () => {
    const denied = new Error('permission-denied');
    failNext('set', denied, `${MEETINGS}/auto-1`);

    await expect(createBusinessMeeting('h1', {} as Omit<BusinessMeeting, 'id'>)).rejects.toThrow(
      'Failed to create business meeting',
    );
    expect(logException).toHaveBeenCalledWith(denied);
  });
});

describe('getBusinessMeetings', () => {
  it('reads the 20 latest by scheduledDate, with the doc id winning over a stored id', async () => {
    seedQuery(MEETINGS, [
      { id: 'm1', scheduledDate: '2026-09-01' },
      { id: 'm2', scheduledDate: '2026-10-01' },
    ]);
    seedDoc(`${MEETINGS}/m3`, { id: 'stale', scheduledDate: '2026-08-01' });

    expect(await getBusinessMeetings('h1')).toEqual([
      { id: 'm2', scheduledDate: '2026-10-01' },
      { id: 'm1', scheduledDate: '2026-09-01' },
      { id: 'm3', scheduledDate: '2026-08-01' },
    ]);
    expect(getOpLog()).toEqual([
      {
        op: 'getDocs',
        path: MEETINGS,
        constraints: [
          ['orderBy', 'scheduledDate', 'desc'],
          ['limit', 20],
        ],
      },
    ]);
  });

  it('wraps a failed read', async () => {
    failNext('getDocs', new Error('unavailable'), MEETINGS);
    await expect(getBusinessMeetings('h1')).rejects.toThrow('Failed to load business meetings');
  });
});

describe('updateBusinessMeeting', () => {
  it('updates the meeting with the given fields', async () => {
    seedDoc(`${MEETINGS}/m1`, { scheduledDate: '2026-10-01' });

    await updateBusinessMeeting('h1', 'm1', { minutes: 'ok' } as Partial<BusinessMeeting>);

    expect(getOpLog()).toEqual([{ op: 'update', path: `${MEETINGS}/m1`, data: { minutes: 'ok' } }]);
    expect(readDoc(`${MEETINGS}/m1`)).toEqual({ scheduledDate: '2026-10-01', minutes: 'ok' });
  });

  it('wraps a failed update', async () => {
    await expect(updateBusinessMeeting('h1', 'gone', {})).rejects.toThrow(
      'Failed to update business meeting',
    );
  });
});
