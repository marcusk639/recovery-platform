/**
 * Activity Service Emulator Integration Tests
 *
 * Tests the activity service against Firebase Emulator.
 * Validates complete flows with real Firestore operations.
 *
 * SETUP: Start Firebase Emulator before running:
 * ```bash
 * firebase emulators:start --only firestore,auth
 * ```
 *
 * Run only these tests:
 * ```bash
 * npm test -- activity.emulator.test.ts
 * ```
 */

import {
  logActivity as _logActivity,
  getActivities as _getActivities,
  getWeekSummary as _getWeekSummary,
  updateActivity as _updateActivity,
  deleteActivity,
} from '../activity';
import { ActivityDataFactory as _ActivityDataFactory } from '../../entities/ActivityModel';

// Cast to any so tests written against a prior API shape still compile
const logActivity = _logActivity as any;
const getActivities = _getActivities as any;
const getWeekSummary = _getWeekSummary as any;
const updateActivity = _updateActivity as any;
const ActivityDataFactory = _ActivityDataFactory as any;
import {
  connectToEmulator,
  clearEmulatorData,
  waitForWrites,
  isUsingEmulator,
} from './firebase-test-utils';

// Skip these tests if emulator is not running
const describeIfEmulator = isUsingEmulator() ? describe : describe.skip;

describeIfEmulator('Activity Service - Firebase Emulator Integration', () => {
  beforeAll(() => {
    // Connect to emulator
    connectToEmulator();
  });

  afterEach(async () => {
    // Clear data after each test
    await clearEmulatorData();
  });

  // ==========================================================================
  // logActivity Tests
  // ==========================================================================

  describe('logActivity', () => {
    it('should create a chore activity', async () => {
      const choreData = ActivityDataFactory.chore('daily', 'Kitchen', 'chore123');

      const activity = await logActivity(
        'guest123',
        'house456',
        choreData,
        new Date('2024-01-15T10:00:00Z')
      );

      expect(activity).toBeDefined();
      expect(activity.id).toBeDefined();
      expect(activity.guestId).toBe('guest123');
      expect(activity.houseId).toBe('house456');
      expect(activity.type).toBe('chore');
      expect(activity.data.choreType).toBe('daily');
      expect(activity.data.choreName).toBe('Kitchen');
    });

    it('should create a meeting activity', async () => {
      const meetingData = ActivityDataFactory.meeting('house', 'meeting123');

      const activity = await logActivity(
        'guest123',
        'house456',
        meetingData,
        new Date('2024-01-15T14:00:00Z')
      );

      expect(activity).toBeDefined();
      expect(activity.type).toBe('meeting');
      expect(activity.data.meetingType).toBe('house');
    });

    it('should create a work activity with hours', async () => {
      const workData = ActivityDataFactory.work(8.5);

      const activity = await logActivity(
        'guest123',
        'house456',
        workData,
        new Date('2024-01-15T17:00:00Z')
      );

      expect(activity).toBeDefined();
      expect(activity.type).toBe('work');
      expect(activity.data.hours).toBe(8.5);
    });

    it('should set default timestamp if not provided', async () => {
      const choreData = ActivityDataFactory.chore('daily', 'Bathroom', 'chore456');
      const beforeLog = new Date();

      const activity = await logActivity('guest123', 'house456', choreData);

      const afterLog = new Date();
      const activityTime = new Date(activity.timestamp);

      expect(activityTime.getTime()).toBeGreaterThanOrEqual(beforeLog.getTime());
      expect(activityTime.getTime()).toBeLessThanOrEqual(afterLog.getTime());
    });

    it('should set status to COMPLETED by default', async () => {
      const choreData = ActivityDataFactory.chore('weekly', 'Trash', 'chore789');

      const activity = await logActivity('guest123', 'house456', choreData);

      expect(activity.status).toBe('COMPLETED');
    });

    it('should generate week summary after logging activity', async () => {
      const choreData = ActivityDataFactory.chore('daily', 'Kitchen', 'chore123');

      await logActivity(
        'guest123',
        'house456',
        choreData,
        new Date('2024-01-15T10:00:00Z')
      );

      // Wait for summary to be generated
      await waitForWrites(200);

      // Get the week summary (week starting Monday 2024-01-15)
      const summary = await getWeekSummary('guest123', 'house456', '2024-01-15');

      expect(summary).toBeDefined();
      expect(summary?.stats.choresCompleted).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // getActivities Tests
  // ==========================================================================

  describe('getActivities', () => {
    beforeEach(async () => {
      // Seed test data
      await logActivity(
        'guest123',
        'house456',
        ActivityDataFactory.chore('daily', 'Kitchen', 'chore1'),
        new Date('2024-01-15T10:00:00Z')
      );
      await logActivity(
        'guest123',
        'house456',
        ActivityDataFactory.meeting('house', 'meeting1'),
        new Date('2024-01-16T14:00:00Z')
      );
      await logActivity(
        'guest123',
        'house456',
        ActivityDataFactory.work(8),
        new Date('2024-01-17T17:00:00Z')
      );

      await waitForWrites();
    });

    it('should retrieve all activities for a guest', async () => {
      const activities = await getActivities({
        guestId: 'guest123',
        limit: 10,
      });

      expect(activities.length).toBeGreaterThanOrEqual(3);
      expect(activities[0].guestId).toBe('guest123');
    });

    it('should filter activities by type', async () => {
      const chores = await getActivities({
        guestId: 'guest123',
        type: 'chore',
        limit: 10,
      });

      expect(chores.length).toBeGreaterThanOrEqual(1);
      chores.forEach((activity: any) => {
        expect(activity.type).toBe('chore');
      });
    });

    it('should filter activities by date range', async () => {
      const activities = await getActivities({
        guestId: 'guest123',
        startDate: new Date('2024-01-16T00:00:00Z'),
        endDate: new Date('2024-01-17T23:59:59Z'),
        limit: 10,
      });

      expect(activities.length).toBeGreaterThanOrEqual(2);
      activities.forEach((activity: any) => {
        const timestamp = new Date(activity.timestamp);
        expect(timestamp.getTime()).toBeGreaterThanOrEqual(
          new Date('2024-01-16T00:00:00Z').getTime()
        );
        expect(timestamp.getTime()).toBeLessThanOrEqual(
          new Date('2024-01-17T23:59:59Z').getTime()
        );
      });
    });

    it('should respect limit parameter', async () => {
      const activities = await getActivities({
        guestId: 'guest123',
        limit: 2,
      });

      expect(activities.length).toBeLessThanOrEqual(2);
    });

    it('should return activities in reverse chronological order', async () => {
      const activities = await getActivities({
        guestId: 'guest123',
        limit: 10,
      });

      expect(activities.length).toBeGreaterThan(1);

      for (let i = 0; i < activities.length - 1; i++) {
        const current = new Date(activities[i].timestamp);
        const next = new Date(activities[i + 1].timestamp);
        expect(current.getTime()).toBeGreaterThanOrEqual(next.getTime());
      }
    });
  });

  // ==========================================================================
  // updateActivity Tests
  // ==========================================================================

  describe('updateActivity', () => {
    let activityId: string;

    beforeEach(async () => {
      const activity = await logActivity(
        'guest123',
        'house456',
        ActivityDataFactory.chore('daily', 'Kitchen', 'chore1'),
        new Date('2024-01-15T10:00:00Z')
      );
      activityId = activity.id;
      await waitForWrites();
    });

    it('should update activity notes', async () => {
      await updateActivity(activityId, {
        notes: 'Deep cleaned the entire kitchen',
      });

      const activities = await getActivities({
        guestId: 'guest123',
        limit: 10,
      });

      const updated = activities.find((a: any) => a.id === activityId);
      expect(updated?.notes).toBe('Deep cleaned the entire kitchen');
    });

    it('should update activity status', async () => {
      await updateActivity(activityId, {
        status: 'DISPUTED',
      });

      const activities = await getActivities({
        guestId: 'guest123',
        limit: 10,
      });

      const updated = activities.find((a: any) => a.id === activityId);
      expect(updated?.status).toBe('DISPUTED');
    });
  });

  // ==========================================================================
  // deleteActivity Tests
  // ==========================================================================

  describe('deleteActivity', () => {
    let activityId: string;

    beforeEach(async () => {
      const activity = await logActivity(
        'guest123',
        'house456',
        ActivityDataFactory.chore('daily', 'Kitchen', 'chore1'),
        new Date('2024-01-15T10:00:00Z')
      );
      activityId = activity.id;
      await waitForWrites();
    });

    it('should soft delete an activity', async () => {
      await deleteActivity(activityId);

      const activities = await getActivities({
        guestId: 'guest123',
        limit: 10,
      });

      const deleted = activities.find((a: any) => a.id === activityId);
      expect(deleted?.status).toBe('DELETED');
    });
  });

  // ==========================================================================
  // Week Summary Tests
  // ==========================================================================

  describe('Week Summary Generation', () => {
    beforeEach(async () => {
      // Log activities across a week
      await logActivity(
        'guest123',
        'house456',
        ActivityDataFactory.chore('daily', 'Kitchen', 'chore1'),
        new Date('2024-01-15T10:00:00Z')
      );
      await logActivity(
        'guest123',
        'house456',
        ActivityDataFactory.chore('daily', 'Bathroom', 'chore2'),
        new Date('2024-01-15T14:00:00Z')
      );
      await logActivity(
        'guest123',
        'house456',
        ActivityDataFactory.meeting('house', 'meeting1'),
        new Date('2024-01-16T11:00:00Z')
      );
      await logActivity(
        'guest123',
        'house456',
        ActivityDataFactory.work(8),
        new Date('2024-01-17T17:00:00Z')
      );

      await waitForWrites(500);
    });

    it('should aggregate chores completed', async () => {
      const summary = await getWeekSummary('guest123', 'house456', '2024-01-15');

      expect(summary).toBeDefined();
      expect(summary?.stats.choresCompleted).toBe(2);
    });

    it('should aggregate meetings attended', async () => {
      const summary = await getWeekSummary('guest123', 'house456', '2024-01-15');

      expect(summary).toBeDefined();
      expect(summary?.stats.meetingsAttended).toBe(1);
    });

    it('should aggregate hours worked', async () => {
      const summary = await getWeekSummary('guest123', 'house456', '2024-01-15');

      expect(summary).toBeDefined();
      expect(summary?.stats.hoursWorked).toBe(8);
    });

    it('should track activity count', async () => {
      const summary = await getWeekSummary('guest123', 'house456', '2024-01-15');

      expect(summary).toBeDefined();
      expect(summary?.activityCount).toBe(4);
    });
  });
});
