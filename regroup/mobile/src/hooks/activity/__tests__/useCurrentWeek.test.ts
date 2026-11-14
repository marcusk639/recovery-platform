/**
 * useCurrentWeek Hook Tests
 *
 * Tests for week date calculation utilities
 */

import { renderHook } from '@testing-library/react-native';
import {
  daysLeftInWeek,
  getWeekDatesForDate,
  useCurrentWeek,
} from '../useCurrentWeek';

describe('useCurrentWeek', () => {
  describe('Week Date Calculations', () => {
    it('should return Monday as week start', () => {
      // Test with a known Monday
      const monday = new Date('2024-01-08T12:00:00Z'); // Monday
      const { startDate, endDate } = getWeekDatesForDate(monday);

      expect(startDate).toBe('2024-01-08');
      expect(endDate).toBe('2024-01-14'); // Sunday
    });

    it('should return previous Monday for Tuesday', () => {
      const tuesday = new Date('2024-01-09T12:00:00Z');
      const { startDate } = getWeekDatesForDate(tuesday);

      expect(startDate).toBe('2024-01-08'); // Previous Monday
    });

    it('should return previous Monday for Sunday', () => {
      const sunday = new Date('2024-01-14T12:00:00Z');
      const { startDate } = getWeekDatesForDate(sunday);

      expect(startDate).toBe('2024-01-08'); // Previous Monday
    });

    it('should calculate 7-day week range', () => {
      const monday = new Date('2024-01-08T12:00:00Z');
      const { startDate, endDate } = getWeekDatesForDate(monday);

      const start = new Date(startDate + 'T00:00:00Z');
      const end = new Date(endDate + 'T00:00:00Z');
      const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);

      expect(diffDays).toBe(6); // 6 days difference (7 days inclusive)
    });

    it('should handle month boundary correctly', () => {
      const date = new Date('2024-02-01T12:00:00Z'); // Thursday
      const { startDate, endDate } = getWeekDatesForDate(date);

      expect(startDate).toBe('2024-01-29'); // Previous Monday in January
      expect(endDate).toBe('2024-02-04'); // Sunday in February
    });

    it('should handle year boundary correctly', () => {
      const date = new Date('2024-01-03T12:00:00Z'); // Wednesday
      const { startDate, endDate } = getWeekDatesForDate(date);

      expect(startDate).toBe('2024-01-01'); // Monday, Jan 1
      expect(endDate).toBe('2024-01-07'); // Sunday
    });

    it('should handle leap year correctly', () => {
      const leapDay = new Date('2024-02-29T12:00:00Z'); // Thursday
      const { startDate, endDate } = getWeekDatesForDate(leapDay);

      expect(startDate).toBe('2024-02-26'); // Monday
      expect(endDate).toBe('2024-03-03'); // Sunday (crosses into March)
    });
  });

  describe('Edge Cases', () => {
    it('should handle date strings', () => {
      const dateStr = '2024-01-10'; // Wednesday
      const { startDate } = getWeekDatesForDate(dateStr);

      expect(startDate).toBe('2024-01-08'); // Monday
    });

    it('should handle Date objects', () => {
      const dateObj = new Date('2024-01-10T12:00:00Z'); // Wednesday
      const { startDate } = getWeekDatesForDate(dateObj);

      expect(startDate).toBe('2024-01-08'); // Monday
    });

    it('should be consistent across multiple calls', () => {
      const date = new Date('2024-01-10T12:00:00Z');
      const result1 = getWeekDatesForDate(date);
      const result2 = getWeekDatesForDate(date);

      expect(result1.startDate).toBe(result2.startDate);
      expect(result1.endDate).toBe(result2.endDate);
    });
  });

  // The same answers as the server's weekStartFor (functions weekSummaryMath), which
  // decides the week an activity counts toward.
  describe('in the house timezone', () => {
    const CHICAGO = 'America/Chicago';

    it('stays in the ending week on a Sunday evening in the US, when UTC is already Monday', () => {
      const sundayEvening = new Date('2026-11-09T00:57:00Z');
      expect(getWeekDatesForDate(sundayEvening, CHICAGO)).toEqual({
        startDate: '2026-11-02',
        endDate: '2026-11-08',
      });
    });

    it('stays in the ending week until the last minute of Sunday', () => {
      expect(getWeekDatesForDate(new Date('2026-11-09T05:59:00Z'), CHICAGO).startDate).toBe('2026-11-02');
    });

    it('starts the new week at local midnight on Monday', () => {
      expect(getWeekDatesForDate(new Date('2026-11-09T06:00:00Z'), CHICAGO).startDate).toBe('2026-11-09');
    });

    it('starts the week early east of UTC', () => {
      const mondayInTokyo = new Date('2026-11-08T16:00:00Z');
      expect(getWeekDatesForDate(mondayInTokyo, 'Asia/Tokyo').startDate).toBe('2026-11-09');
    });

    it('handles the Sunday daylight saving ends', () => {
      expect(getWeekDatesForDate(new Date('2026-11-01T12:00:00Z'), CHICAGO).startDate).toBe('2026-10-26');
    });

    it.each(['', undefined, 'Not/AZone'])(
      "falls back to the server's default zone for %p",
      timeZone => {
        const sundayInNewYork = new Date('2026-11-09T04:30:00Z');
        expect(getWeekDatesForDate(sundayInNewYork, timeZone).startDate).toBe('2026-11-02');
      },
    );

    it('useCurrentWeek uses the zone it is given', () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-11-09T00:57:00Z'));
      try {
        const { result } = renderHook(() => useCurrentWeek(CHICAGO));
        expect(result.current.startDate).toBe('2026-11-02');
        expect(result.current.endDate).toBe('2026-11-08');
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('daysLeftInWeek', () => {
    const CHICAGO = 'America/Chicago';

    it('is 0 on the last day of the week, not 7', () => {
      expect(daysLeftInWeek('2026-11-08', new Date('2026-11-09T00:57:00Z'), CHICAGO)).toBe(0);
    });

    it('is 6 on Monday', () => {
      expect(daysLeftInWeek('2026-11-08', new Date('2026-11-02T18:00:00Z'), CHICAGO)).toBe(6);
    });
  });
});
