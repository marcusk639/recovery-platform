// src/util/__tests__/display.test.ts
//
// Unit tests for pure date/time and string helper functions in src/util/display.tsx.
//
// display.tsx imports:
//   - styles/theme (uses react-native-size-matters, react-native — both need mocking)
//   - components/weekdays (React Native component tree — needs mocking)
//   - screens/StatUpdates/MeetingSearch (React Native screen — needs mocking)
//
// We mock these transitive dependencies so the utility functions can be
// imported in a plain Node/Jest environment.

jest.mock('react-native', () => ({
  StyleSheet: { create: (s: any) => s },
  Platform: { OS: 'ios' },
  Dimensions: { get: () => ({ width: 375, height: 812 }) },
  View: 'View',
  TouchableOpacity: 'TouchableOpacity',
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
    blue_green: '#446a85',
    dark_purple: '#23195e',
    green_blue: '#448580',
    cobalt: '#0047ab',
    pink: '#cc00a3',
  },
  fontSize: {},
  fontFamily: {},
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

jest.mock('../../util/platform', () => ({
  IOS: true,
}));

// ─── Imports ────────────────────────────────────────────────────────────────

import {
  getStartOfWeek,
  getEndOfWeek,
  getDayOfWeek,
  getMilitaryTime,
  militaryTimeToFormatted,
  formatName,
  camelCaseToDisplayForm,
  militaryHours,
  getPreviousWeek,
  getNextWeek,
  getWeekdayDate,
  dayIsAfter,
  dayIsBefore,
  daysLeft,
} from '../display';

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('getStartOfWeek', () => {
  it('returns the Sunday (start of week) for a Wednesday date', () => {
    // 2024-01-10 is a Wednesday; week starts on Sunday 2024-01-07
    const result = getStartOfWeek('2024-01-10');
    expect(result).toBe('2024-01-07');
  });

  it('returns the same day when given a Sunday', () => {
    // 2024-01-07 is a Sunday — already the start of the week
    const result = getStartOfWeek('2024-01-07');
    expect(result).toBe('2024-01-07');
  });

  it('returns the previous Sunday for a Saturday', () => {
    // 2024-01-13 is a Saturday; week started on Sunday 2024-01-07
    const result = getStartOfWeek('2024-01-13');
    expect(result).toBe('2024-01-07');
  });

  it('returns a YYYY-MM-DD formatted string', () => {
    const result = getStartOfWeek('2024-06-15');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('getEndOfWeek', () => {
  it('returns the Saturday (end of week) for a Wednesday date', () => {
    // 2024-01-10 is a Wednesday; week ends on Saturday 2024-01-13
    const result = getEndOfWeek('2024-01-10');
    expect(result).toBe('2024-01-13');
  });

  it('returns the same day when given a Saturday', () => {
    // 2024-01-13 is a Saturday — already the end of the week
    const result = getEndOfWeek('2024-01-13');
    expect(result).toBe('2024-01-13');
  });

  it('returns the following Saturday for a Sunday', () => {
    // 2024-01-07 is a Sunday; week ends on Saturday 2024-01-13
    const result = getEndOfWeek('2024-01-07');
    expect(result).toBe('2024-01-13');
  });

  it('returns a YYYY-MM-DD formatted string', () => {
    const result = getEndOfWeek('2024-06-15');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('getDayOfWeek', () => {
  // 2024-01-07 = Sunday (0), 2024-01-08 = Monday (1), 2024-01-13 = Saturday (6)

  it('returns 0 for Sunday', () => {
    expect(getDayOfWeek('2024-01-07')).toBe(0);
  });

  it('returns 1 for Monday', () => {
    expect(getDayOfWeek('2024-01-08')).toBe(1);
  });

  it('returns 3 for Wednesday', () => {
    expect(getDayOfWeek('2024-01-10')).toBe(3);
  });

  it('returns 5 for Friday', () => {
    expect(getDayOfWeek('2024-01-12')).toBe(5);
  });

  it('returns 6 for Saturday', () => {
    expect(getDayOfWeek('2024-01-13')).toBe(6);
  });

  it('returns the lowercase day name string when asString is true', () => {
    expect(getDayOfWeek('2024-01-07', true)).toBe('sunday');
    expect(getDayOfWeek('2024-01-08', true)).toBe('monday');
    expect(getDayOfWeek('2024-01-10', true)).toBe('wednesday');
    expect(getDayOfWeek('2024-01-13', true)).toBe('saturday');
  });

  it('defaults to returning a number when asString is omitted', () => {
    const result = getDayOfWeek('2024-01-10');
    expect(typeof result).toBe('number');
  });
});

describe('getMilitaryTime', () => {
  it('zero-pads single-digit hours and minutes to HH:MM', () => {
    expect(getMilitaryTime(9, 5)).toBe('09:05');
  });

  it('returns "00:00" for midnight', () => {
    expect(getMilitaryTime(0, 0)).toBe('00:00');
  });

  it('returns "12:00" for noon', () => {
    expect(getMilitaryTime(12, 0)).toBe('12:00');
  });

  it('returns "14:30" for 2:30 PM', () => {
    expect(getMilitaryTime(14, 30)).toBe('14:30');
  });

  it('returns "23:59" for one minute before midnight', () => {
    expect(getMilitaryTime(23, 59)).toBe('23:59');
  });

  it('returns a string matching HH:MM format', () => {
    expect(getMilitaryTime(8, 45)).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe('militaryTimeToFormatted', () => {
  it('converts "00:00" to 12:00 AM style', () => {
    const result = militaryTimeToFormatted('00:00');
    expect(result).toContain('12:00');
    expect(result).toContain('AM');
  });

  it('converts "12:00" to 12:00 PM style', () => {
    const result = militaryTimeToFormatted('12:00');
    expect(result).toContain('12:00');
    expect(result).toContain('PM');
  });

  it('converts "14:30" to 2:30 PM style', () => {
    const result = militaryTimeToFormatted('14:30');
    expect(result).toContain('02:30');
    expect(result).toContain('PM');
  });

  it('converts "09:05" to 9:05 AM style', () => {
    const result = militaryTimeToFormatted('09:05');
    expect(result).toContain('09:05');
    expect(result).toContain('AM');
  });

  it('converts "23:59" to 11:59 PM style', () => {
    const result = militaryTimeToFormatted('23:59');
    expect(result).toContain('11:59');
    expect(result).toContain('PM');
  });

  it('returns a non-empty string', () => {
    expect(militaryTimeToFormatted('08:00')).toBeTruthy();
  });
});

describe('formatName', () => {
  it('returns an empty string when firstName is undefined', () => {
    expect(formatName()).toBe('');
    expect(formatName(undefined)).toBe('');
  });

  it('returns an empty string when firstName is empty string', () => {
    expect(formatName('')).toBe('');
  });

  it('returns just the first name when lastName is not provided', () => {
    expect(formatName('Alice')).toBe('Alice');
  });

  it('returns just the first name when lastName is undefined', () => {
    expect(formatName('Alice', undefined)).toBe('Alice');
  });

  it('returns "FirstName LastName" when both names are provided', () => {
    expect(formatName('Alice', 'Smith')).toBe('Alice Smith');
  });

  it('handles names with spaces', () => {
    expect(formatName('Mary Jane', 'Watson')).toBe('Mary Jane Watson');
  });
});

describe('camelCaseToDisplayForm', () => {
  it('converts a camelCase word to display form', () => {
    expect(camelCaseToDisplayForm('hoursWorked')).toBe('Hours Worked');
  });

  it('converts multi-word camelCase to display form', () => {
    expect(camelCaseToDisplayForm('metPrimarySupporter')).toBe('Met Primary Supporter');
  });

  it('returns the same value for a single lowercase word', () => {
    expect(camelCaseToDisplayForm('meeting')).toBe('Meeting');
  });
});

describe('militaryHours', () => {
  it('returns special-cased "00" morning and "12" evening for hour 12', () => {
    const result = militaryHours(12);
    expect(result.morning).toBe('00');
    expect(result.evening).toBe('12');
  });

  it('returns zero-padded morning and computed evening for hour 1', () => {
    const result = militaryHours(1);
    expect(result.morning).toBe('01');
    // evening: Math.abs(1 - 24) = 23
    expect(result.evening).toBe('23');
  });

  it('returns zero-padded morning and computed evening for hour 6', () => {
    const result = militaryHours(6);
    expect(result.morning).toBe('06');
    // evening: Math.abs(6 - 24) = 18
    expect(result.evening).toBe('18');
  });
});

describe('getPreviousWeek', () => {
  it('returns the date one week earlier', () => {
    expect(getPreviousWeek('2024-01-14')).toBe('2024-01-07');
  });

  it('returns a YYYY-MM-DD formatted string', () => {
    expect(getPreviousWeek('2024-06-15')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('getNextWeek', () => {
  it('returns the date one week later', () => {
    expect(getNextWeek('2024-01-07')).toBe('2024-01-14');
  });

  it('returns a YYYY-MM-DD formatted string', () => {
    expect(getNextWeek('2024-06-15')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('getWeekdayDate', () => {
  it('returns the Sunday of the week for day 0', () => {
    // 2024-01-10 is Wednesday; day 0 of that week is Sunday 2024-01-07
    expect(getWeekdayDate(0, '2024-01-10')).toBe('2024-01-07');
  });

  it('returns the Saturday of the week for day 6', () => {
    // 2024-01-10 is Wednesday; day 6 of that week is Saturday 2024-01-13
    expect(getWeekdayDate(6, '2024-01-10')).toBe('2024-01-13');
  });

  it('returns the same date when day matches the input date', () => {
    // 2024-01-10 is Wednesday = day 3
    expect(getWeekdayDate(3, '2024-01-10')).toBe('2024-01-10');
  });
});

describe('dayIsAfter', () => {
  it('returns true when the first date is after the second', () => {
    expect(dayIsAfter('2024-01-15', '2024-01-14')).toBe(true);
  });

  it('returns false when the first date is before the second', () => {
    expect(dayIsAfter('2024-01-13', '2024-01-14')).toBe(false);
  });

  it('returns false when both dates are the same day', () => {
    expect(dayIsAfter('2024-01-14', '2024-01-14')).toBe(false);
  });
});

describe('dayIsBefore', () => {
  it('returns true when the first date is before the second', () => {
    expect(dayIsBefore('2024-01-13', '2024-01-14')).toBe(true);
  });

  it('returns false when the first date is after the second', () => {
    expect(dayIsBefore('2024-01-15', '2024-01-14')).toBe(false);
  });

  it('returns false when both dates are the same day', () => {
    expect(dayIsBefore('2024-01-14', '2024-01-14')).toBe(false);
  });
});

describe('daysLeft', () => {
  it('returns 7 for Sunday (day 0: 7 - 0 = 7)', () => {
    expect(daysLeft('2024-01-07')).toBe(7);
  });

  it('returns 6 for Monday (day 1: 7 - 1 = 6)', () => {
    expect(daysLeft('2024-01-08')).toBe(6);
  });

  it('returns 1 for Saturday (day 6: 7 - 6 = 1)', () => {
    expect(daysLeft('2024-01-13')).toBe(1);
  });
});
