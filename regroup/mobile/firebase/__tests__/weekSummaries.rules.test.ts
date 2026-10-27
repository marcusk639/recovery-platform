/**
 * Firestore Security Rules Tests — week-summaries/{guestId}_{weekStart}
 *
 * Summaries are written by the onActivityWritten Cloud Function (Admin SDK,
 * bypasses rules), some time after the activity. Two rules matter:
 *
 *   - read: the app subscribes to `{guestId}_{weekStart}` before the server
 *     has created it. The old rule dereferenced resource.data.houseId, so a
 *     missing doc was denied for everyone and the onSnapshot listener died
 *     before the summary existed. A missing doc must read as "not found".
 *   - write: residents never could write (that was the production bug —
 *     their activities went uncounted). Admin write is kept only for app
 *     versions released before the trigger, which still apply a client-side
 *     +1 that the trigger then overwrites.
 *
 * Requires the Firebase Firestore emulator running on port 8080.
 *
 *   cd firebase && firebase emulators:exec --only firestore --project demo-test \
 *     "cd .. && npx jest --config jest.config.rules.js firebase/__tests__/weekSummaries.rules.test.ts"
 */

import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ID = 'demo-week-summaries-rules-test';
const FIRESTORE_HOST = '127.0.0.1';
const FIRESTORE_PORT = 8080;
const RULES_PATH = path.resolve(__dirname, '../firestore.rules');

const HOUSE_ID = 'house123';
const OTHER_HOUSE_ID = 'house999';
const GUEST_ID = 'guest1';
const SUMMARY_ID = `${GUEST_ID}_2026-01-12`;
const MISSING_ID = `${GUEST_ID}_2026-01-19`;

const guestClaims = (houseId: string) => ({ guest: { [houseId]: true } });
const adminClaims = (houseId: string) => ({ admin: { [houseId]: true } });

const summary = () => ({
  id: SUMMARY_ID,
  guestId: GUEST_ID,
  houseId: HOUSE_ID,
  startDate: '2026-01-12',
  endDate: '2026-01-18',
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

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync(RULES_PATH, 'utf8'),
      host: FIRESTORE_HOST,
      port: FIRESTORE_PORT,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `guests/${GUEST_ID}`), {
      houseId: HOUSE_ID,
      userId: 'residentUid',
    });
    await setDoc(doc(ctx.firestore(), `week-summaries/${SUMMARY_ID}`), summary());
  });
});

afterEach(async () => {
  await testEnv.clearFirestore();
});

const resident = () => testEnv.authenticatedContext('residentUid', guestClaims(HOUSE_ID));
const houseAdmin = () => testEnv.authenticatedContext('adminUid', adminClaims(HOUSE_ID));
const outsider = () => testEnv.authenticatedContext('outsiderUid', guestClaims(OTHER_HOUSE_ID));
const summaryDoc = (
  ctx: ReturnType<RulesTestEnvironment['authenticatedContext']>,
  id = SUMMARY_ID,
) => doc(ctx.firestore(), `week-summaries/${id}`);

describe('week-summaries read', () => {
  it('lets a resident read a summary the server has not created yet (as not-found)', async () => {
    const snap = await assertSucceeds(getDoc(summaryDoc(resident(), MISSING_ID)));
    expect(snap.exists()).toBe(false);
  });

  it('lets an admin read a summary the server has not created yet', async () => {
    await assertSucceeds(getDoc(summaryDoc(houseAdmin(), MISSING_ID)));
  });

  it('BLOCKS an unauthenticated read of a missing summary', async () => {
    const anon = testEnv.unauthenticatedContext();
    await assertFails(getDoc(doc(anon.firestore(), `week-summaries/${MISSING_ID}`)));
  });

  it('lets a resident of the house read an existing summary', async () => {
    const snap = await assertSucceeds(getDoc(summaryDoc(resident())));
    expect(snap.data()?.stats.choresCompleted).toBe(1);
  });

  it('BLOCKS a member of another house from reading an existing summary', async () => {
    await assertFails(getDoc(summaryDoc(outsider())));
  });

  it('still lets a resident run the history query (guestId + houseId)', async () => {
    const q = query(
      collection(resident().firestore(), 'week-summaries'),
      where('guestId', '==', GUEST_ID),
      where('houseId', '==', HOUSE_ID),
    );
    const snap = await assertSucceeds(getDocs(q));
    expect(snap.size).toBe(1);
  });
});

describe('week-summaries missing-doc probing', () => {
  it('BLOCKS a member of another house from probing a missing summary', async () => {
    await assertFails(getDoc(summaryDoc(outsider(), MISSING_ID)));
  });

  it('BLOCKS reading a missing summary for a guest that does not exist', async () => {
    await assertFails(getDoc(summaryDoc(resident(), 'ghost_2026-01-19')));
  });

  it('lets the resident read their own missing summary even without a house claim', async () => {
    const self = testEnv.authenticatedContext('residentUid', {});
    await assertSucceeds(getDoc(summaryDoc(self, MISSING_ID)));
  });
});

describe('week-summaries list', () => {
  it("BLOCKS listing another house's summaries", async () => {
    const q = query(
      collection(resident().firestore(), 'week-summaries'),
      where('houseId', '==', OTHER_HOUSE_ID),
    );
    await assertFails(getDocs(q));
  });
});

describe('week-summaries write', () => {
  it('BLOCKS a resident from creating a summary (the server owns them)', async () => {
    await assertFails(
      setDoc(summaryDoc(resident(), MISSING_ID), {
        ...summary(),
        id: MISSING_ID,
        startDate: '2026-01-19',
      }),
    );
  });

  it('BLOCKS a resident from incrementing a summary', async () => {
    await assertFails(updateDoc(summaryDoc(resident()), { 'stats.choresCompleted': increment(1) }));
  });

  it('still lets a house admin increment, for app versions released before the trigger', async () => {
    await assertSucceeds(
      updateDoc(summaryDoc(houseAdmin()), { 'stats.choresCompleted': increment(1) }),
    );
  });

  it('BLOCKS an admin of another house from writing', async () => {
    const otherAdmin = testEnv.authenticatedContext('otherAdmin', adminClaims(OTHER_HOUSE_ID));
    await assertFails(updateDoc(summaryDoc(otherAdmin), { 'stats.choresCompleted': increment(1) }));
  });

  it('BLOCKS deletes, even by a house admin', async () => {
    await assertFails(deleteDoc(summaryDoc(houseAdmin())));
  });
});
