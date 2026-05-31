// src/util/__tests__/guestUtil.test.ts
// Unit tests for pure utility functions in src/util/guest.tsx

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('react-native', () => ({
  StyleSheet: { create: (s: any) => s },
  Platform: { OS: 'ios' },
  Dimensions: { get: () => ({ width: 375, height: 812 }) },
  View: 'View',
  Text: 'Text',
}));

jest.mock('react-native-size-matters', () => ({
  moderateScale: (n: number) => n,
}));

jest.mock('@callstack/react-theme-provider', () => ({
  createTheming: () => ({
    ThemeProvider: 'ThemeProvider',
    withTheme: (c: any) => c,
    useTheme: jest.fn(),
  }),
}));

jest.mock('../../styles/theme', () => ({
  color: {
    green: '#00ff00',
    baby_blue: '#ADD8E6',
    darkYellow: '#FFD700',
    red: '#ff0000',
    white: '#ffffff',
    black: '#000000',
    grey: '#aaaaaa',
  },
  fontSize: {},
  fontFamily: { bold: 'bold', roboto: 'Roboto' },
  normalize: (n: number) => n,
}));

jest.mock('../../components/weekdays', () => ({
  daysOfWeek: [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ],
  Weekdays: 'Weekdays',
}));

jest.mock('../../screens/StatUpdates/MeetingSearch', () => ({
  WeekDay: undefined,
  MEETING_DESCRIPTION_TEXT: {},
}));

jest.mock('../../util/platform', () => ({ IOS: true }));

jest.mock('../../util/display', () => ({
  getDayOfWeek: jest.fn((date: string, _asString?: boolean) => {
    const d = new Date(date + 'T00:00:00');
    return d.getDay();
  }),
  getTodaysDate: jest.fn(() => '2024-01-10'),
  getStartOfWeek: jest.fn(() => '2024-01-07'),
  getEndOfWeek: jest.fn(() => '2024-01-13'),
  dayIsAfter: jest.fn((a: string, b: string) => a > b),
  dayIsBefore: jest.fn((a: string, b: string) => a < b),
  militaryTimeToFormatted: jest.fn((t: string) => t),
}));

jest.mock('../../components/rats-list-item', () => 'RatsListItem');
jest.mock('../../components/rats-text', () => ({ RatsText: 'RatsText' }));
jest.mock('../../components/rats-numeric-input', () => 'RatsNumericInput');
jest.mock('../../util/address', () => ({
  toAddress: jest.fn(),
  getAddressDisplay: jest.fn(),
}));
jest.mock('formik', () => ({ Field: 'Field' }));

// ─── Imports ─────────────────────────────────────────────────────────────────

import { ActivityType, ActivityStatus } from '../../entities/ActivityModel';
import HealthConstants from '../../constants/health';
import {
  getHealthByPercentage,
  getPercentage,
  getMoneySaved,
  addObjectProperties,
  calculateWeeklyStatsFromActivities,
  calculateDisputesForStat,
  filterActivities,
  dateIsInWeek,
  getGuestsArray,
} from '../guest';

// ─── Shared fixture helpers ───────────────────────────────────────────────────

/** Build a minimal Activity-shaped object for testing utility functions. */
function makeActivity(overrides: Record<string, any> = {}): any {
  return {
    id: 'act-1',
    guestId: 'guest-1',
    houseId: 'house-1',
    type: ActivityType.MEETING,
    timestamp: '2024-01-08T00:00:00Z',
    loggedAt: '2024-01-08T00:00:00Z',
    loggedBy: 'user-1',
    verified: false,
    status: ActivityStatus.ACTIVE,
    data: {
      type: 'meeting',
      meetingName: 'Monday Night AA',
      meetingType: 'AA',
      duration: 60,
    },
    underDispute: 0,
    ...overrides,
  };
}

/** Build a minimal ActivityFilterFormValues-shaped object. */
function makeFilters(overrides: Record<string, any> = {}): any {
  return {
    guest: null,
    type: 'all',
    disputed: 'all',
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getHealthByPercentage', () => {
  it('returns SUPER_HAPPY for percentage >= 90', () => {
    expect(getHealthByPercentage(90)).toBe(HealthConstants.SUPER_HAPPY);
    expect(getHealthByPercentage(100)).toBe(HealthConstants.SUPER_HAPPY);
    expect(getHealthByPercentage(95)).toBe(HealthConstants.SUPER_HAPPY);
  });

  it('returns HAPPY for percentage >= 75 and < 90', () => {
    expect(getHealthByPercentage(75)).toBe(HealthConstants.HAPPY);
    expect(getHealthByPercentage(85)).toBe(HealthConstants.HAPPY);
    expect(getHealthByPercentage(89)).toBe(HealthConstants.HAPPY);
  });

  it('returns NEUTRAL for percentage >= 50 and < 75', () => {
    expect(getHealthByPercentage(50)).toBe(HealthConstants.NEUTRAL);
    expect(getHealthByPercentage(60)).toBe(HealthConstants.NEUTRAL);
    expect(getHealthByPercentage(74)).toBe(HealthConstants.NEUTRAL);
  });

  it('returns SAD for percentage < 50', () => {
    expect(getHealthByPercentage(49)).toBe(HealthConstants.SAD);
    expect(getHealthByPercentage(0)).toBe(HealthConstants.SAD);
    expect(getHealthByPercentage(25)).toBe(HealthConstants.SAD);
  });
});

describe('getPercentage', () => {
  it('calculates percentage from numeric done and required', () => {
    expect(getPercentage(3, 4)).toBe(75);
  });

  it('rounds up via Math.ceil', () => {
    // 1/3 * 100 = 33.33 → ceil → 34
    expect(getPercentage(1, 3)).toBe(34);
  });

  it('returns 100 when done equals required', () => {
    expect(getPercentage(5, 5)).toBe(100);
  });

  it('returns 0 when required is 0', () => {
    expect(getPercentage(5, 0)).toBe(0);
  });

  it('treats boolean true as 1', () => {
    expect(getPercentage(true, 1)).toBe(100);
  });

  it('treats boolean false as 0', () => {
    expect(getPercentage(false, 1)).toBe(0);
  });

  it('returns 0 when done is 0', () => {
    expect(getPercentage(0, 7)).toBe(0);
  });
});

describe('getMoneySaved', () => {
  it('returns daysSober multiplied by dailyHabit', () => {
    expect(getMoneySaved(30, 15)).toBe(450);
  });

  it('returns 0 when daysSober is 0', () => {
    expect(getMoneySaved(0, 20)).toBe(0);
  });

  it('returns 0 when dailyHabit is 0', () => {
    expect(getMoneySaved(100, 0)).toBe(0);
  });

  it('handles large numbers correctly', () => {
    expect(getMoneySaved(365, 50)).toBe(18250);
  });
});

describe('addObjectProperties', () => {
  it('sums all numeric values in an object', () => {
    expect(addObjectProperties({ a: 1, b: 2, c: 3 })).toBe(6);
  });

  it('returns 0 for an empty object', () => {
    expect(addObjectProperties({})).toBe(0);
  });

  it('handles a single property', () => {
    expect(addObjectProperties({ hours: 8 })).toBe(8);
  });

  it('handles zero values correctly', () => {
    expect(addObjectProperties({ job1: 0, job2: 0 })).toBe(0);
  });
});

describe('calculateWeeklyStatsFromActivities', () => {
  const guestId = 'guest-1';
  const weekStartDate = '2024-01-07';
  const weekEndDate = '2024-01-13';

  it('counts meetings from modern "meeting" type activities', () => {
    const activities = [
      makeActivity({ type: ActivityType.MEETING, timestamp: '2024-01-08' }),
      makeActivity({ type: ActivityType.MEETING, timestamp: '2024-01-09' }),
    ];
    const stats = calculateWeeklyStatsFromActivities(
      activities,
      guestId,
      weekStartDate,
      weekEndDate,
    );
    expect(stats.meeting).toBe(2);
  });

  it('counts medication from modern "medication" type activities', () => {
    const activities = [
      makeActivity({
        type: ActivityType.MEDICATION,
        timestamp: '2024-01-08',
        data: { type: 'medication', medicationName: 'Antabuse' },
      }),
    ];
    const stats = calculateWeeklyStatsFromActivities(
      activities,
      guestId,
      weekStartDate,
      weekEndDate,
    );
    expect(stats.medication).toBe(1);
  });

  it('sets metPrimarySupporter to true for modern "primary_supporter" type', () => {
    const activities = [
      makeActivity({
        type: ActivityType.PRIMARY_SUPPORTER,
        timestamp: '2024-01-09',
        data: {
          type: 'primary_supporter',
          supporterId: 's1',
          supporterName: 'Bob',
        },
      }),
    ];
    const stats = calculateWeeklyStatsFromActivities(
      activities,
      guestId,
      weekStartDate,
      weekEndDate,
    );
    expect(stats.metPrimarySupporter).toBe(true);
  });

  it('accumulates hoursWorked from modern "work" type using data.hoursWorked', () => {
    const activities = [
      makeActivity({
        type: ActivityType.WORK,
        timestamp: '2024-01-08',
        data: { type: 'work', jobName: 'Restaurant', hoursWorked: 5 },
      }),
      makeActivity({
        type: ActivityType.WORK,
        timestamp: '2024-01-09',
        data: { type: 'work', jobName: 'Restaurant', hoursWorked: 3 },
      }),
    ];
    const stats = calculateWeeklyStatsFromActivities(
      activities,
      guestId,
      weekStartDate,
      weekEndDate,
    );
    expect(stats.hoursWorked).toBe(8);
  });

  it('counts choreCompleted from modern "chore" type activities', () => {
    const activities = [
      makeActivity({
        type: ActivityType.CHORE,
        timestamp: '2024-01-10',
        data: { type: 'chore', choreType: 'daily', choreName: 'Kitchen' },
      }),
    ];
    const stats = calculateWeeklyStatsFromActivities(
      activities,
      guestId,
      weekStartDate,
      weekEndDate,
    );
    expect(stats.choreCompleted).toBe(1);
  });

  it('excludes activities with an ISO timestamp before the week start', () => {
    const activities = [
      makeActivity({
        type: ActivityType.MEETING,
        timestamp: '2024-01-06T00:00:00Z',
      }),
    ];
    const stats = calculateWeeklyStatsFromActivities(
      activities,
      guestId,
      weekStartDate,
      weekEndDate,
    );
    expect(stats.meeting).toBe(0);
  });

  it('excludes activities with an ISO timestamp after the week end', () => {
    const activities = [
      makeActivity({
        type: ActivityType.MEETING,
        timestamp: '2024-01-14T00:00:00Z',
      }),
    ];
    const stats = calculateWeeklyStatsFromActivities(
      activities,
      guestId,
      weekStartDate,
      weekEndDate,
    );
    expect(stats.meeting).toBe(0);
  });

  it('includes activities with date-only timestamps at boundary dates', () => {
    const activities = [
      makeActivity({ type: ActivityType.MEETING, timestamp: '2024-01-07' }), // start boundary
      makeActivity({ type: ActivityType.MEETING, timestamp: '2024-01-13' }), // end boundary
    ];
    const stats = calculateWeeklyStatsFromActivities(
      activities,
      guestId,
      weekStartDate,
      weekEndDate,
    );
    expect(stats.meeting).toBe(2);
  });

  it('handles Date object timestamps', () => {
    const activities = [
      makeActivity({
        type: ActivityType.MEETING,
        timestamp: new Date('2024-01-10T00:00:00Z'),
      }),
    ];
    const stats = calculateWeeklyStatsFromActivities(
      activities,
      guestId,
      weekStartDate,
      weekEndDate,
    );
    expect(stats.meeting).toBe(1);
  });

  it('excludes activities for a different guest', () => {
    const activities = [
      makeActivity({
        type: ActivityType.MEETING,
        timestamp: '2024-01-08',
        guestId: 'other-guest',
      }),
    ];
    const stats = calculateWeeklyStatsFromActivities(
      activities,
      guestId,
      weekStartDate,
      weekEndDate,
    );
    expect(stats.meeting).toBe(0);
  });

  it('skips activities where timestamp is undefined/null', () => {
    const activities = [
      makeActivity({ type: ActivityType.MEETING, timestamp: undefined }),
      makeActivity({ type: ActivityType.MEETING, timestamp: null }),
    ];
    const stats = calculateWeeklyStatsFromActivities(
      activities,
      guestId,
      weekStartDate,
      weekEndDate,
    );
    expect(stats.meeting).toBe(0);
  });

  it('returns zeroed stats when activity list is empty', () => {
    const stats = calculateWeeklyStatsFromActivities(
      [],
      guestId,
      weekStartDate,
      weekEndDate,
    );
    expect(stats).toEqual({
      meeting: 0,
      medication: 0,
      metPrimarySupporter: false,
      hoursWorked: 0,
      choreCompleted: 0,
    });
  });
});

describe('calculateDisputesForStat', () => {
  const guestId = 'guest-1';
  const weekStartDate = '2024-01-07';
  const weekEndDate = '2024-01-13';

  it('returns 0 when no activities are under dispute', () => {
    const activities = [
      makeActivity({
        type: ActivityType.MEETING,
        timestamp: '2024-01-08',
        underDispute: 0,
      }),
    ];
    const count = calculateDisputesForStat(activities, guestId, 'meeting');
    expect(count).toBe(0);
  });

  it('counts disputed meetings for the correct guest', () => {
    const activities = [
      makeActivity({
        type: ActivityType.MEETING,
        timestamp: '2024-01-08',
        underDispute: 1,
      }),
      makeActivity({
        type: ActivityType.MEETING,
        timestamp: '2024-01-09',
        underDispute: 1,
        guestId: 'other',
      }),
    ];
    const count = calculateDisputesForStat(activities, guestId, 'meeting');
    expect(count).toBe(1);
  });

  it('counts disputed work activities for hoursWorked stat', () => {
    const activities = [
      makeActivity({
        type: ActivityType.WORK,
        timestamp: '2024-01-08',
        underDispute: 1,
        data: { type: 'work', jobName: 'Job', hoursWorked: 8 },
      }),
      makeActivity({
        type: ActivityType.CHORE,
        timestamp: '2024-01-09',
        underDispute: 1,
      }),
    ];
    const count = calculateDisputesForStat(activities, guestId, 'hoursWorked');
    expect(count).toBe(1);
  });

  it('counts disputed legacy "meeting_attended" for meeting stat', () => {
    const activities = [
      makeActivity({
        type: 'meeting_attended',
        timestamp: '2024-01-08',
        underDispute: 1,
      }),
    ];
    const count = calculateDisputesForStat(activities, guestId, 'meeting');
    expect(count).toBe(1);
  });

  it('filters by date range when weekStartDate and weekEndDate are provided', () => {
    const activities = [
      makeActivity({
        type: ActivityType.MEETING,
        timestamp: '2024-01-08',
        underDispute: 1,
      }), // in range
      makeActivity({
        type: ActivityType.MEETING,
        timestamp: '2024-01-05',
        underDispute: 1,
      }), // out of range
    ];
    const count = calculateDisputesForStat(
      activities,
      guestId,
      'meeting',
      weekStartDate,
      weekEndDate,
    );
    expect(count).toBe(1);
  });

  it('skips activities where timestamp is missing when filtering by date', () => {
    const activities = [
      makeActivity({
        type: ActivityType.MEETING,
        timestamp: undefined,
        underDispute: 1,
      }),
    ];
    const count = calculateDisputesForStat(
      activities,
      guestId,
      'meeting',
      weekStartDate,
      weekEndDate,
    );
    expect(count).toBe(0);
  });

  it('returns all disputed activities when no date range is given', () => {
    const activities = [
      makeActivity({
        type: ActivityType.MEETING,
        timestamp: '2023-01-01',
        underDispute: 1,
      }),
      makeActivity({
        type: ActivityType.MEETING,
        timestamp: '2025-06-01',
        underDispute: 1,
      }),
    ];
    const count = calculateDisputesForStat(activities, guestId, 'meeting');
    expect(count).toBe(2);
  });
});

describe('filterActivities', () => {
  it('returns all activities when no filters are applied', () => {
    const activities = [
      makeActivity({ id: 'a1' }),
      makeActivity({ id: 'a2', type: ActivityType.CHORE }),
    ];
    const result = filterActivities(activities, makeFilters());
    expect(result).toHaveLength(2);
  });

  it('filters by guest id when filters.guest is set', () => {
    const activities = [
      makeActivity({ id: 'a1', guestId: 'guest-1' }),
      makeActivity({ id: 'a2', guestId: 'guest-2' }),
    ];
    const result = filterActivities(
      activities,
      makeFilters({ guest: { id: 'guest-1' } }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a1');
  });

  it('filters by type when filters.type is set', () => {
    const activities = [
      makeActivity({ id: 'a1', type: ActivityType.MEETING }),
      makeActivity({
        id: 'a2',
        type: ActivityType.CHORE,
        data: { type: 'chore', choreType: 'daily', choreName: 'Kitchen' },
      }),
    ];
    const result = filterActivities(
      activities,
      makeFilters({ type: 'meeting' }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a1');
  });

  it('filters to disputesOnly when disputesOnly is true', () => {
    const activities = [
      makeActivity({ id: 'a1', underDispute: 1 }),
      makeActivity({ id: 'a2', underDispute: 0 }),
    ];
    const result = filterActivities(
      activities,
      makeFilters(),
      undefined,
      undefined,
      'all',
      true,
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a1');
  });

  it('shows all activities (including disputed) when disputesOnly is false', () => {
    const activities = [
      makeActivity({ id: 'a1', underDispute: 1 }),
      makeActivity({ id: 'a2', underDispute: 0 }),
    ];
    const result = filterActivities(
      activities,
      makeFilters(),
      undefined,
      undefined,
      'all',
      false,
    );
    expect(result).toHaveLength(2);
  });

  it('filters by meetingName search term', () => {
    const activities = [
      makeActivity({
        id: 'a1',
        data: {
          type: 'meeting',
          meetingName: 'Monday AA',
          meetingType: 'AA',
          duration: 60,
        },
      }),
      makeActivity({
        id: 'a2',
        data: {
          type: 'meeting',
          meetingName: 'Tuesday NA',
          meetingType: 'NA',
          duration: 60,
        },
      }),
    ];
    const result = filterActivities(
      activities,
      makeFilters(),
      undefined,
      'Monday',
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a1');
  });

  it('filters by jobName search term', () => {
    const activities = [
      makeActivity({
        id: 'a1',
        type: ActivityType.WORK,
        data: { type: 'work', jobName: 'Acme Corp', hoursWorked: 8 },
      }),
      makeActivity({
        id: 'a2',
        type: ActivityType.WORK,
        data: { type: 'work', jobName: 'Other Inc', hoursWorked: 4 },
      }),
    ];
    const result = filterActivities(
      activities,
      makeFilters(),
      undefined,
      'Acme',
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a1');
  });

  it('filters by choreName search term', () => {
    const activities = [
      makeActivity({
        id: 'a1',
        type: ActivityType.CHORE,
        data: { type: 'chore', choreType: 'daily', choreName: 'Kitchen' },
      }),
      makeActivity({
        id: 'a2',
        type: ActivityType.CHORE,
        data: { type: 'chore', choreType: 'daily', choreName: 'Bathroom' },
      }),
    ];
    const result = filterActivities(
      activities,
      makeFilters(),
      undefined,
      'Kitchen',
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a1');
  });

  it('filters by medicationName search term', () => {
    const activities = [
      makeActivity({
        id: 'a1',
        type: ActivityType.MEDICATION,
        data: { type: 'medication', medicationName: 'Antabuse' },
      }),
      makeActivity({
        id: 'a2',
        type: ActivityType.MEDICATION,
        data: { type: 'medication', medicationName: 'Vivitrol' },
      }),
    ];
    const result = filterActivities(
      activities,
      makeFilters(),
      undefined,
      'Antabuse',
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a1');
  });

  it('filters by supporterName search term', () => {
    const activities = [
      makeActivity({
        id: 'a1',
        type: ActivityType.PRIMARY_SUPPORTER,
        data: {
          type: 'primary_supporter',
          supporterId: 's1',
          supporterName: 'John Smith',
        },
      }),
      makeActivity({
        id: 'a2',
        type: ActivityType.PRIMARY_SUPPORTER,
        data: {
          type: 'primary_supporter',
          supporterId: 's2',
          supporterName: 'Jane Doe',
        },
      }),
    ];
    const result = filterActivities(
      activities,
      makeFilters(),
      undefined,
      'John',
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a1');
  });

  it('returns empty array when search term does not match any activity', () => {
    const activities = [
      makeActivity({
        id: 'a1',
        data: {
          type: 'meeting',
          meetingName: 'AA Meeting',
          meetingType: 'AA',
          duration: 60,
        },
      }),
    ];
    const result = filterActivities(
      activities,
      makeFilters(),
      undefined,
      'nonexistent',
    );
    expect(result).toHaveLength(0);
  });

  it('filters by activity type using the type parameter', () => {
    const activities = [
      makeActivity({ id: 'a1', type: ActivityType.MEETING }),
      makeActivity({ id: 'a2', type: ActivityType.CHORE }),
    ];
    const result = filterActivities(
      activities,
      makeFilters(),
      undefined,
      undefined,
      ActivityType.MEETING,
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a1');
  });

  it('returns all activities when type parameter is "all"', () => {
    const activities = [
      makeActivity({ id: 'a1', type: ActivityType.MEETING }),
      makeActivity({ id: 'a2', type: ActivityType.CHORE }),
    ];
    const result = filterActivities(
      activities,
      makeFilters(),
      undefined,
      undefined,
      'all',
    );
    expect(result).toHaveLength(2);
  });

  it('filters by guest object when guest is passed as parameter', () => {
    const guest = { id: 'guest-1', guestId: 'guest-1' } as any;
    const activities = [
      makeActivity({ id: 'a1', guestId: 'guest-1' }),
      makeActivity({ id: 'a2', guestId: 'guest-2' }),
    ];
    const result = filterActivities(activities, makeFilters(), guest);
    // guest param is passed but filterActivities uses filters.guest not the guest param
    // both activities pass because filters.guest is null
    expect(result).toHaveLength(2);
  });

  it('returns empty array for empty input', () => {
    const result = filterActivities([], makeFilters());
    expect(result).toHaveLength(0);
  });
});

describe('dateIsInWeek', () => {
  it('returns true when date is within the week range', () => {
    expect(dateIsInWeek('2024-01-10', '2024-01-07', '2024-01-13')).toBe(true);
  });

  it('returns true for the start date (inclusive)', () => {
    expect(dateIsInWeek('2024-01-07', '2024-01-07', '2024-01-13')).toBe(true);
  });

  it('returns true for the end date (inclusive)', () => {
    expect(dateIsInWeek('2024-01-13', '2024-01-07', '2024-01-13')).toBe(true);
  });

  it('returns false when date is before the week start', () => {
    expect(dateIsInWeek('2024-01-06', '2024-01-07', '2024-01-13')).toBe(false);
  });

  it('returns false when date is after the week end', () => {
    expect(dateIsInWeek('2024-01-14', '2024-01-07', '2024-01-13')).toBe(false);
  });
});

describe('getGuestsArray', () => {
  it('converts a guests object to an array', () => {
    const guests: any = {
      g1: { id: 'g1', firstName: 'Alice' },
      g2: { id: 'g2', firstName: 'Bob' },
    };
    const result = getGuestsArray(guests);
    expect(result).toHaveLength(2);
    expect(result.map((g: any) => g.id)).toContain('g1');
    expect(result.map((g: any) => g.id)).toContain('g2');
  });

  it('returns an empty array for an empty guests object', () => {
    expect(getGuestsArray({})).toEqual([]);
  });
});
