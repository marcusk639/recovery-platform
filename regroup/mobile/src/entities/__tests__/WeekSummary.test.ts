/**
 * WeekSummary Entity Unit Tests
 *
 * Comprehensive tests for WeekSummary entities, helper functions,
 * and data initialization utilities.
 */

import {
  WeekSummary,
  WeekSummaryEntity,
  WeekStats,
  DailyStats,
  createEmptyDailyStats,
  createEmptyWeekStats,
  initializeDailyStats,
  isWeekSummary,
} from '../WeekSummary';

describe('WeekSummary', () => {
  // ============================================================================
  // WeekSummaryEntity Creation
  // ============================================================================

  describe('WeekSummaryEntity', () => {
    it('should create week summary entity with required fields', () => {
      const summary = new WeekSummaryEntity(
        'guest123',
        'house456',
        '2024-01-15',
        '2024-01-21'
      );

      expect(summary.id).toBe('guest123_2024-01-15');
      expect(summary.guestId).toBe('guest123');
      expect(summary.houseId).toBe('house456');
      expect(summary.startDate).toBe('2024-01-15');
      expect(summary.endDate).toBe('2024-01-21');
      expect(summary.lastUpdated).toBeInstanceOf(Date);
    });

    it('should initialize with zero stats', () => {
      const summary = new WeekSummaryEntity(
        'guest123',
        'house456',
        '2024-01-15',
        '2024-01-21'
      );

      expect(summary.stats.choresCompleted).toBe(0);
      expect(summary.stats.meetingsAttended).toBe(0);
      expect(summary.stats.hoursWorked).toBe(0);
      expect(summary.stats.medicationTaken).toBe(0);
      expect(summary.stats.primarySupporterMet).toBe(0);
    });

    it('should initialize with empty daily stats object', () => {
      const summary = new WeekSummaryEntity(
        'guest123',
        'house456',
        '2024-01-15',
        '2024-01-21'
      );

      expect(summary.dailyStats).toEqual({});
    });

    it('should initialize activity count to zero', () => {
      const summary = new WeekSummaryEntity(
        'guest123',
        'house456',
        '2024-01-15',
        '2024-01-21'
      );

      expect(summary.activityCount).toBe(0);
    });

    it('should generate correct ID format', () => {
      const summary = new WeekSummaryEntity(
        'guest-abc-123',
        'house456',
        '2024-02-05',
        '2024-02-11'
      );

      expect(summary.id).toBe('guest-abc-123_2024-02-05');
    });
  });

  // ============================================================================
  // createEmptyDailyStats
  // ============================================================================

  describe('createEmptyDailyStats', () => {
    it('should create daily stats with all zero values', () => {
      const stats = createEmptyDailyStats('2024-01-15');

      expect(stats.date).toBe('2024-01-15');
      expect(stats.choresCompleted).toBe(0);
      expect(stats.meetingsAttended).toBe(0);
      expect(stats.hoursWorked).toBe(0);
      expect(stats.medicationTaken).toBe(0);
      expect(stats.primarySupporterMet).toBe(0);
    });

    it('should preserve date parameter', () => {
      const stats = createEmptyDailyStats('2024-12-25');

      expect(stats.date).toBe('2024-12-25');
    });

    it('should create independent objects', () => {
      const stats1 = createEmptyDailyStats('2024-01-15');
      const stats2 = createEmptyDailyStats('2024-01-16');

      stats1.choresCompleted = 5;

      expect(stats2.choresCompleted).toBe(0); // Should not be affected
      expect(stats1).not.toBe(stats2);
    });
  });

  // ============================================================================
  // createEmptyWeekStats
  // ============================================================================

  describe('createEmptyWeekStats', () => {
    it('should create week stats with all zero values', () => {
      const stats = createEmptyWeekStats();

      expect(stats.choresCompleted).toBe(0);
      expect(stats.meetingsAttended).toBe(0);
      expect(stats.hoursWorked).toBe(0);
      expect(stats.medicationTaken).toBe(0);
      expect(stats.primarySupporterMet).toBe(0);
    });

    it('should create independent objects', () => {
      const stats1 = createEmptyWeekStats();
      const stats2 = createEmptyWeekStats();

      stats1.choresCompleted = 10;
      stats1.hoursWorked = 40;

      expect(stats2.choresCompleted).toBe(0);
      expect(stats2.hoursWorked).toBe(0);
      expect(stats1).not.toBe(stats2);
    });

    it('should have all required properties', () => {
      const stats = createEmptyWeekStats();

      expect(stats).toHaveProperty('choresCompleted');
      expect(stats).toHaveProperty('meetingsAttended');
      expect(stats).toHaveProperty('hoursWorked');
      expect(stats).toHaveProperty('medicationTaken');
      expect(stats).toHaveProperty('primarySupporterMet');
    });
  });

  // ============================================================================
  // initializeDailyStats
  // ============================================================================

  describe('initializeDailyStats', () => {
    it('should create stats for all days in week', () => {
      const dailyStats = initializeDailyStats('2024-01-15', '2024-01-21');

      expect(Object.keys(dailyStats)).toHaveLength(7);
    });

    it('should create stats with correct dates', () => {
      const dailyStats = initializeDailyStats('2024-01-15', '2024-01-21');

      expect(dailyStats).toHaveProperty('2024-01-15');
      expect(dailyStats).toHaveProperty('2024-01-16');
      expect(dailyStats).toHaveProperty('2024-01-17');
      expect(dailyStats).toHaveProperty('2024-01-18');
      expect(dailyStats).toHaveProperty('2024-01-19');
      expect(dailyStats).toHaveProperty('2024-01-20');
      expect(dailyStats).toHaveProperty('2024-01-21');
    });

    it('should initialize each day with zero stats', () => {
      const dailyStats = initializeDailyStats('2024-01-15', '2024-01-21');

      Object.values(dailyStats).forEach(stats => {
        expect(stats.choresCompleted).toBe(0);
        expect(stats.meetingsAttended).toBe(0);
        expect(stats.hoursWorked).toBe(0);
        expect(stats.medicationTaken).toBe(0);
        expect(stats.primarySupporterMet).toBe(0);
      });
    });

    it('should handle single day period', () => {
      const dailyStats = initializeDailyStats('2024-01-15', '2024-01-15');

      expect(Object.keys(dailyStats)).toHaveLength(1);
      expect(dailyStats).toHaveProperty('2024-01-15');
    });

    it('should handle two day period', () => {
      const dailyStats = initializeDailyStats('2024-01-15', '2024-01-16');

      expect(Object.keys(dailyStats)).toHaveLength(2);
      expect(dailyStats).toHaveProperty('2024-01-15');
      expect(dailyStats).toHaveProperty('2024-01-16');
    });

    it('should handle period spanning month boundary', () => {
      const dailyStats = initializeDailyStats('2024-01-28', '2024-02-03');

      expect(Object.keys(dailyStats)).toHaveLength(7);
      expect(dailyStats).toHaveProperty('2024-01-28');
      expect(dailyStats).toHaveProperty('2024-01-31');
      expect(dailyStats).toHaveProperty('2024-02-01');
      expect(dailyStats).toHaveProperty('2024-02-03');
    });

    it('should handle period spanning year boundary', () => {
      const dailyStats = initializeDailyStats('2023-12-28', '2024-01-03');

      expect(Object.keys(dailyStats)).toHaveLength(7);
      expect(dailyStats).toHaveProperty('2023-12-31');
      expect(dailyStats).toHaveProperty('2024-01-01');
      expect(dailyStats).toHaveProperty('2024-01-03');
    });

    it('should handle leap year', () => {
      const dailyStats = initializeDailyStats('2024-02-27', '2024-03-04');

      expect(Object.keys(dailyStats)).toHaveLength(7);
      expect(dailyStats).toHaveProperty('2024-02-29'); // Leap day
      expect(dailyStats).toHaveProperty('2024-03-01');
    });

    it('should create stats with matching date property', () => {
      const dailyStats = initializeDailyStats('2024-01-15', '2024-01-21');

      Object.entries(dailyStats).forEach(([date, stats]) => {
        expect(stats.date).toBe(date);
      });
    });
  });

  // ============================================================================
  // isWeekSummary Type Guard
  // ============================================================================

  describe('isWeekSummary', () => {
    it('should return true for valid WeekSummary', () => {
      const summary: WeekSummary = {
        id: 'guest123_2024-01-15',
        guestId: 'guest123',
        houseId: 'house456',
        startDate: '2024-01-15',
        endDate: '2024-01-21',
        stats: createEmptyWeekStats(),
        dailyStats: {},
        lastUpdated: new Date(),
        activityCount: 0,
      };

      expect(isWeekSummary(summary)).toBe(true);
    });

    it('should return true for WeekSummaryEntity', () => {
      const summary = new WeekSummaryEntity(
        'guest123',
        'house456',
        '2024-01-15',
        '2024-01-21'
      );

      expect(isWeekSummary(summary)).toBe(true);
    });

    it('should return false for null', () => {
      expect(isWeekSummary(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isWeekSummary(undefined)).toBe(false);
    });

    it('should return false for object missing id', () => {
      const invalid = {
        guestId: 'guest123',
        houseId: 'house456',
        stats: {},
        dailyStats: {},
      };

      expect(isWeekSummary(invalid)).toBe(false);
    });

    it('should return false for object missing guestId', () => {
      const invalid = {
        id: 'guest123_2024-01-15',
        houseId: 'house456',
        stats: {},
        dailyStats: {},
      };

      expect(isWeekSummary(invalid)).toBe(false);
    });

    it('should return false for object missing stats', () => {
      const invalid = {
        id: 'guest123_2024-01-15',
        guestId: 'guest123',
        houseId: 'house456',
        dailyStats: {},
      };

      expect(isWeekSummary(invalid)).toBe(false);
    });

    it('should return false for object missing dailyStats', () => {
      const invalid = {
        id: 'guest123_2024-01-15',
        guestId: 'guest123',
        houseId: 'house456',
        stats: {},
      };

      expect(isWeekSummary(invalid)).toBe(false);
    });

    it('should return false for object with wrong types', () => {
      const invalid = {
        id: 123, // Should be string
        guestId: 'guest123',
        stats: {},
        dailyStats: {},
      };

      expect(isWeekSummary(invalid)).toBe(false);
    });

    it('should return false for primitive values', () => {
      expect(isWeekSummary('string')).toBe(false);
      expect(isWeekSummary(123)).toBe(false);
      expect(isWeekSummary(true)).toBe(false);
    });

    it('should return false for empty object', () => {
      expect(isWeekSummary({})).toBe(false);
    });
  });

  // ============================================================================
  // Stats Manipulation
  // ============================================================================

  describe('Stats Manipulation', () => {
    it('should allow updating weekly stats', () => {
      const stats = createEmptyWeekStats();

      stats.choresCompleted = 5;
      stats.meetingsAttended = 3;
      stats.hoursWorked = 40;
      stats.medicationTaken = 7;
      stats.primarySupporterMet = 1;

      expect(stats.choresCompleted).toBe(5);
      expect(stats.meetingsAttended).toBe(3);
      expect(stats.hoursWorked).toBe(40);
      expect(stats.medicationTaken).toBe(7);
      expect(stats.primarySupporterMet).toBe(1);
    });

    it('should allow updating daily stats', () => {
      const stats = createEmptyDailyStats('2024-01-15');

      stats.choresCompleted = 1;
      stats.meetingsAttended = 2;
      stats.hoursWorked = 8;

      expect(stats.choresCompleted).toBe(1);
      expect(stats.meetingsAttended).toBe(2);
      expect(stats.hoursWorked).toBe(8);
    });

    it('should allow decimal hours in weekly stats', () => {
      const stats = createEmptyWeekStats();

      stats.hoursWorked = 37.5;

      expect(stats.hoursWorked).toBe(37.5);
    });

    it('should allow decimal hours in daily stats', () => {
      const stats = createEmptyDailyStats('2024-01-15');

      stats.hoursWorked = 6.5;

      expect(stats.hoursWorked).toBe(6.5);
    });

    it('should allow updating WeekSummaryEntity stats', () => {
      const summary = new WeekSummaryEntity(
        'guest123',
        'house456',
        '2024-01-15',
        '2024-01-21'
      );

      summary.stats.choresCompleted = 7;
      summary.activityCount = 20;

      expect(summary.stats.choresCompleted).toBe(7);
      expect(summary.activityCount).toBe(20);
    });

    it('should allow adding daily stats to summary', () => {
      const summary = new WeekSummaryEntity(
        'guest123',
        'house456',
        '2024-01-15',
        '2024-01-21'
      );

      summary.dailyStats['2024-01-15'] = createEmptyDailyStats('2024-01-15');
      summary.dailyStats['2024-01-15'].choresCompleted = 1;

      expect(summary.dailyStats['2024-01-15'].choresCompleted).toBe(1);
    });
  });
});
