// src/integration/guestWeekTransfer.integration.test.ts
// Requires Firebase emulator: firebase emulators:start --only firestore,auth
// Run with: npm run test:integration
//
// Activities logged in different weeks stay isolated: each week's activity
// query returns only that week, and the app never rewrites another week's
// summary. Summaries themselves are written by the onActivityWritten Cloud
// Function (regroup/functions), whose tests cover week boundaries.

import { logActivity, getActivities, getWeekSummary } from '../services/activity';
import { ActivityType, ActivityDataFactory } from '../entities/ActivityModel';
import { firestore } from '../../firebase-setup';

const TEST_GUEST = 'transfer-guest-1';
const TEST_HOUSE = 'transfer-house-1';

// Week 1: 2026-02-09 (Monday)
const WEEK_1_START = '2026-02-09';
const WEEK_1_DATE = new Date('2026-02-09T12:00:00.000Z');
const WEEK_1_RANGE: [Date, Date] = [
  new Date('2026-02-09T00:00:00.000Z'),
  new Date('2026-02-16T00:00:00.000Z'),
];

// Week 2: 2026-02-16 (Monday) — the following week
const WEEK_2_START = '2026-02-16';
const WEEK_2_DATE = new Date('2026-02-16T12:00:00.000Z');
const WEEK_2_RANGE: [Date, Date] = [
  new Date('2026-02-16T00:00:00.000Z'),
  new Date('2026-02-23T00:00:00.000Z'),
];

describe('guest week transfer (integration)', () => {
  const createdActivityIds: string[] = [];

  const log = async (type: ActivityType, data: any, at: Date) => {
    const activity = await logActivity(TEST_GUEST, TEST_HOUSE, type, data, 'user-1', at);
    createdActivityIds.push(activity.id);
    return activity;
  };

  afterEach(async () => {
    await firestore.collection('week-summaries').doc(`${TEST_GUEST}_${WEEK_1_START}`).delete();
    await firestore.collection('week-summaries').doc(`${TEST_GUEST}_${WEEK_2_START}`).delete();

    await Promise.all(
      createdActivityIds.map((id) => firestore.collection('activities').doc(id).delete()),
    );
    createdActivityIds.length = 0;
  });

  it('activities in different weeks are queried back per week', async () => {
    const w1 = await log(
      ActivityType.CHORE,
      ActivityDataFactory.chore('daily', 'Kitchen'),
      WEEK_1_DATE,
    );
    const w2 = await log(
      ActivityType.CHORE,
      ActivityDataFactory.chore('daily', 'Bathroom'),
      WEEK_2_DATE,
    );

    const week1 = await getActivities(TEST_GUEST, ...WEEK_1_RANGE);
    const week2 = await getActivities(TEST_GUEST, ...WEEK_2_RANGE);

    expect(week1.map((a) => a.id)).toEqual([w1.id]);
    expect(week2.map((a) => a.id)).toEqual([w2.id]);
  });

  it('logging in week 2 does not modify the week 1 summary', async () => {
    // Week 1 summary as the server left it.
    await firestore
      .collection('week-summaries')
      .doc(`${TEST_GUEST}_${WEEK_1_START}`)
      .set({
        id: `${TEST_GUEST}_${WEEK_1_START}`,
        guestId: TEST_GUEST,
        houseId: TEST_HOUSE,
        startDate: WEEK_1_START,
        endDate: '2026-02-15',
        stats: {
          choresCompleted: 1,
          meetingsAttended: 0,
          hoursWorked: 0,
          medicationTaken: 0,
          primarySupporterMet: 0,
        },
        dailyStats: {},
        activityCount: 1,
      });

    await log(
      ActivityType.MEETING,
      ActivityDataFactory.meeting('NA Monday', 'NA', 60),
      WEEK_2_DATE,
    );

    const summaryAfter = await getWeekSummary(TEST_GUEST, WEEK_1_START);
    expect(summaryAfter).not.toBeNull();
    expect(summaryAfter?.stats.choresCompleted).toBe(1);
    expect(summaryAfter?.stats.meetingsAttended).toBe(0);
    expect(summaryAfter?.activityCount).toBe(1);
  });

  it('the week 2 activity query only returns week 2 activities', async () => {
    await log(ActivityType.CHORE, ActivityDataFactory.chore('daily', 'Living Room'), WEEK_1_DATE);
    await log(
      ActivityType.MEETING,
      ActivityDataFactory.meeting('AA Monday', 'AA', 60),
      WEEK_1_DATE,
    );
    const w2 = await log(
      ActivityType.CHORE,
      ActivityDataFactory.chore('weekly', 'Vacuuming'),
      WEEK_2_DATE,
    );

    const week2 = await getActivities(TEST_GUEST, ...WEEK_2_RANGE);
    expect(week2.map((a) => a.id)).toEqual([w2.id]);
    expect(week2[0].type).toBe(ActivityType.CHORE);
  });

  it("the app writes no summary for either week; that is the server's job", async () => {
    await log(ActivityType.CHORE, ActivityDataFactory.chore('daily', 'Dishes'), WEEK_1_DATE);

    expect(await getWeekSummary(TEST_GUEST, WEEK_1_START)).toBeNull();
    expect(await getWeekSummary(TEST_GUEST, WEEK_2_START)).toBeNull();
  });

  it('logged activities carry the guestId and houseId the server keys summaries on', async () => {
    const chore = await log(
      ActivityType.CHORE,
      ActivityDataFactory.chore('daily', 'Kitchen'),
      WEEK_1_DATE,
    );

    const saved = (await firestore.collection('activities').doc(chore.id).get()).data();
    expect(saved?.guestId).toBe(TEST_GUEST);
    expect(saved?.houseId).toBe(TEST_HOUSE);
    expect(saved?.status).toBe('active');
  });
});
