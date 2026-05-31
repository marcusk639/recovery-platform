// Mock moment-timezone used inside util/display
jest.mock('moment-timezone', () => {
  const m = jest.requireActual('moment');
  (m as any).tz = { guess: () => 'UTC' };
  return m;
});

// Mock display utilities that depend on moment
jest.mock('../../util/display', () => ({
  getTodaysDate: () => '2026-02-22',
  getCurrentTime: () => '2026-02-22T00:00:00Z',
}));

// Mock react-native-gifted-chat (used transitively)
jest.mock('react-native-gifted-chat', () => ({}), { virtual: true });

import {
  Notification,
  MeetingAddedNotification,
  DisputeNotification,
  NotificationLevel,
  NotificationType,
} from '../Notification';
import { ActivityType } from '../ActivityModel';
import type { Dispute } from '../Dispute';

// Minimal Dispute fixture
const makeDispute = (overrides: Partial<Dispute> = {}): Dispute => ({
  id: 'dispute-1',
  guestId: 'guest-1',
  houseId: 'house-1',
  activityId: 'activity-1',
  type: ActivityType.CHORE,
  message: 'Did not clean.',
  status: 'pending',
  createdDate: '2026-02-22',
  createdAt: '2026-02-22T00:00:00Z',
  updatedAt: '2026-02-22T00:00:00Z',
  ...overrides,
});

describe('Notification class', () => {
  describe('constructor', () => {
    it('does not throw when instantiated', () => {
      expect(() => new Notification()).not.toThrow();
    });

    it('defaults id to empty string (BaseEntity)', () => {
      const n = new Notification();
      expect(n.id).toBe('');
    });

    it('defaults userId to empty string', () => {
      const n = new Notification();
      expect(n.userId).toBe('');
    });

    it('defaults guestId to empty string', () => {
      const n = new Notification();
      expect(n.guestId).toBe('');
    });

    it('defaults houseId to empty string', () => {
      const n = new Notification();
      expect(n.houseId).toBe('');
    });

    it('defaults adminIds to empty array', () => {
      const n = new Notification();
      expect(n.adminIds).toEqual([]);
    });

    it('defaults superAdminId to empty string', () => {
      const n = new Notification();
      expect(n.superAdminId).toBe('');
    });

    it('defaults message to empty string', () => {
      const n = new Notification();
      expect(n.message).toBe('');
    });

    it('defaults subject to empty string', () => {
      const n = new Notification();
      expect(n.subject).toBe('');
    });

    it('defaults date to empty string', () => {
      const n = new Notification();
      expect(n.date).toBe('');
    });

    it('defaults type to "dispute"', () => {
      const n = new Notification();
      expect(n.type).toBe('dispute');
    });

    it('defaults read to false', () => {
      const n = new Notification();
      expect(n.read).toBe(false);
    });

    it('has a createdAt ISO string (from BaseEntity)', () => {
      const n = new Notification();
      expect(typeof n.createdAt).toBe('string');
      expect(() => new Date(n.createdAt)).not.toThrow();
    });

    it('has an updatedAt ISO string (from BaseEntity)', () => {
      const n = new Notification();
      expect(typeof n.updatedAt).toBe('string');
      expect(() => new Date(n.updatedAt)).not.toThrow();
    });
  });

  describe('field mutation', () => {
    it('allows read to be toggled to true', () => {
      const n = new Notification();
      n.read = true;
      expect(n.read).toBe(true);
    });

    it('allows adminIds to be populated', () => {
      const n = new Notification();
      n.adminIds = ['admin-1', 'admin-2'];
      expect(n.adminIds).toEqual(['admin-1', 'admin-2']);
    });

    it('allows type to be changed', () => {
      const n = new Notification();
      n.type = 'meeting-added';
      expect(n.type).toBe('meeting-added');
    });
  });
});

describe('MeetingAddedNotification class', () => {
  it('does not throw when instantiated', () => {
    expect(() => new MeetingAddedNotification()).not.toThrow();
  });

  it('sets type to "meeting-added" by default', () => {
    const n = new MeetingAddedNotification();
    expect(n.type).toBe('meeting-added');
  });

  it('inherits read=false from Notification', () => {
    const n = new MeetingAddedNotification();
    expect(n.read).toBe(false);
  });

  it('inherits adminIds=[] from Notification', () => {
    const n = new MeetingAddedNotification();
    expect(n.adminIds).toEqual([]);
  });
});

describe('DisputeNotification class', () => {
  describe('constructor', () => {
    it('does not throw when constructed with a dispute and userId', () => {
      const dispute = makeDispute();
      expect(
        () => new DisputeNotification(dispute, false, 'user-1'),
      ).not.toThrow();
    });

    it('sets type to "dispute"', () => {
      const n = new DisputeNotification(makeDispute(), false, 'user-1');
      expect(n.type).toBe('dispute');
    });

    it('stores the dispute reference', () => {
      const dispute = makeDispute();
      const n = new DisputeNotification(dispute, false, 'user-1');
      expect(n.dispute).toBe(dispute);
    });

    it('sets userId to the provided userId', () => {
      const n = new DisputeNotification(makeDispute(), false, 'user-42');
      expect(n.userId).toBe('user-42');
    });

    it('sets subject to "Activity Disputed"', () => {
      const n = new DisputeNotification(makeDispute(), false, 'user-1');
      expect(n.subject).toBe('Activity Disputed');
    });

    it('sets date from getTodaysDate()', () => {
      const n = new DisputeNotification(makeDispute(), false, 'user-1');
      expect(n.date).toBe('2026-02-22');
    });

    it('defaults level to "alert"', () => {
      const n = new DisputeNotification(makeDispute(), false, 'user-1');
      expect(n.level).toBe('alert');
    });

    it('defaults adminNotification to false', () => {
      const n = new DisputeNotification(makeDispute(), false, 'user-1');
      expect(n.adminNotification).toBe(false);
    });
  });

  describe('getActivityTypeLabel', () => {
    let n: DisputeNotification;
    beforeEach(() => {
      n = new DisputeNotification(makeDispute(), false, 'user-1');
    });

    it('maps CHORE to "chore completion"', () => {
      expect(n.getActivityTypeLabel('CHORE')).toBe('chore completion');
    });

    it('maps WORK to "work hours"', () => {
      expect(n.getActivityTypeLabel('WORK')).toBe('work hours');
    });

    it('maps MEDICATION to "medication"', () => {
      expect(n.getActivityTypeLabel('MEDICATION')).toBe('medication');
    });

    it('maps PRIMARY_SUPPORTER to "sponsor meeting"', () => {
      expect(n.getActivityTypeLabel('PRIMARY_SUPPORTER')).toBe(
        'sponsor meeting',
      );
    });

    it('maps MEETING to "meeting attendance"', () => {
      expect(n.getActivityTypeLabel('MEETING')).toBe('meeting attendance');
    });

    it('maps legacy choreCompleted to "chore completion"', () => {
      expect(n.getActivityTypeLabel('choreCompleted')).toBe('chore completion');
    });

    it('maps legacy hoursWorked to "work hours"', () => {
      expect(n.getActivityTypeLabel('hoursWorked')).toBe('work hours');
    });

    it('maps legacy medication to "medication"', () => {
      expect(n.getActivityTypeLabel('medication')).toBe('medication');
    });

    it('maps legacy metPrimarySupporter to "sponsor meeting"', () => {
      expect(n.getActivityTypeLabel('metPrimarySupporter')).toBe(
        'sponsor meeting',
      );
    });

    it('maps legacy meeting to "meeting attendance"', () => {
      expect(n.getActivityTypeLabel('meeting')).toBe('meeting attendance');
    });

    it('returns "activity" for unknown types', () => {
      expect(n.getActivityTypeLabel('unknown_type')).toBe('activity');
    });
  });

  describe('getNotificationMessage', () => {
    let n: DisputeNotification;

    beforeEach(() => {
      n = new DisputeNotification(makeDispute(), false, 'user-1');
    });

    it('returns guest message when admin=false', () => {
      const dispute = makeDispute({
        type: ActivityType.CHORE,
        message: 'Not done.',
      });
      const msg = n.getNotificationMessage(dispute, false);
      expect(msg).toContain('Your');
      expect(msg).toContain('Not done.');
    });

    it('returns admin message when admin=true', () => {
      const dispute = makeDispute({
        type: ActivityType.CHORE,
        message: 'Not done.',
      });
      const msg = n.getNotificationMessage(dispute, true);
      expect(msg).toContain('A ');
      expect(msg).toContain('Not done.');
    });

    it('falls back to "No reason provided" when dispute message is empty', () => {
      const dispute = makeDispute({ message: '' });
      const msg = n.getNotificationMessage(dispute, false);
      expect(msg).toContain('No reason provided');
    });

    it('message field is set by constructor based on dispute', () => {
      const dispute = makeDispute({
        type: ActivityType.CHORE,
        message: 'Dirty.',
      });
      const n2 = new DisputeNotification(dispute, false, 'user-1');
      expect(n2.message).toContain('Dirty.');
    });
  });
});
