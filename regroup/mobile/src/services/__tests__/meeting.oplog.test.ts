/**
 * meeting.ts against the normalized Firebase operation log.
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
  seedCall,
  seedDoc,
} from '../../../__mocks__/firebase-modular/log';
import {
  addMeeting,
  deleteMeeting,
  searchForMeetings,
  updateMeeting,
  userIsAtMeeting,
} from '../meeting';
import { MeetingSearchInput, MeetingVerificationInput, RatsMeeting } from '../../entities/Meeting';

beforeEach(() => {
  resetOpLog();
});

describe('callables', () => {
  it('searchForMeetings calls findMeetings with the input and returns its data', async () => {
    seedCall('findMeetings', [{ id: 'm1', name: 'Noon' }]);
    const input = { latitude: 1, longitude: 2, radius: 5 } as unknown as MeetingSearchInput;

    expect(await searchForMeetings(input)).toEqual([{ id: 'm1', name: 'Noon' }]);
    expect(getOpLog()).toEqual([
      { op: 'call', path: 'findMeetings', data: { latitude: 1, longitude: 2, radius: 5 } },
    ]);
  });

  it('userIsAtMeeting calls userIsAtMeeting with the locations and returns its data', async () => {
    seedCall('userIsAtMeeting', true);
    const locations = {
      meeting: { lat: 1 },
      user: { lat: 1 },
    } as unknown as MeetingVerificationInput;

    expect(await userIsAtMeeting(locations)).toBe(true);
    expect(getOpLog()).toEqual([
      {
        op: 'call',
        path: 'userIsAtMeeting',
        data: { meeting: { lat: 1 }, user: { lat: 1 } },
      },
    ]);
  });

  it('rejects when a callable fails', async () => {
    failNext('call', new Error('internal'), 'findMeetings');
    await expect(searchForMeetings({} as MeetingSearchInput)).rejects.toThrow('internal');
  });
});

describe('writes', () => {
  it('addMeeting sets meetings/{auto id} with a copy, leaving the input untouched', async () => {
    const meeting = { name: 'Noon', day: 1 } as unknown as RatsMeeting;

    const result = await addMeeting(meeting);

    expect(result).toEqual({ name: 'Noon', day: 1, id: 'auto-1' });
    expect(meeting).toEqual({ name: 'Noon', day: 1 });
    expect(getOpLog()).toEqual([
      { op: 'set', path: 'meetings/auto-1', data: { name: 'Noon', day: 1, id: 'auto-1' } },
    ]);
  });

  it('addMeeting keeps a meeting id it was given', async () => {
    await addMeeting({ id: 'm1', name: 'Noon' } as unknown as RatsMeeting);

    expect(getOpLog()).toEqual([
      { op: 'set', path: 'meetings/m1', data: { id: 'm1', name: 'Noon' } },
    ]);
  });

  it('updateMeeting updates meetings/{id} with the values plus the id', async () => {
    seedDoc('meetings/m1', { name: 'Noon' });

    await updateMeeting('m1', { name: 'Night' } as Partial<RatsMeeting>);

    expect(getOpLog()).toEqual([
      { op: 'update', path: 'meetings/m1', data: { id: 'm1', name: 'Night' } },
    ]);
    expect(readDoc('meetings/m1')).toEqual({ id: 'm1', name: 'Night' });
  });

  it('updateMeeting rejects for a missing meeting', async () => {
    await expect(updateMeeting('nope', {})).rejects.toThrow('not-found');
  });

  it('deleteMeeting deletes meetings/{id}', async () => {
    seedDoc('meetings/m1', { name: 'Noon' });

    await deleteMeeting({ id: 'm1' } as unknown as RatsMeeting);

    expect(getOpLog()).toEqual([{ op: 'delete', path: 'meetings/m1' }]);
    expect(readDoc('meetings/m1')).toBeUndefined();
  });

  it('deleteMeeting throws without an op for a meeting with no id', async () => {
    await expect(deleteMeeting({} as RatsMeeting)).rejects.toThrow(
      'Item must have an id or uid attribute',
    );
    expect(getOpLog()).toEqual([]);
  });
});
