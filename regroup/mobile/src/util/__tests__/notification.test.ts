// src/util/__tests__/notification.test.ts
//
// Unit tests for notification.ts.
// Exports tested:
//   - createNewMeetingNotifications(adminIds, meeting, message?) → MeetingAddedNotification[]
//   - createAdminNotifications(type, subject, message, adminIds) → Notification[]
//
// Dependencies:
//   - getTodaysDate() from display.tsx (uses moment — no mock needed, pure JS)
//   - MeetingAddedNotification / Notification from entities/Notification.tsx
//   - RatsMeeting from entities/Meeting.tsx

import { createNewMeetingNotifications, createAdminNotifications } from '../notification';
import { MeetingAddedNotification, Notification, NotificationType } from '../../entities/Notification';
import { RatsMeeting } from '../../entities/Meeting';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeMeeting(overrides: Partial<RatsMeeting> = {}): RatsMeeting {
  return Object.assign(new RatsMeeting(), {
    id: 'meet-1',
    name: 'Sunday Serenity',
    addedBy: 'Alice',
    time: '10:00',
    day: 'Sunday',
    type: 'AA' as const,
    ...overrides,
  });
}

// ─── createNewMeetingNotifications ───────────────────────────────────────────

describe('createNewMeetingNotifications', () => {
  const meeting = makeMeeting({ name: 'Monday Hope', addedBy: 'Bob' });
  const adminIds = ['admin-1', 'admin-2', 'admin-3'];

  it('returns one notification per admin ID', () => {
    const result = createNewMeetingNotifications(adminIds, meeting);
    expect(result).toHaveLength(3);
  });

  it('returns an empty array when adminIds is empty', () => {
    const result = createNewMeetingNotifications([], meeting);
    expect(result).toEqual([]);
  });

  it('each notification is an instance of MeetingAddedNotification', () => {
    const result = createNewMeetingNotifications(adminIds, meeting);
    result.forEach(n => expect(n).toBeInstanceOf(MeetingAddedNotification));
  });

  it('each notification has adminIds set to a single-element array of the corresponding admin', () => {
    const result = createNewMeetingNotifications(adminIds, meeting);
    expect(result[0].adminIds).toEqual(['admin-1']);
    expect(result[1].adminIds).toEqual(['admin-2']);
    expect(result[2].adminIds).toEqual(['admin-3']);
  });

  it('each notification references the same meeting object', () => {
    const result = createNewMeetingNotifications(adminIds, meeting);
    result.forEach(n => expect(n.meeting).toBe(meeting));
  });

  it('message includes the addedBy and meeting name', () => {
    const result = createNewMeetingNotifications(adminIds, meeting);
    result.forEach(n => {
      expect(n.message).toContain('Bob');
      expect(n.message).toContain('Monday Hope');
    });
  });

  it('subject is "New Meeting Added"', () => {
    const result = createNewMeetingNotifications(adminIds, meeting);
    result.forEach(n => expect(n.subject).toBe('New Meeting Added'));
  });

  it('date is a YYYY-MM-DD formatted string', () => {
    const result = createNewMeetingNotifications(adminIds, meeting);
    result.forEach(n => expect(n.date).toMatch(/^\d{4}-\d{2}-\d{2}$/));
  });

  it('notification type is "meeting-added"', () => {
    const result = createNewMeetingNotifications(adminIds, meeting);
    result.forEach(n => expect(n.type).toBe('meeting-added'));
  });

  it('works with a single admin ID', () => {
    const result = createNewMeetingNotifications(['only-admin'], meeting);
    expect(result).toHaveLength(1);
    expect(result[0].adminIds).toEqual(['only-admin']);
  });
});

// ─── createAdminNotifications ─────────────────────────────────────────────────

describe('createAdminNotifications', () => {
  const type: NotificationType = 'dispute';
  const subject = 'Activity Disputed';
  const message = 'A chore completion has been disputed.';
  const adminIds = ['a-1', 'a-2'];

  it('returns one notification per admin ID', () => {
    const result = createAdminNotifications(type, subject, message, adminIds);
    expect(result).toHaveLength(2);
  });

  it('returns an empty array when adminIds is empty', () => {
    const result = createAdminNotifications(type, subject, message, []);
    expect(result).toEqual([]);
  });

  it('each notification is an instance of Notification', () => {
    const result = createAdminNotifications(type, subject, message, adminIds);
    result.forEach(n => expect(n).toBeInstanceOf(Notification));
  });

  it('each notification has adminIds set to a single-element array of the corresponding admin', () => {
    const result = createAdminNotifications(type, subject, message, adminIds);
    expect(result[0].adminIds).toEqual(['a-1']);
    expect(result[1].adminIds).toEqual(['a-2']);
  });

  it('each notification has the correct message', () => {
    const result = createAdminNotifications(type, subject, message, adminIds);
    result.forEach(n => expect(n.message).toBe(message));
  });

  it('each notification has the correct subject', () => {
    const result = createAdminNotifications(type, subject, message, adminIds);
    result.forEach(n => expect(n.subject).toBe(subject));
  });

  it('each notification has the correct type', () => {
    const result = createAdminNotifications(type, subject, message, adminIds);
    result.forEach(n => expect(n.type).toBe('dispute'));
  });

  it('sets type to "meeting-forced" correctly', () => {
    const result = createAdminNotifications('meeting-forced', 'Forced', 'msg', ['x']);
    expect(result[0].type).toBe('meeting-forced');
  });

  it('date is a YYYY-MM-DD formatted string', () => {
    const result = createAdminNotifications(type, subject, message, adminIds);
    result.forEach(n => expect(n.date).toMatch(/^\d{4}-\d{2}-\d{2}$/));
  });

  it('each notification gets a distinct adminIds array (not shared reference)', () => {
    const result = createAdminNotifications(type, subject, message, ['x', 'y']);
    expect(result[0].adminIds).not.toBe(result[1].adminIds);
  });
});
