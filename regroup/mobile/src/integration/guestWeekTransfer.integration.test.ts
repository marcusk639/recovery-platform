// src/integration/guestWeekTransfer.integration.test.ts
// Requires Firebase emulator: firebase emulators:start --only firestore,auth
// Run with: npm run test:integration
//
// Tests that activities logged in different weeks produce separate, isolated
// week summaries — i.e., old summaries are preserved and stats don't bleed
// across week boundaries.

import { logActivity, getWeekSummary } from '../services/activity';
import { ActivityType, ActivityDataFactory } from '../entities/ActivityModel';
import { firestore } from '../../firebase-setup';

const TEST_GUEST = 'transfer-guest-1';
const TEST_HOUSE = 'transfer-house-1';

// Week 1: 2026-02-09 (Monday)
const WEEK_1_START = '2026-02-09';
const WEEK_1_DATE = new Date('2026-02-09T12:00:00.000Z');

// Week 2: 2026-02-16 (Monday) — the following week
const WEEK_2_START = '2026-02-16';
const WEEK_2_DATE = new Date('2026-02-16T12:00:00.000Z');

describe('guest week transfer (integration)', () => {
  const createdActivityIds: string[] = [];

  afterEach(async () => {
    await firestore
      .collection('week-summaries')
      .doc(`${TEST_GUEST}_${WEEK_1_START}`)
      .delete();
    await firestore
      .collection('week-summaries')
      .doc(`${TEST_GUEST}_${WEEK_2_START}`)
      .delete();

    await Promise.all(
      createdActivityIds.map(id =>
        firestore.collection('activities').doc(id).delete(),
      ),
    );
    createdActivityIds.length = 0;
  });

  it('activities in different weeks produce separate week summaries', async () => {
    const choreW1 = await logActivity(
      TEST_GUEST,
      TEST_HOUSE,
      ActivityType.CHORE,
      ActivityDataFactory.chore('daily', 'Kitchen'),
      'user-1',
      WEEK_1_DATE,
    );
    createdActivityIds.push(choreW1.id);

    const choreW2 = await logActivity(
      TEST_GUEST,
      TEST_HOUSE,
      ActivityType.CHORE,
      ActivityDataFactory.chore('daily', 'Bathroom'),
      'user-1',
      WEEK_2_DATE,
    );
    createdActivityIds.push(choreW2.id);

    const summary1 = await getWeekSummary(TEST_GUEST, WEEK_1_START);
    const summary2 = await getWeekSummary(TEST_GUEST, WEEK_2_START);

    expect(summary1).not.toBeNull();
    expect(summary1?.startDate).toBe(WEEK_1_START);
    expect(summary1?.stats.choresCompleted).toBe(1);

    expect(summary2).not.toBeNull();
    expect(summary2?.startDate).toBe(WEEK_2_START);
    expect(summary2?.stats.choresCompleted).toBe(1);
  });

  it('logging in week 2 does not modify the week 1 summary', async () => {
    const chore1 = await logActivity(
      TEST_GUEST,
      TEST_HOUSE,
      ActivityType.CHORE,
      ActivityDataFactory.chore('daily', 'Kitchen'),
      'user-1',
      WEEK_1_DATE,
    );
    createdActivityIds.push(chore1.id);

    // Capture week 1 stats before logging in week 2
    const summaryBefore = await getWeekSummary(TEST_GUEST, WEEK_1_START);
    expect(summaryBefore?.stats.choresCompleted).toBe(1);
    expect(summaryBefore?.activityCount).toBe(1);

    // Log a meeting in week 2
    const meeting2 = await logActivity(
      TEST_GUEST,
      TEST_HOUSE,
      ActivityType.MEETING,
      ActivityDataFactory.meeting('NA Monday', 'NA', 60),
      'user-1',
      WEEK_2_DATE,
    );
    createdActivityIds.push(meeting2.id);

    // Week 1 summary must be unchanged
    const summaryAfter = await getWeekSummary(TEST_GUEST, WEEK_1_START);
    expect(summaryAfter).not.toBeNull();
    expect(summaryAfter?.stats.choresCompleted).toBe(1);
    expect(summaryAfter?.stats.meetingsAttended).toBe(0);
    expect(summaryAfter?.activityCount).toBe(1);
  });

  it('week 2 summary only counts week 2 activities', async () => {
    // Log two activities in week 1
    const choreW1 = await logActivity(
      TEST_GUEST,
      TEST_HOUSE,
      ActivityType.CHORE,
      ActivityDataFactory.chore('daily', 'Living Room'),
      'user-1',
      WEEK_1_DATE,
    );
    createdActivityIds.push(choreW1.id);

    const meetingW1 = await logActivity(
      TEST_GUEST,
      TEST_HOUSE,
      ActivityType.MEETING,
      ActivityDataFactory.meeting('AA Monday', 'AA', 60),
      'user-1',
      WEEK_1_DATE,
    );
    createdActivityIds.push(meetingW1.id);

    // Log one chore in week 2
    const choreW2 = await logActivity(
      TEST_GUEST,
      TEST_HOUSE,
      ActivityType.CHORE,
      ActivityDataFactory.chore('weekly', 'Vacuuming'),
      'user-1',
      WEEK_2_DATE,
    );
    createdActivityIds.push(choreW2.id);

    const summary2 = await getWeekSummary(TEST_GUEST, WEEK_2_START);
    expect(summary2).not.toBeNull();
    // Only the week 2 chore should appear
    expect(summary2?.stats.choresCompleted).toBe(1);
    expect(summary2?.stats.meetingsAttended).toBe(0);
    expect(summary2?.activityCount).toBe(1);
  });

  it('returns null for a week with no logged activities', async () => {
    // Log only in week 1
    const chore = await logActivity(
      TEST_GUEST,
      TEST_HOUSE,
      ActivityType.CHORE,
      ActivityDataFactory.chore('daily', 'Dishes'),
      'user-1',
      WEEK_1_DATE,
    );
    createdActivityIds.push(chore.id);

    // Week 2 has no activities — should return null
    const summary2 = await getWeekSummary(TEST_GUEST, WEEK_2_START);
    expect(summary2).toBeNull();
  });

  it('week summaries have the correct guestId and houseId', async () => {
    const chore = await logActivity(
      TEST_GUEST,
      TEST_HOUSE,
      ActivityType.CHORE,
      ActivityDataFactory.chore('daily', 'Kitchen'),
      'user-1',
      WEEK_1_DATE,
    );
    createdActivityIds.push(chore.id);

    const summary = await getWeekSummary(TEST_GUEST, WEEK_1_START);
    expect(summary?.guestId).toBe(TEST_GUEST);
    expect(summary?.houseId).toBe(TEST_HOUSE);
    expect(summary?.id).toBe(`${TEST_GUEST}_${WEEK_1_START}`);
  });
});
