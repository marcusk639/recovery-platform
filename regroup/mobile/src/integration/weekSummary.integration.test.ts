// src/integration/weekSummary.integration.test.ts
// Requires Firebase emulator: firebase emulators:start --only firestore,auth
// Run with: npm run test:integration
//
// week-summaries are written by the onActivityWritten Cloud Function
// (regroup/functions), not by the app. These tests pin the client side of
// that contract against a real Firestore: logActivity writes only the
// activity, and getWeekSummary reads the server-written {guestId}_{weekStart}
// doc. The aggregation itself is tested in regroup/functions.

import { logActivity, getWeekSummary } from '../services/activity';
import { ActivityType, ActivityDataFactory } from '../entities/ActivityModel';
import { firestore } from '../../firebase-setup';

const TEST_GUEST = 'summary-guest-1';
const TEST_HOUSE = 'summary-house-1';
// Week of 2026-02-16 (Monday)
const WEEK_START = '2026-02-16';
const WEEK_START_DATE = new Date('2026-02-16T12:00:00.000Z');
const SUMMARY_ID = `${TEST_GUEST}_${WEEK_START}`;

/** A summary as the onActivityWritten trigger writes it. */
const serverSummary = (stats: Record<string, number>, activityCount: number) => ({
  id: SUMMARY_ID,
  guestId: TEST_GUEST,
  houseId: TEST_HOUSE,
  startDate: WEEK_START,
  endDate: '2026-02-22',
  stats: {
    choresCompleted: 0,
    meetingsAttended: 0,
    hoursWorked: 0,
    medicationTaken: 0,
    primarySupporterMet: 0,
    ...stats,
  },
  dailyStats: {},
  activityCount,
  lastUpdated: new Date(),
});

describe('week summary updates (integration)', () => {
  const createdActivityIds: string[] = [];

  afterEach(async () => {
    await firestore.collection('week-summaries').doc(SUMMARY_ID).delete();
    await Promise.all(
      createdActivityIds.map((id) => firestore.collection('activities').doc(id).delete()),
    );
    createdActivityIds.length = 0;
  });

  it('logging a chore writes the activity and leaves the summary to the server', async () => {
    const activity = await logActivity(
      TEST_GUEST,
      TEST_HOUSE,
      ActivityType.CHORE,
      ActivityDataFactory.chore('daily', 'Kitchen'),
      'user-1',
      WEEK_START_DATE,
    );
    createdActivityIds.push(activity.id);

    const saved = await firestore.collection('activities').doc(activity.id).get();
    expect(saved.exists).toBe(true);
    expect(await getWeekSummary(TEST_GUEST, WEEK_START)).toBeNull();
  });

  it('logging a meeting does not create or change a summary the server wrote', async () => {
    await firestore
      .collection('week-summaries')
      .doc(SUMMARY_ID)
      .set(serverSummary({ choresCompleted: 1 }, 1));

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
    expect(summary?.stats.meetingsAttended).toBe(0);
    expect(summary?.activityCount).toBe(1);
  });

  it('getWeekSummary returns the server-aggregated chores and meetings', async () => {
    await firestore
      .collection('week-summaries')
      .doc(SUMMARY_ID)
      .set(serverSummary({ choresCompleted: 1, meetingsAttended: 1 }, 2));

    const summary = await getWeekSummary(TEST_GUEST, WEEK_START);

    expect(summary).not.toBeNull();
    expect(summary?.stats.choresCompleted).toBe(1);
    expect(summary?.stats.meetingsAttended).toBe(1);
    expect(summary?.activityCount).toBe(2);
    expect(summary?.lastUpdated).toBeInstanceOf(Date);
  });

  it('returns null for a week with no logged activities', async () => {
    // No activities logged for this guest/week combination
    const summary = await getWeekSummary('no-activities-guest', '2026-01-01');

    expect(summary).toBeNull();
  });

  it('week summary document id follows guestId_weekStart format', async () => {
    await firestore
      .collection('week-summaries')
      .doc(SUMMARY_ID)
      .set(serverSummary({ choresCompleted: 1 }, 1));

    const summary = await getWeekSummary(TEST_GUEST, WEEK_START);

    expect(summary).not.toBeNull();
    expect(summary?.id).toBe(`${TEST_GUEST}_${WEEK_START}`);
    expect(summary?.startDate).toBe(WEEK_START);
    expect(summary?.houseId).toBe(TEST_HOUSE);
  });
});
