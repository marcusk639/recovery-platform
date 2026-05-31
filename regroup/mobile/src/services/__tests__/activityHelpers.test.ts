/**
 * Activity Helper Functions Tests
 *
 * Unit tests for helper functions used in activity service:
 * - Date utilities (getWeekStart, getWeekEnd, getDateString)
 * - Activity type mapping
 * - Data validation
 */

describe('Activity Helper Functions', () => {
  // ==========================================================================
  // getWeekStart Tests
  // ==========================================================================

  describe('getWeekStart', () => {
    /**
     * Helper to get week start date (Monday) from any date
     * Uses UTC methods to avoid timezone issues
     */
    function getWeekStart(date: Date): string {
      const d = new Date(date);
      const day = d.getUTCDay();
      const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
      d.setUTCDate(diff);
      d.setUTCHours(0, 0, 0, 0);
      return d.toISOString().split('T')[0];
    }

    it('should return Monday for a Monday date', () => {
      const monday = new Date('2024-01-08T12:00:00Z'); // Monday in UTC
      const weekStart = getWeekStart(monday);

      expect(weekStart).toBe('2024-01-08');
    });

    it('should return previous Monday for a Tuesday', () => {
      const tuesday = new Date('2024-01-09T12:00:00Z'); // Tuesday
      const weekStart = getWeekStart(tuesday);

      expect(weekStart).toBe('2024-01-08'); // Previous Monday
    });

    it('should return previous Monday for a Wednesday', () => {
      const wednesday = new Date('2024-01-10T12:00:00Z');
      const weekStart = getWeekStart(wednesday);

      expect(weekStart).toBe('2024-01-08');
    });

    it('should return previous Monday for a Thursday', () => {
      const thursday = new Date('2024-01-11T12:00:00Z');
      const weekStart = getWeekStart(thursday);

      expect(weekStart).toBe('2024-01-08');
    });

    it('should return previous Monday for a Friday', () => {
      const friday = new Date('2024-01-12T12:00:00Z');
      const weekStart = getWeekStart(friday);

      expect(weekStart).toBe('2024-01-08');
    });

    it('should return previous Monday for a Saturday', () => {
      const saturday = new Date('2024-01-13T12:00:00Z');
      const weekStart = getWeekStart(saturday);

      expect(weekStart).toBe('2024-01-08');
    });

    it('should return previous Monday for a Sunday', () => {
      const sunday = new Date('2024-01-14T12:00:00Z');
      const weekStart = getWeekStart(sunday);

      expect(weekStart).toBe('2024-01-08');
    });

    it('should handle date at month boundary', () => {
      const date = new Date('2024-02-01T12:00:00Z'); // Thursday, Feb 1
      const weekStart = getWeekStart(date);

      expect(weekStart).toBe('2024-01-29'); // Previous Monday in January
    });

    it('should handle date at year boundary', () => {
      const date = new Date('2024-01-03T12:00:00Z'); // Wednesday, Jan 3
      const weekStart = getWeekStart(date);

      expect(weekStart).toBe('2024-01-01'); // Monday, January 1st
    });

    it('should handle leap year date', () => {
      const date = new Date('2024-02-29T12:00:00Z'); // Leap day, Thursday
      const weekStart = getWeekStart(date);

      expect(weekStart).toBe('2024-02-26'); // Monday
    });

    it('should always return midnight time', () => {
      const date = new Date('2024-01-10T15:30:45Z'); // Wednesday with time
      const weekStart = getWeekStart(date);

      // Week start should be at midnight
      expect(weekStart).toBe('2024-01-08');
      expect(weekStart).toMatch(/^\d{4}-\d{2}-\d{2}$/); // Just date, no time
    });

    it('should handle date with timezone', () => {
      const date = new Date('2024-01-10T23:59:59-08:00'); // Wednesday with PST timezone
      const weekStart = getWeekStart(date);

      // Should still calculate correctly (converts to UTC Thursday, so Monday is Jan 8)
      expect(weekStart).toBe('2024-01-08');
    });
  });

  // ==========================================================================
  // getWeekEnd Tests
  // ==========================================================================

  describe('getWeekEnd', () => {
    /**
     * Helper to get week end date (Sunday) from start date
     * Uses UTC to avoid timezone issues
     */
    function getWeekEnd(startDate: string): string {
      const d = new Date(startDate + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + 6);
      return d.toISOString().split('T')[0];
    }

    it('should return Sunday 6 days after Monday', () => {
      const weekEnd = getWeekEnd('2024-01-08'); // Monday

      expect(weekEnd).toBe('2024-01-14'); // Sunday
    });

    it('should handle month boundary', () => {
      const weekEnd = getWeekEnd('2024-01-29'); // Monday

      expect(weekEnd).toBe('2024-02-04'); // Sunday in next month
    });

    it('should handle year boundary', () => {
      const weekEnd = getWeekEnd('2023-12-25'); // Monday

      expect(weekEnd).toBe('2023-12-31'); // Sunday, New Year's Eve
    });

    it('should handle leap year', () => {
      const weekEnd = getWeekEnd('2024-02-26'); // Monday

      expect(weekEnd).toBe('2024-03-03'); // Sunday (includes leap day)
    });

    it('should be consistent with getWeekStart', () => {
      function getWeekStart(date: Date): string {
        const d = new Date(date);
        const day = d.getUTCDay();
        const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
        d.setUTCDate(diff);
        d.setUTCHours(0, 0, 0, 0);
        return d.toISOString().split('T')[0];
      }

      const anyDate = new Date('2024-01-10T12:00:00Z'); // Wednesday
      const weekStart = getWeekStart(anyDate);
      const weekEnd = getWeekEnd(weekStart);

      // Verify it's exactly 6 days later
      const start = new Date(weekStart + 'T00:00:00Z');
      const end = new Date(weekEnd + 'T00:00:00Z');
      const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);

      expect(diffDays).toBe(6);
    });
  });

  // ==========================================================================
  // getDateString Tests
  // ==========================================================================

  describe('getDateString', () => {
    /**
     * Helper to get date string from Date object
     */
    function getDateString(date: Date | string): string {
      if (typeof date === 'string') {
        return date.split('T')[0];
      }
      return date.toISOString().split('T')[0];
    }

    it('should extract date from Date object', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      const dateString = getDateString(date);

      expect(dateString).toBe('2024-01-15');
    });

    it('should handle ISO string input', () => {
      const isoString = '2024-01-15T19:45:30Z';
      const dateString = getDateString(isoString);

      expect(dateString).toBe('2024-01-15');
    });

    it('should handle date-only string input', () => {
      const dateOnly = '2024-01-15';
      const dateString = getDateString(dateOnly);

      expect(dateString).toBe('2024-01-15');
    });

    it('should strip time from ISO string', () => {
      const withTime = '2024-01-15T23:59:59.999Z';
      const dateString = getDateString(withTime);

      expect(dateString).toBe('2024-01-15');
      expect(dateString).not.toContain('T');
      expect(dateString).not.toContain(':');
    });

    it('should handle midnight date', () => {
      const midnight = new Date('2024-01-15T00:00:00Z');
      const dateString = getDateString(midnight);

      expect(dateString).toBe('2024-01-15');
    });

    it('should handle date at different timezone', () => {
      const date = new Date('2024-01-15T10:30:00-08:00');
      const dateString = getDateString(date);

      // Should extract UTC date
      expect(dateString).toMatch(/^2024-01-\d{2}$/);
    });
  });

  // ==========================================================================
  // Week Date Range Tests
  // ==========================================================================

  describe('Week Date Range Calculations', () => {
    function getWeekStart(date: Date): string {
      const d = new Date(date);
      const day = d.getUTCDay();
      const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
      d.setUTCDate(diff);
      d.setUTCHours(0, 0, 0, 0);
      return d.toISOString().split('T')[0];
    }

    function getWeekEnd(startDate: string): string {
      const d = new Date(startDate + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + 6);
      return d.toISOString().split('T')[0];
    }

    it('should create consistent week ranges', () => {
      const dates = [
        new Date('2024-01-08T12:00:00Z'), // Monday
        new Date('2024-01-09T12:00:00Z'), // Tuesday
        new Date('2024-01-10T12:00:00Z'), // Wednesday
        new Date('2024-01-11T12:00:00Z'), // Thursday
        new Date('2024-01-12T12:00:00Z'), // Friday
        new Date('2024-01-13T12:00:00Z'), // Saturday
        new Date('2024-01-14T12:00:00Z'), // Sunday
      ];

      const weekStarts = dates.map(d => getWeekStart(d));
      const uniqueStarts = new Set(weekStarts);

      // All dates in same week should have same start
      expect(uniqueStarts.size).toBe(1);
      expect(uniqueStarts.has('2024-01-08')).toBe(true);
    });

    it('should create 7-day weeks', () => {
      const testDates = [
        '2024-01-01T12:00:00Z', // New Year
        '2024-02-29T12:00:00Z', // Leap day
        '2024-06-15T12:00:00Z', // Mid year
        '2024-12-25T12:00:00Z', // Christmas
      ];

      testDates.forEach(dateStr => {
        const date = new Date(dateStr);
        const weekStart = getWeekStart(date);
        const weekEnd = getWeekEnd(weekStart);

        const start = new Date(weekStart + 'T00:00:00Z');
        const end = new Date(weekEnd + 'T00:00:00Z');
        const days = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);

        expect(days).toBe(6); // 6 days between start and end (inclusive is 7)
      });
    });

    it('should handle full year of weeks', () => {
      const weekStarts = new Set<string>();

      // Generate all Mondays in 2024
      let currentDate = new Date('2024-01-01T12:00:00Z');
      while (currentDate.getUTCFullYear() === 2024) {
        const weekStart = getWeekStart(currentDate);
        weekStarts.add(weekStart);
        currentDate.setUTCDate(currentDate.getUTCDate() + 7);
      }

      // Should have ~52-53 unique week starts in a year
      expect(weekStarts.size).toBeGreaterThanOrEqual(52);
      expect(weekStarts.size).toBeLessThanOrEqual(53);
    });
  });

  // ==========================================================================
  // Date Validation Tests
  // ==========================================================================

  describe('Date Validation', () => {
    function isValidDateString(dateString: string): boolean {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(dateString)) return false;

      const date = new Date(dateString + 'T00:00:00Z');
      if (isNaN(date.getTime())) return false;

      // Verify the date parts match (catches invalid dates like 2024-02-30)
      const [year, month, day] = dateString.split('-').map(Number);
      return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() + 1 === month &&
        date.getUTCDate() === day
      );
    }

    it('should validate correct date format', () => {
      expect(isValidDateString('2024-01-15')).toBe(true);
      expect(isValidDateString('2024-12-31')).toBe(true);
      expect(isValidDateString('2024-02-29')).toBe(true); // Leap year
    });

    it('should reject invalid date format', () => {
      expect(isValidDateString('2024-1-15')).toBe(false); // Single digit month
      expect(isValidDateString('2024-01-5')).toBe(false); // Single digit day
      expect(isValidDateString('01-15-2024')).toBe(false); // Wrong order
      expect(isValidDateString('2024/01/15')).toBe(false); // Wrong separator
    });

    it('should reject invalid dates', () => {
      expect(isValidDateString('2024-02-30')).toBe(false); // Feb 30 doesn't exist
      expect(isValidDateString('2024-13-01')).toBe(false); // Month 13 doesn't exist
      expect(isValidDateString('2024-00-01')).toBe(false); // Month 0 doesn't exist
    });

    it('should reject dates with time', () => {
      expect(isValidDateString('2024-01-15T10:30:00')).toBe(false);
      expect(isValidDateString('2024-01-15 10:30:00')).toBe(false);
    });

    it('should handle leap year validation', () => {
      expect(isValidDateString('2024-02-29')).toBe(true); // 2024 is leap year
      expect(isValidDateString('2023-02-29')).toBe(false); // 2023 is not
    });
  });
});
