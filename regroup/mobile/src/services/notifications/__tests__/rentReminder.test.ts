/**
 * rentReminder.test.ts
 *
 * Unit tests for scheduleRentReminder, cancelRentReminder, and the
 * nextFridayAt9am date calculation (tested both directly and indirectly via
 * scheduleRentReminder).
 *
 * Platform.OS is set to 'android' via Object.defineProperty so that
 * doSchedule() is invoked synchronously without the iOS checkPermissions
 * callback path.
 *
 * Day-of-week coverage verified against the formula:
 *   daysToMonday = (1 - day + 7) % 7 || 7
 *   friday       = today + daysToMonday - 3
 *   if friday <= now: friday += 7
 */

// ---------------------------------------------------------------------------
// Mocks — must be declared before any imports
// ---------------------------------------------------------------------------
jest.mock('react-native-push-notification', () => ({
  localNotificationSchedule: jest.fn(),
  cancelLocalNotification: jest.fn(),
  checkPermissions: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------
import { Platform } from 'react-native';
import PushNotification from 'react-native-push-notification';
import { scheduleRentReminder, cancelRentReminder, nextFridayAt9am } from '../rentReminder';
import { Guest } from '../../../entities/Guest';

// ---------------------------------------------------------------------------
// Platform — force android so doSchedule() is called synchronously
// ---------------------------------------------------------------------------
beforeAll(() => {
  Object.defineProperty(Platform, 'OS', {
    value: 'android',
    configurable: true,
  });
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const mockGuest = {
  id: 'guest-abc',
  firstName: 'Jane',
  rentOwed: 5000,
} as unknown as Guest;

// ---------------------------------------------------------------------------
// Date-mocking helpers
// ---------------------------------------------------------------------------
const RealDate = Date;

/**
 * Replaces `new Date()` (no-arg) with a fixed instant while keeping
 * `new Date(arg)` and `Date.now()` pointing at the real implementation.
 */
function mockToday(isoString: string): void {
  const fixed = new RealDate(isoString);
  jest
    .spyOn(global, 'Date')
    .mockImplementation((...args: unknown[]): Date => {
      if (args.length === 0) return fixed;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return new RealDate(...(args as [any]));
    });
}

afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers used across tests
// ---------------------------------------------------------------------------
function getScheduledDate(): Date {
  const mock = PushNotification.localNotificationSchedule as jest.Mock;
  expect(mock).toHaveBeenCalledTimes(1);
  return mock.mock.calls[0][0].date as Date;
}

// ---------------------------------------------------------------------------
// 1. Shape of the scheduled notification
// ---------------------------------------------------------------------------
describe('scheduleRentReminder — notification shape', () => {
  it('calls PushNotification.localNotificationSchedule with required fields', () => {
    scheduleRentReminder(mockGuest);

    expect(PushNotification.localNotificationSchedule).toHaveBeenCalledTimes(1);
    expect(PushNotification.localNotificationSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Rent Reminder',
        message: expect.any(String),
        date: expect.any(Date),
        allowWhileIdle: true,
      }),
    );
  });

  it('uses a deterministic string ID derived from the guest ID', () => {
    scheduleRentReminder(mockGuest);

    const call = (PushNotification.localNotificationSchedule as jest.Mock)
      .mock.calls[0][0];
    expect(typeof call.id).toBe('string');

    // Calling again must produce the same ID
    jest.clearAllMocks();
    scheduleRentReminder(mockGuest);
    const call2 = (PushNotification.localNotificationSchedule as jest.Mock)
      .mock.calls[0][0];
    expect(call.id).toBe(call2.id);
  });
});

// ---------------------------------------------------------------------------
// 2. Scheduled date is a Friday at 9am in the future
// ---------------------------------------------------------------------------
describe('scheduleRentReminder — scheduled date properties', () => {
  it('schedules on a Friday (getDay() === 5)', () => {
    scheduleRentReminder(mockGuest);
    const date = getScheduledDate();
    expect(date.getDay()).toBe(5);
  });

  it('schedules at exactly 9:00:00.000', () => {
    scheduleRentReminder(mockGuest);
    const date = getScheduledDate();
    expect(date.getHours()).toBe(9);
    expect(date.getMinutes()).toBe(0);
    expect(date.getSeconds()).toBe(0);
    expect(date.getMilliseconds()).toBe(0);
  });

  it('schedules in the future relative to now', () => {
    scheduleRentReminder(mockGuest);
    const date = getScheduledDate();
    expect(date.getTime()).toBeGreaterThan(Date.now());
  });

  it('schedules exactly 3 days before the next Monday rent due date', () => {
    scheduleRentReminder(mockGuest);
    const friday = getScheduledDate();
    const mondayAfterFriday = new RealDate(friday);
    mondayAfterFriday.setDate(friday.getDate() + 3);
    expect(mondayAfterFriday.getDay()).toBe(1); // Monday
  });
});

// ---------------------------------------------------------------------------
// 3. cancelRentReminder
// ---------------------------------------------------------------------------
describe('cancelRentReminder', () => {
  it('calls cancelLocalNotification with a string argument', () => {
    cancelRentReminder(mockGuest);
    expect(PushNotification.cancelLocalNotification).toHaveBeenCalledTimes(1);
    expect(PushNotification.cancelLocalNotification).toHaveBeenCalledWith(
      expect.any(String),
    );
  });

  it('uses the same deterministic ID that scheduleRentReminder uses', () => {
    scheduleRentReminder(mockGuest);
    const scheduleId = (
      PushNotification.localNotificationSchedule as jest.Mock
    ).mock.calls[0][0].id as string;

    jest.clearAllMocks();

    cancelRentReminder(mockGuest);
    const cancelId = (
      PushNotification.cancelLocalNotification as jest.Mock
    ).mock.calls[0][0] as string;

    expect(cancelId).toBe(scheduleId);
  });
});

// ---------------------------------------------------------------------------
// 4. nextFridayAt9am — day-of-week coverage (all 7 days + boundary cases)
//
//    For each day we mock "now", call scheduleRentReminder, then assert:
//      a) the scheduled date is a Friday
//      b) at 09:00:00.000
//      c) strictly after "now"
//      d) exactly N calendar days from the mocked today
//      e) the Monday 3 days later is indeed a Monday
//
//    ISO dates chosen so the test is not sensitive to year/month boundaries.
//    Week anchor: 2025-02-03 = Monday
//      Mon 2025-02-03, Tue 2025-02-04, Wed 2025-02-05, Thu 2025-02-06,
//      Fri 2025-02-07, Sat 2025-02-08, Sun 2025-02-09
// ---------------------------------------------------------------------------
describe('nextFridayAt9am — day-of-week coverage (via scheduleRentReminder)', () => {
  /**
   * [label, isoString, expectedDaysFromTodayToFriday]
   *
   * "days from today" counts calendar dates (midnight-to-midnight).
   */
  const cases: [string, string, number][] = [
    // Monday noon → Friday of NEXT week is +4 days (Mon already passed this
    // week's Monday; next Monday is +7, so Friday = 7-3 = +4)
    ['Monday noon', '2025-02-03T12:00:00', 4],
    // Tuesday noon → this Friday is +3 days
    ['Tuesday noon', '2025-02-04T12:00:00', 3],
    // Wednesday noon → this Friday is +2 days
    ['Wednesday noon', '2025-02-05T12:00:00', 2],
    // Thursday noon → tomorrow (Friday) is +1 day
    ['Thursday noon', '2025-02-06T12:00:00', 1],
    // Friday before 9am → today at 9am = +0 calendar days
    ['Friday 08:00', '2025-02-07T08:00:00', 0],
    // Friday exactly at 9am → boundary: friday <= now → next Friday +7 days
    ['Friday 09:00 (boundary)', '2025-02-07T09:00:00', 7],
    // Friday after 9am → next Friday +7 days
    ['Friday 10:00', '2025-02-07T10:00:00', 7],
    // Saturday noon → Friday=-1 day (past) → +7 → next Friday = +6 days
    ['Saturday noon', '2025-02-08T12:00:00', 6],
    // Sunday noon → Friday=-2 days (past) → +7 → +5 days
    ['Sunday noon', '2025-02-09T12:00:00', 5],
  ];

  test.each(cases)(
    '%s → scheduled Friday is correct',
    (_label, isoString, expectedDaysAway) => {
      mockToday(isoString);
      const now = new RealDate(isoString);

      scheduleRentReminder(mockGuest);
      const friday = getScheduledDate();

      // a) Must be a Friday
      expect(friday.getDay()).toBe(5);

      // b) Must be at 09:00:00.000
      expect(friday.getHours()).toBe(9);
      expect(friday.getMinutes()).toBe(0);
      expect(friday.getSeconds()).toBe(0);
      expect(friday.getMilliseconds()).toBe(0);

      // c) Must be strictly after now
      expect(friday.getTime()).toBeGreaterThan(now.getTime());

      // d) Calendar-day distance from today
      const todayMidnight = new RealDate(now);
      todayMidnight.setHours(0, 0, 0, 0);
      const fridayMidnight = new RealDate(friday);
      fridayMidnight.setHours(0, 0, 0, 0);
      const diffDays = Math.round(
        (fridayMidnight.getTime() - todayMidnight.getTime()) /
          (1000 * 60 * 60 * 24),
      );
      expect(diffDays).toBe(expectedDaysAway);

      // e) The Monday 3 days after the scheduled Friday must be a Monday
      const mondayAfterFriday = new RealDate(friday);
      mondayAfterFriday.setDate(friday.getDate() + 3);
      expect(mondayAfterFriday.getDay()).toBe(1);
    },
  );
});

// ---------------------------------------------------------------------------
// 5. nextFridayAt9am direct export
// ---------------------------------------------------------------------------
describe('nextFridayAt9am (direct export)', () => {
  it('returns a Date object', () => {
    const result = nextFridayAt9am();
    expect(result).toBeInstanceOf(Date);
  });

  it('always returns day === 5 (Friday)', () => {
    const result = nextFridayAt9am();
    expect(result.getDay()).toBe(5);
  });

  it('always returns hours === 9, minutes/seconds/ms === 0', () => {
    const result = nextFridayAt9am();
    expect(result.getHours()).toBe(9);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
    expect(result.getMilliseconds()).toBe(0);
  });

  it('always returns a date strictly in the future', () => {
    const result = nextFridayAt9am();
    expect(result.getTime()).toBeGreaterThan(Date.now());
  });

  it('the Monday 3 days after the returned Friday is always a Monday', () => {
    const friday = nextFridayAt9am();
    const monday = new RealDate(friday);
    monday.setDate(friday.getDate() + 3);
    expect(monday.getDay()).toBe(1);
  });
});
