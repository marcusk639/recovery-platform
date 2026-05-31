// src/integration/weekSummary.integration.test.ts
// Requires Firebase emulator: firebase emulators:start --only firestore,auth
// Run with: npm run test:integration

import {
  logActivity,
  getWeekSummary,
} from '../services/activity';
import {
  ActivityType,
  ActivityDataFactory,
} from '../entities/ActivityModel';
import { firestore } from '../../firebase-setup';

const TEST_GUEST = 'summary-guest-1';
const TEST_HOUSE = 'summary-house-1';
// Week of 2026-02-16 (Monday)
const WEEK_START = '2026-02-16';
const WEEK_START_DATE = new Date('2026-02-16T12:00:00.000Z');

describe('week summary updates (integration)', () => {
  const createdActivityIds: string[] = [];

  afterEach(async () => {
    // Clean up the week summary document written during the test
    const docId = `${TEST_GUEST}_${WEEK_START}`;
    await firestore.collection('week-summaries').doc(docId).delete();

    // Also delete all activity documents created during the test
    await Promise.all(
      createdActivityIds.map(id =>
        firestore.collection('activities').doc(id).delete(),
      ),
    );
    createdActivityIds.length = 0;
  });

  it('increments choresCompleted when a chore is logged', async () => {
    const activity = await logActivity(
      TEST_GUEST,
      TEST_HOUSE,
      ActivityType.CHORE,
      ActivityDataFactory.chore('daily', 'Kitchen'),
      'user-1',
      WEEK_START_DATE,
    );
    createdActivityIds.push(activity.id);

    const summary = await getWeekSummary(TEST_GUEST, WEEK_START);

    expect(summary).not.toBeNull();
    expect(summary?.guestId).toBe(TEST_GUEST);
    expect(summary?.stats.choresCompleted).toBe(1);
  });

  it('increments meetingsAttended when a meeting is logged', async () => {
    const activity = await logActivity(
      TEST_GUEST,
      TEST_HOUSE,
      ActivityType.MEETING,
      ActivityDataFactory.meeting('AA Tuesday', 'AA', 60),
      'user-1',
      WEEK_START_DATE,
    );
    createdActivityIds.push(activity.id);

    const summary = await getWeekSummary(TEST_GUEST, WEEK_START);

    expect(summary).not.toBeNull();
    expect(summary?.guestId).toBe(TEST_GUEST);
    expect(summary?.stats.meetingsAttended).toBe(1);
  });

  it('aggregates both chores and meetings in weekly stats', async () => {
    // Log one chore and one meeting in the same week
    const chore = await logActivity(
      TEST_GUEST,
      TEST_HOUSE,
      ActivityType.CHORE,
      ActivityDataFactory.chore('daily', 'Bathroom'),
      'user-1',
      WEEK_START_DATE,
    );
    createdActivityIds.push(chore.id);

    const meeting = await logActivity(
      TEST_GUEST,
      TEST_HOUSE,
      ActivityType.MEETING,
      ActivityDataFactory.meeting('NA Monday', 'NA', 60),
      'user-1',
      WEEK_START_DATE,
    );
    createdActivityIds.push(meeting.id);

    const summary = await getWeekSummary(TEST_GUEST, WEEK_START);

    expect(summary).not.toBeNull();
    expect(summary?.stats.choresCompleted).toBe(1);
    expect(summary?.stats.meetingsAttended).toBe(1);
    expect(summary?.activityCount).toBe(2);
  });

  it('returns null for a week with no logged activities', async () => {
    // No activities logged for this guest/week combination
    const summary = await getWeekSummary('no-activities-guest', '2026-01-01');

    expect(summary).toBeNull();
  });

  it('week summary document id follows guestId_weekStart format', async () => {
    const activity = await logActivity(
      TEST_GUEST,
      TEST_HOUSE,
      ActivityType.CHORE,
      ActivityDataFactory.chore('weekly', 'Vacuuming'),
      'user-1',
      WEEK_START_DATE,
    );
    createdActivityIds.push(activity.id);

    const summary = await getWeekSummary(TEST_GUEST, WEEK_START);

    expect(summary).not.toBeNull();
    expect(summary?.id).toBe(`${TEST_GUEST}_${WEEK_START}`);
    expect(summary?.startDate).toBe(WEEK_START);
    expect(summary?.houseId).toBe(TEST_HOUSE);
  });
});
