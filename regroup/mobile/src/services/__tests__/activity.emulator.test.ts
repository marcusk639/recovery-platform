/**
 * Activity Service Emulator Integration Tests
 *
 * Tests the activity service against the Firestore and Auth emulators, signed
 * in as a house admin, so the security rules judge every write.
 *
 * Week summaries are written by the onActivityWritten Cloud Function
 * (regroup/functions), which is not running here. The summary tests below pin
 * the client's half: the activities it stores carry what the server counts
 * (type, status, timestamp, data.hoursWorked). The counting itself is tested
 * in regroup/functions (weekSummaryMath.test.ts, syncWeekSummary*.test.ts).
 *
 * Run with: npm run test:integration (see jest.config.integration.js)
 */

import {
  logActivity,
  getActivities,
  getActivitiesPage,
  getWeekSummary,
  updateActivity,
  deleteActivity,
} from '../activity';
import {
  ActivityDataFactory,
  ActivityStatus,
  ActivityType,
  ActivityData,
} from '../../entities/ActivityModel';
import { connectToEmulator, clearEmulatorData, isUsingEmulator } from './firebase-test-utils';
import { adminDb } from '../../integration/firebase-admin-setup';
import { adminOf, signInAs } from '../../integration/actors';

const GUEST = 'guest123';
const HOUSE = 'house456';
const ADMIN = 'emulator-admin-1';
// Week of Monday 2024-01-15.
const WEEK_START = new Date('2024-01-15T00:00:00Z');
const WEEK_END = new Date('2024-01-22T00:00:00Z');

const log = (type: ActivityType, data: ActivityData, at?: Date) =>
  logActivity(GUEST, HOUSE, type, data, ADMIN, at);

const listWeek = (type?: ActivityType) => getActivities(GUEST, HOUSE, WEEK_START, WEEK_END, type);

/** The guest's stored activities in the week, as the server trigger reads them. */
async function storedWeek() {
  const snap = await adminDb.collection('activities').where('guestId', '==', GUEST).get();
  return snap.docs
    .map((d) => d.data())
    .filter((a) => {
      const at = a.timestamp?.toDate?.();
      return at instanceof Date && at >= WEEK_START && at < WEEK_END;
    });
}

// Skip these tests if emulator is not running
const describeIfEmulator = isUsingEmulator() ? describe : describe.skip;

describeIfEmulator('Activity Service - Firebase Emulator Integration', () => {
  beforeAll(async () => {
    // Connect to emulator
    connectToEmulator();
    // The service runs as a house admin, for a guest of that house.
    await adminDb.doc(`guests/${GUEST}`).set({ id: GUEST, houseId: HOUSE });
    await signInAs(ADMIN, adminOf(HOUSE));
  });

  afterAll(async () => {
    await adminDb.doc(`guests/${GUEST}`).delete();
  });

  afterEach(async () => {
    // Clear data after each test
    await clearEmulatorData(GUEST);
  });

  // ==========================================================================
  // logActivity Tests
  // ==========================================================================

  describe('logActivity', () => {
    it('should create a chore activity', async () => {
      const activity = await log(
        ActivityType.CHORE,
        ActivityDataFactory.chore('daily', 'Kitchen', 'chore123'),
        new Date('2024-01-15T10:00:00Z'),
      );

      expect(activity.id).toBeDefined();
      expect(activity.guestId).toBe(GUEST);
      expect(activity.houseId).toBe(HOUSE);
      expect(activity.type).toBe(ActivityType.CHORE);
      const saved = (await adminDb.doc(`activities/${activity.id}`).get()).data();
      expect(saved?.data).toMatchObject({ choreType: 'daily', choreName: 'Kitchen' });
    });

    it('should create a meeting activity', async () => {
      const activity = await log(
        ActivityType.MEETING,
        ActivityDataFactory.meeting('House meeting', 'house', 60, 'meeting123'),
        new Date('2024-01-15T14:00:00Z'),
      );

      expect(activity.type).toBe(ActivityType.MEETING);
      const saved = (await adminDb.doc(`activities/${activity.id}`).get()).data();
      expect(saved?.data).toMatchObject({ meetingType: 'house', meetingName: 'House meeting' });
    });

    it('should create a work activity with hours', async () => {
      const activity = await log(
        ActivityType.WORK,
        ActivityDataFactory.work('Warehouse', 8.5),
        new Date('2024-01-15T17:00:00Z'),
      );

      expect(activity.type).toBe(ActivityType.WORK);
      const saved = (await adminDb.doc(`activities/${activity.id}`).get()).data();
      expect(saved?.data.hoursWorked).toBe(8.5);
    });

    it('should set default timestamp if not provided', async () => {
      const beforeLog = new Date();

      const activity = await log(
        ActivityType.CHORE,
        ActivityDataFactory.chore('daily', 'Bathroom', 'chore456'),
      );

      const afterLog = new Date();
      const activityTime = new Date(activity.timestamp);
      expect(activityTime.getTime()).toBeGreaterThanOrEqual(beforeLog.getTime());
      expect(activityTime.getTime()).toBeLessThanOrEqual(afterLog.getTime());
    });

    it('should set status to active, unverified and logged by the caller by default', async () => {
      const activity = await log(
        ActivityType.CHORE,
        ActivityDataFactory.chore('weekly', 'Trash', 'chore789'),
      );

      const saved = (await adminDb.doc(`activities/${activity.id}`).get()).data();
      expect(saved?.status).toBe(ActivityStatus.ACTIVE);
      expect(saved?.verified).toBe(false);
      expect(saved?.loggedBy).toBe(ADMIN);
    });

    it('should leave the week summary to the server (logging writes none)', async () => {
      await log(
        ActivityType.CHORE,
        ActivityDataFactory.chore('daily', 'Kitchen', 'chore123'),
        new Date('2024-01-15T10:00:00Z'),
      );

      expect(await getWeekSummary(GUEST, '2024-01-15')).toBeNull();
    });
  });

  // ==========================================================================
  // getActivities Tests
  // ==========================================================================

  describe('getActivities', () => {
    beforeEach(async () => {
      await log(
        ActivityType.CHORE,
        ActivityDataFactory.chore('daily', 'Kitchen', 'chore1'),
        new Date('2024-01-15T10:00:00Z'),
      );
      await log(
        ActivityType.MEETING,
        ActivityDataFactory.meeting('House meeting', 'house', 60, 'meeting1'),
        new Date('2024-01-16T14:00:00Z'),
      );
      await log(
        ActivityType.WORK,
        ActivityDataFactory.work('Warehouse', 8),
        new Date('2024-01-17T17:00:00Z'),
      );
    });

    it('should retrieve all activities for a guest', async () => {
      const activities = await listWeek();

      expect(activities).toHaveLength(3);
      activities.forEach((activity) => expect(activity.guestId).toBe(GUEST));
    });

    it('should filter activities by type', async () => {
      const chores = await listWeek(ActivityType.CHORE);

      expect(chores).toHaveLength(1);
      expect(chores[0].type).toBe(ActivityType.CHORE);
    });

    it('should filter activities by date range', async () => {
      const from = new Date('2024-01-16T00:00:00Z');
      const to = new Date('2024-01-18T00:00:00Z');

      const activities = await getActivities(GUEST, HOUSE, from, to);

      expect(activities.map((a) => a.type).sort()).toEqual([
        ActivityType.MEETING,
        ActivityType.WORK,
      ]);
      activities.forEach((activity) => {
        const timestamp = new Date(activity.timestamp).getTime();
        expect(timestamp).toBeGreaterThanOrEqual(from.getTime());
        expect(timestamp).toBeLessThan(to.getTime());
      });
    });

    it('should respect limit parameter', async () => {
      const page = await getActivitiesPage(GUEST, HOUSE, WEEK_START, WEEK_END, 2);

      expect(page.activities).toHaveLength(2);
      expect(page.hasMore).toBe(true);
      const next = await getActivitiesPage(GUEST, HOUSE, WEEK_START, WEEK_END, 2, page.nextCursor);
      expect(next.activities).toHaveLength(1);
      expect(next.hasMore).toBe(false);
    });

    it('should return activities in reverse chronological order', async () => {
      const activities = await listWeek();

      expect(activities.map((a) => a.type)).toEqual([
        ActivityType.WORK,
        ActivityType.MEETING,
        ActivityType.CHORE,
      ]);
    });
  });

  // ==========================================================================
  // updateActivity Tests
  // ==========================================================================

  describe('updateActivity', () => {
    let activityId: string;

    beforeEach(async () => {
      const activity = await log(
        ActivityType.CHORE,
        ActivityDataFactory.chore('daily', 'Kitchen', 'chore1'),
        new Date('2024-01-15T10:00:00Z'),
      );
      activityId = activity.id;
    });

    it('should update activity notes', async () => {
      await updateActivity(activityId, { notes: 'Deep cleaned the entire kitchen' });

      const updated = (await listWeek()).find((a) => a.id === activityId);
      expect(updated?.notes).toBe('Deep cleaned the entire kitchen');
    });

    it('should not update activity status into a dispute (disputeActivity does that)', async () => {
      await expect(
        updateActivity(activityId, { status: ActivityStatus.DISPUTED }),
      ).rejects.toMatchObject({ cause: { code: 'firestore/permission-denied' } });

      const saved = (await adminDb.doc(`activities/${activityId}`).get()).data();
      expect(saved?.status).toBe(ActivityStatus.ACTIVE);
    });
  });

  // ==========================================================================
  // deleteActivity Tests
  // ==========================================================================

  describe('deleteActivity', () => {
    let activityId: string;

    beforeEach(async () => {
      const activity = await log(
        ActivityType.CHORE,
        ActivityDataFactory.chore('daily', 'Kitchen', 'chore1'),
        new Date('2024-01-15T10:00:00Z'),
      );
      activityId = activity.id;
    });

    it('should soft delete an activity', async () => {
      await deleteActivity(activityId);

      const saved = await adminDb.doc(`activities/${activityId}`).get();
      expect(saved.exists).toBe(true);
      expect(saved.data()?.status).toBe(ActivityStatus.DELETED);
      expect((await listWeek()).find((a) => a.id === activityId)).toBeUndefined();
    });
  });

  // ==========================================================================
  // Week Summary Tests
  // ==========================================================================

  describe('Week Summary Generation', () => {
    beforeEach(async () => {
      // Log activities across a week
      await log(
        ActivityType.CHORE,
        ActivityDataFactory.chore('daily', 'Kitchen', 'chore1'),
        new Date('2024-01-15T10:00:00Z'),
      );
      await log(
        ActivityType.CHORE,
        ActivityDataFactory.chore('daily', 'Bathroom', 'chore2'),
        new Date('2024-01-15T14:00:00Z'),
      );
      await log(
        ActivityType.MEETING,
        ActivityDataFactory.meeting('House meeting', 'house', 60, 'meeting1'),
        new Date('2024-01-16T11:00:00Z'),
      );
      await log(
        ActivityType.WORK,
        ActivityDataFactory.work('Warehouse', 8),
        new Date('2024-01-17T17:00:00Z'),
      );
    });

    it('should store the chores the server aggregates', async () => {
      const chores = (await storedWeek()).filter((a) => a.type === ActivityType.CHORE);

      expect(chores).toHaveLength(2);
      chores.forEach((a) => expect(a.status).toBe(ActivityStatus.ACTIVE));
    });

    it('should store the meetings the server aggregates', async () => {
      const meetings = (await storedWeek()).filter((a) => a.type === ActivityType.MEETING);

      expect(meetings).toHaveLength(1);
      expect(meetings[0].status).toBe(ActivityStatus.ACTIVE);
    });

    it('should store the hours worked as a number the server sums', async () => {
      const work = (await storedWeek()).filter((a) => a.type === ActivityType.WORK);

      expect(work).toHaveLength(1);
      expect(work[0].data.hoursWorked).toBe(8);
    });

    it('should store every activity with a timestamp the server can date', async () => {
      expect(await storedWeek()).toHaveLength(4);
    });
  });
});
