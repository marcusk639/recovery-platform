/**
 * useCurrentWeek Hook Tests
 *
 * Tests for week date calculation utilities
 */

import {
  getWeekDatesForDate,
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
});
