// src/integration/activity.integration.test.ts
// Requires Firebase emulator: firebase emulators:start --only firestore,auth
// Run with: npm run test:integration

import {
  logActivity,
  getActivities,
  disputeActivity,
  resolveDispute,
} from '../services/activity';
import {
  ActivityType,
  ActivityStatus,
  ActivityDataFactory,
} from '../entities/ActivityModel';
import { firestore } from '../../firebase-setup';

const TEST_GUEST = 'integration-guest-1';
const TEST_HOUSE = 'integration-house-1';
// Week of 2026-02-16 (Monday)
const TEST_WEEK_START = new Date('2026-02-16T00:00:00.000Z');
const TEST_WEEK_END = new Date('2026-02-22T23:59:59.000Z');

/**
 * Fetch an activity document directly from Firestore by ID.
 * Needed because getActivities() only returns ACTIVE status activities,
 * so DISPUTED and RESOLVED activities must be read directly.
 */
async function getActivityById(activityId: string): Promise<Record<string, any> | null> {
  const doc = await firestore.collection('activities').doc(activityId).get();
  if (!doc.exists) {
    return null;
  }
  return { id: doc.id, ...doc.data() };
}

describe('activity service (integration)', () => {
  const createdActivityIds: string[] = [];

  afterEach(async () => {
    // Delete all activity documents created during the test
    await Promise.all(
      createdActivityIds.map(id =>
        firestore.collection('activities').doc(id).delete(),
      ),
    );
    createdActivityIds.length = 0;
  });

  describe('logActivity', () => {
    it('creates an activity document in Firestore and is readable back', async () => {
      const activity = await logActivity(
        TEST_GUEST,
        TEST_HOUSE,
        ActivityType.CHORE,
        ActivityDataFactory.chore('daily', 'Kitchen'),
        'user-1',
      );
      createdActivityIds.push(activity.id);

      expect(activity.id).toBeDefined();
      expect(activity.status).toBe(ActivityStatus.ACTIVE);
      expect(activity.type).toBe(ActivityType.CHORE);
      expect(activity.guestId).toBe(TEST_GUEST);
      expect(activity.houseId).toBe(TEST_HOUSE);

      // Verify it is readable back via getActivities
      const activities = await getActivities(TEST_GUEST, TEST_WEEK_START, TEST_WEEK_END);
      const found = activities.find(a => a.id === activity.id);
      expect(found).toBeDefined();
      expect(found?.type).toBe(ActivityType.CHORE);
    });

    it('creates a meeting activity with correct data', async () => {
      const activity = await logActivity(
        TEST_GUEST,
        TEST_HOUSE,
        ActivityType.MEETING,
        ActivityDataFactory.meeting('AA Tuesday', 'AA', 60),
        'user-1',
      );
      createdActivityIds.push(activity.id);

      expect(activity.id).toBeDefined();
      expect(activity.status).toBe(ActivityStatus.ACTIVE);
      expect(activity.type).toBe(ActivityType.MEETING);

      const activities = await getActivities(TEST_GUEST, TEST_WEEK_START, TEST_WEEK_END);
      const found = activities.find(a => a.id === activity.id);
      expect(found).toBeDefined();
      expect(found?.type).toBe(ActivityType.MEETING);
    });
  });

  describe('disputeActivity', () => {
    it('marks activity status as DISPUTED', async () => {
      const activity = await logActivity(
        TEST_GUEST,
        TEST_HOUSE,
        ActivityType.MEETING,
        ActivityDataFactory.meeting('NA Monday', 'NA', 60),
        'user-1',
      );
      createdActivityIds.push(activity.id);

      await disputeActivity(activity.id, 'Not verified', 'user-1');

      // getActivities only returns ACTIVE, so fetch the doc directly
      const disputed = await getActivityById(activity.id);
      expect(disputed).not.toBeNull();
      expect(disputed?.status).toBe(ActivityStatus.DISPUTED);
      expect(disputed?.disputeReason).toBe('Not verified');
    });

    it('keeps a pending dispute in the activities list (it still counts)', async () => {
      const activity = await logActivity(
        TEST_GUEST,
        TEST_HOUSE,
        ActivityType.CHORE,
        ActivityDataFactory.chore('weekly', 'Vacuuming'),
        'user-1',
        new Date('2026-02-17T12:00:00.000Z'), // inside TEST_WEEK
      );
      createdActivityIds.push(activity.id);

      // Confirm it's in the active list before dispute
      const beforeDispute = await getActivities(TEST_GUEST, TEST_WEEK_START, TEST_WEEK_END);
      const foundBefore = beforeDispute.find(a => a.id === activity.id);
      expect(foundBefore).toBeDefined();

      await disputeActivity(activity.id, 'Chore not completed properly', 'house-manager-1');

      // Owner's dispute model: a pending dispute keeps counting, so it stays
      // listed until an admin approves it (incomplete) or it is deleted.
      const afterDispute = await getActivities(TEST_GUEST, TEST_WEEK_START, TEST_WEEK_END);
      const foundAfter = afterDispute.find(a => a.id === activity.id);
      expect(foundAfter?.status).toBe(ActivityStatus.DISPUTED);
    });
  });

  describe('resolveDispute', () => {
    it('reject: marks the activity RESOLVED, disputed rejected, still counted', async () => {
      const activity = await logActivity(
        TEST_GUEST,
        TEST_HOUSE,
        ActivityType.CHORE,
        ActivityDataFactory.chore('daily', 'Bathroom'),
        'user-1',
      );
      createdActivityIds.push(activity.id);

      await disputeActivity(activity.id, 'Error logging', 'user-1');

      // Verify disputed state
      const disputed = await getActivityById(activity.id);
      expect(disputed?.status).toBe(ActivityStatus.DISPUTED);

      await resolveDispute(activity.id, 'admin-1', 'reject');

      // Check resolved state directly from Firestore
      const resolved = await getActivityById(activity.id);
      expect(resolved).not.toBeNull();
      expect(resolved?.status).toBe(ActivityStatus.RESOLVED);
      expect(resolved?.disputed).toBe('rejected');
      expect(resolved?.incomplete).toBe(false);
      expect(resolved?.disputeResolvedBy).toBe('admin-1');
    });

    it('approve: marks the activity incomplete (not done) and keeps it on record', async () => {
      const activity = await logActivity(
        TEST_GUEST,
        TEST_HOUSE,
        ActivityType.MEETING,
        ActivityDataFactory.meeting('NA Friday', 'NA', 60),
        'user-1',
      );
      createdActivityIds.push(activity.id);

      await disputeActivity(activity.id, 'Did not attend', 'house-manager-1');
      await resolveDispute(activity.id, 'admin-1', 'approve');

      const approved = await getActivityById(activity.id);
      expect(approved).not.toBeNull();
      expect(approved?.status).toBe(ActivityStatus.RESOLVED);
      expect(approved?.disputed).toBe('successful');
      expect(approved?.incomplete).toBe(true);
      expect(approved?.disputeOutcome).toBe('incomplete-per-residents');
      expect(approved?.disputeResolvedBy).toBe('admin-1');
    });
  });
});
