// src/util/__tests__/dateWithTimezone.test.ts
//
// Unit tests for dateWithTimezone.ts.
// Uses moment-timezone — no React Native dependencies, no mocks needed.

import {
  getTodaysDateInTimezone,
  getStartOfWeekInTimezone,
  getEndOfWeekInTimezone,
  getWeekdayDateInTimezone,
  weekIsCurrentInTimezone,
  getCurrentTimeWithTimezone,
  dateIsInWeekWithTimezone,
  dayDifference,
  isValidDateString,
  getDeviceTimezone,
  DEFAULT_TIMEZONE,
} from '../dateWithTimezone';

// ─── DEFAULT_TIMEZONE ─────────────────────────────────────────────────────────

describe('DEFAULT_TIMEZONE', () => {
  it('is America/New_York', () => {
    expect(DEFAULT_TIMEZONE).toBe('America/New_York');
  });
});

// ─── isValidDateString ────────────────────────────────────────────────────────

describe('isValidDateString', () => {
  it('returns true for a valid YYYY-MM-DD string', () => {
    expect(isValidDateString('2024-06-15')).toBe(true);
  });

  it('returns false for an invalid date string', () => {
    expect(isValidDateString('not-a-date')).toBe(false);
  });

  it('returns false for a date in wrong format (MM/DD/YYYY)', () => {
    expect(isValidDateString('06/15/2024')).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(isValidDateString('')).toBe(false);
  });

  it('returns false for an impossible date like 2024-02-30', () => {
    expect(isValidDateString('2024-02-30')).toBe(false);
  });

  it('returns true for a leap-year date 2024-02-29', () => {
    expect(isValidDateString('2024-02-29')).toBe(true);
  });

  it('returns false for 2023-02-29 (not a leap year)', () => {
    expect(isValidDateString('2023-02-29')).toBe(false);
  });
});

// ─── getTodaysDateInTimezone ──────────────────────────────────────────────────

describe('getTodaysDateInTimezone', () => {
  it('returns a string matching YYYY-MM-DD format', () => {
    const result = getTodaysDateInTimezone();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns a valid date string', () => {
    expect(isValidDateString(getTodaysDateInTimezone())).toBe(true);
  });

  it('accepts a specific timezone without throwing', () => {
    expect(() => getTodaysDateInTimezone('America/Los_Angeles')).not.toThrow();
  });

  it('falls back to DEFAULT_TIMEZONE when no timezone provided', () => {
    const withDefault = getTodaysDateInTimezone(DEFAULT_TIMEZONE);
    const withoutArg = getTodaysDateInTimezone();
    // Both should return dates in the same timezone — on any given day they are equal
    expect(withDefault).toBe(withoutArg);
  });
});

// ─── getStartOfWeekInTimezone ─────────────────────────────────────────────────

describe('getStartOfWeekInTimezone', () => {
  it('returns the Sunday of a week containing a Wednesday', () => {
    // 2024-01-10 is a Wednesday; week starts Sunday 2024-01-07
    expect(getStartOfWeekInTimezone('2024-01-10', 'UTC')).toBe('2024-01-07');
  });

  it('returns the same date when input is already a Sunday', () => {
    expect(getStartOfWeekInTimezone('2024-01-07', 'UTC')).toBe('2024-01-07');
  });

  it('returns a YYYY-MM-DD formatted string', () => {
    expect(getStartOfWeekInTimezone('2024-06-15', 'UTC')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('does not throw when called with no arguments', () => {
    expect(() => getStartOfWeekInTimezone()).not.toThrow();
  });
});

// ─── getEndOfWeekInTimezone ───────────────────────────────────────────────────

describe('getEndOfWeekInTimezone', () => {
  it('returns the Saturday of a week containing a Wednesday', () => {
    // 2024-01-10 is a Wednesday; week ends Saturday 2024-01-13
    expect(getEndOfWeekInTimezone('2024-01-10', 'UTC')).toBe('2024-01-13');
  });

  it('returns the same date when input is already a Saturday', () => {
    expect(getEndOfWeekInTimezone('2024-01-13', 'UTC')).toBe('2024-01-13');
  });

  it('returns a YYYY-MM-DD formatted string', () => {
    expect(getEndOfWeekInTimezone('2024-06-15', 'UTC')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('end of week is always 6 days after start of week', () => {
    const start = getStartOfWeekInTimezone('2024-03-20', 'UTC');
    const end = getEndOfWeekInTimezone('2024-03-20', 'UTC');
    expect(dayDifference(start, end)).toBe(6);
  });
});

// ─── getWeekdayDateInTimezone ─────────────────────────────────────────────────

describe('getWeekdayDateInTimezone', () => {
  it('returns the Sunday (day 0) of the week containing the given date', () => {
    // 2024-01-10 = Wednesday; day 0 = Sunday 2024-01-07
    expect(getWeekdayDateInTimezone(0, '2024-01-10', 'UTC')).toBe('2024-01-07');
  });

  it('returns the Saturday (day 6) of the week containing the given date', () => {
    expect(getWeekdayDateInTimezone(6, '2024-01-10', 'UTC')).toBe('2024-01-13');
  });

  it('returns the same date when day index matches the input date\'s weekday', () => {
    // 2024-01-10 is Wednesday = day 3
    expect(getWeekdayDateInTimezone(3, '2024-01-10', 'UTC')).toBe('2024-01-10');
  });

  it('returns a YYYY-MM-DD formatted string', () => {
    expect(getWeekdayDateInTimezone(1, '2024-06-15', 'UTC')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ─── weekIsCurrentInTimezone ──────────────────────────────────────────────────

describe('weekIsCurrentInTimezone', () => {
  it('returns true when provided start/end exactly match the current week boundaries', () => {
    const tz = 'UTC';
    // Compute current week boundaries using the same utility
    const today = getTodaysDateInTimezone(tz);
    const start = getStartOfWeekInTimezone(today, tz);
    const end = getEndOfWeekInTimezone(today, tz);
    expect(weekIsCurrentInTimezone(start, end, tz)).toBe(true);
  });

  it('returns false when the provided week is a past week', () => {
    expect(weekIsCurrentInTimezone('2020-01-05', '2020-01-11', 'UTC')).toBe(false);
  });

  it('returns false when the provided week is a future week', () => {
    expect(weekIsCurrentInTimezone('2099-01-05', '2099-01-11', 'UTC')).toBe(false);
  });
});

// ─── getCurrentTimeWithTimezone ───────────────────────────────────────────────

describe('getCurrentTimeWithTimezone', () => {
  it('returns a non-empty string', () => {
    expect(getCurrentTimeWithTimezone()).toBeTruthy();
  });

  it('returns a string that can be parsed as a valid date', () => {
    const result = getCurrentTimeWithTimezone('UTC');
    expect(new Date(result).toString()).not.toBe('Invalid Date');
  });

  it('does not throw when called with a valid timezone', () => {
    expect(() => getCurrentTimeWithTimezone('America/Chicago')).not.toThrow();
  });
});

// ─── dateIsInWeekWithTimezone ─────────────────────────────────────────────────

describe('dateIsInWeekWithTimezone', () => {
  it('returns true when date falls within the given week', () => {
    expect(
      dateIsInWeekWithTimezone('2024-01-10', '2024-01-07', '2024-01-13', 'UTC'),
    ).toBe(true);
  });

  it('returns true for the start boundary date (inclusive)', () => {
    expect(
      dateIsInWeekWithTimezone('2024-01-07', '2024-01-07', '2024-01-13', 'UTC'),
    ).toBe(true);
  });

  it('returns true for the end boundary date (inclusive)', () => {
    expect(
      dateIsInWeekWithTimezone('2024-01-13', '2024-01-07', '2024-01-13', 'UTC'),
    ).toBe(true);
  });

  it('returns false when date is before the week start', () => {
    expect(
      dateIsInWeekWithTimezone('2024-01-06', '2024-01-07', '2024-01-13', 'UTC'),
    ).toBe(false);
  });

  it('returns false when date is after the week end', () => {
    expect(
      dateIsInWeekWithTimezone('2024-01-14', '2024-01-07', '2024-01-13', 'UTC'),
    ).toBe(false);
  });
});

// ─── dayDifference ────────────────────────────────────────────────────────────

describe('dayDifference', () => {
  it('returns 0 for two identical dates', () => {
    expect(dayDifference('2024-01-10', '2024-01-10')).toBe(0);
  });

  it('returns 1 for consecutive dates', () => {
    expect(dayDifference('2024-01-10', '2024-01-11')).toBe(1);
  });

  it('returns the absolute value regardless of argument order', () => {
    expect(dayDifference('2024-01-15', '2024-01-10')).toBe(5);
    expect(dayDifference('2024-01-10', '2024-01-15')).toBe(5);
  });

  it('returns 7 for dates one week apart', () => {
    expect(dayDifference('2024-01-07', '2024-01-14')).toBe(7);
  });

  it('correctly handles month boundaries', () => {
    expect(dayDifference('2024-01-31', '2024-02-01')).toBe(1);
  });
});

// ─── getDeviceTimezone ────────────────────────────────────────────────────────

describe('getDeviceTimezone', () => {
  it('returns a non-empty string', () => {
    expect(getDeviceTimezone()).toBeTruthy();
  });

  it('returns a string that looks like a valid timezone', () => {
    const tz = getDeviceTimezone();
    // Timezones are like "America/New_York", "UTC", "Europe/London", etc.
    expect(typeof tz).toBe('string');
    expect(tz.length).toBeGreaterThan(0);
  });
});
