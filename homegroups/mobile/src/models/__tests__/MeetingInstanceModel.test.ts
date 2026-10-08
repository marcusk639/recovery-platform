/**
 * MeetingInstanceModel must not surface the attendee list.
 *
 * `meetingInstances` is world-readable so meetings can be discovered without
 * signing in, which means an `attendees` array on that document exposes who
 * attended a given 12-step meeting. Attendance now lives in the owner-only
 * subcollection users/{uid}/meetingAttendance, so the client has no business
 * reading (or projecting) the legacy array.
 *
 * Every mock value is constructed INSIDE the jest.mock factory: jest hoists the
 * factory above this file's imports, so a factory closing over a module-scope
 * const throws a TDZ ReferenceError when the module under test is imported.
 */
jest.mock('@react-native-firebase/firestore', () => {
  const chain: any = {};
  chain.where = jest.fn(() => chain);
  chain.limit = jest.fn(() => chain);
  chain.onSnapshot = jest.fn(() => () => undefined);
  const collection = jest.fn(() => chain);
  const firestoreFn: any = jest.fn(() => ({collection}));
  firestoreFn.__chain = chain;
  firestoreFn.__collection = collection;
  return {__esModule: true, default: firestoreFn};
});

import firestore from '@react-native-firebase/firestore';
import {MeetingInstanceModel} from '../MeetingInstanceModel';

const harness = firestore as unknown as {
  __chain: {onSnapshot: jest.Mock};
  __collection: jest.Mock;
};

describe('MeetingInstanceModel.subscribeTodayInstanceForMeeting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    harness.__chain.onSnapshot.mockImplementation(() => () => undefined);
  });

  function emitSnapshot(data: Record<string, unknown>) {
    const received: unknown[] = [];
    MeetingInstanceModel.subscribeTodayInstanceForMeeting(
      'group-1',
      'meeting-1',
      instance => received.push(instance),
      () => undefined,
    );
    const onNext = harness.__chain.onSnapshot.mock.calls[0][0];
    onNext({
      empty: false,
      docs: [{id: 'inst-1', data: () => data}],
    });
    return received[0] as Record<string, unknown>;
  }

  it('does not project the attendee list onto the client', () => {
    const instance = emitSnapshot({
      meetingId: 'meeting-1',
      groupId: 'group-1',
      scheduledAt: {toDate: () => new Date('2026-05-01T19:00:00Z')},
      attendeeCount: 12,
      attendees: ['user-a', 'user-b'],
    });

    expect(instance).not.toHaveProperty('attendees');
    expect(Object.values(instance)).not.toContainEqual([
      'user-a',
      'user-b',
    ]);
  });

  it('still surfaces the public denormalized attendeeCount', () => {
    const instance = emitSnapshot({
      meetingId: 'meeting-1',
      groupId: 'group-1',
      scheduledAt: {toDate: () => new Date('2026-05-01T19:00:00Z')},
      attendeeCount: 12,
      attendees: ['user-a'],
    });

    expect(instance.attendeeCount).toBe(12);
    expect(instance.id).toBe('inst-1');
  });
});
