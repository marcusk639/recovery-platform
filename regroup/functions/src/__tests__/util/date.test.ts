// src/__tests__/util/date.test.ts
import {
  daysOfWeek,
  camelCaseToDisplayForm,
  getYesterdaysDate,
  getStartOfWeek,
  getEndOfWeek,
  getTodaysDate,
  getCurrentTime,
  getDayOfWeek,
  getWeekdayDate,
  getMilitaryTime,
  dateIsAfter,
  dayIsAfter,
  dayIsBefore,
  getWeekdayRange,
  dateIsInWeek,
  dayDiff,
} from '../../util/date';
import moment from 'moment';

describe('daysOfWeek', () => {
  it('has 7 entries starting with sunday', () => {
    expect(daysOfWeek).toHaveLength(7);
    expect(daysOfWeek[0]).toBe('sunday');
    expect(daysOfWeek[6]).toBe('saturday');
  });
});

describe('camelCaseToDisplayForm', () => {
  it('converts camelCase to Title Case with spaces', () => {
    expect(camelCaseToDisplayForm('houseId')).toBe('House Id');
  });
  it('handles already-capitalized first letter', () => {
    expect(camelCaseToDisplayForm('AdminName')).toBe(' Admin Name');
  });
});

describe('getYesterdaysDate', () => {
  it('returns a date one day before today in YYYY-MM-DD format', () => {
    const yesterday = moment().subtract(1, 'day').format('YYYY-MM-DD');
    expect(getYesterdaysDate()).toBe(yesterday);
  });
});

describe('getStartOfWeek', () => {
  it('returns Sunday of the week for a mid-week date', () => {
    expect(getStartOfWeek('2024-01-17')).toBe('2024-01-14'); // Wednesday → Sunday
  });
});

describe('getEndOfWeek', () => {
  it('returns Saturday of the week for a mid-week date', () => {
    expect(getEndOfWeek('2024-01-17')).toBe('2024-01-20'); // Wednesday → Saturday
  });
});

describe('getTodaysDate', () => {
  it('returns today in YYYY-MM-DD format', () => {
    expect(getTodaysDate()).toBe(moment().format('YYYY-MM-DD'));
  });
});

describe('getCurrentTime', () => {
  it('returns an ISO 8601 formatted string', () => {
    expect(getCurrentTime()).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('getDayOfWeek', () => {
  it('returns 0 for Sunday', () => expect(getDayOfWeek('2024-01-14')).toBe(0));
  it('returns 1 for Monday', () => expect(getDayOfWeek('2024-01-15')).toBe(1));
  it('returns 6 for Saturday', () => expect(getDayOfWeek('2024-01-20')).toBe(6));
});

describe('getMilitaryTime', () => {
  it('formats 9:05 AM correctly', () => expect(getMilitaryTime(9, 5)).toBe('09:05'));
  it('formats 14:30 correctly', () => expect(getMilitaryTime(14, 30)).toBe('14:30'));
});

describe('dateIsAfter', () => {
  it('returns true when first date is after second', () => {
    expect(dateIsAfter('2024-01-20', '2024-01-15')).toBe(true);
  });
  it('returns false when first date is before second', () => {
    expect(dateIsAfter('2024-01-10', '2024-01-15')).toBe(false);
  });
});

describe('dayDiff', () => {
  it('returns absolute day difference', () => {
    expect(dayDiff('2024-01-10', '2024-01-15')).toBe(5);
    expect(dayDiff('2024-01-15', '2024-01-10')).toBe(5);
  });
  it('returns 0 for same date', () => {
    expect(dayDiff('2024-01-10', '2024-01-10')).toBe(0);
  });
});

describe('dateIsInWeek', () => {
  it('returns true when date falls within the week', () => {
    expect(dateIsInWeek('2024-01-17', '2024-01-14', '2024-01-20')).toBe(true);
  });
  it('returns true for boundary dates', () => {
    expect(dateIsInWeek('2024-01-14', '2024-01-14', '2024-01-20')).toBe(true);
    expect(dateIsInWeek('2024-01-20', '2024-01-14', '2024-01-20')).toBe(true);
  });
  it('returns false when date is outside the week', () => {
    expect(dateIsInWeek('2024-01-21', '2024-01-14', '2024-01-20')).toBe(false);
  });
});
