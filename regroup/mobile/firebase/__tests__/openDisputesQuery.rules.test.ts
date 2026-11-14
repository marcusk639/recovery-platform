/**
 * Firestore Security Rules Tests: the Disputes screen's open-dispute query (#244)
 *
 * The screen lists every open (disputed) activity of the house with no date
 * range, so a dispute the house-disputes mirror counts as open is listed however
 * old its activity is. That query is houseId + status, newest first
 * (useActivities' activityFilters), served by the (houseId, status, timestamp
 * desc) index in firestore.indexes.json.
 *
 * Needs a Firestore emulator. FIRESTORE_EMULATOR_HOST, which
 * `firebase emulators:exec` sets, overrides the default 127.0.0.1:8080:
 *
 *   cd firebase && firebase emulators:exec --only firestore --project demo-test \
 *     "cd .. && npx jest --config jest.config.rules.js firebase/__tests__/openDisputesQuery.rules.test.ts"
 */

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, doc, getDocs, limit, orderBy, query, setDoc, where } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ID = 'demo-open-disputes-query-rules-test';
const [FIRESTORE_HOST, FIRESTORE_PORT] = (
  process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080'
).split(':');
const RULES_PATH = path.resolve(__dirname, '../firestore.rules');

const HOUSE = 'house123';

let testEnv: RulesTestEnvironment;

const openDisputes = (ctx: ReturnType<RulesTestEnvironment['authenticatedContext']>) =>
  query(
    collection(ctx.firestore(), 'activities'),
    where('houseId', '==', HOUSE),
    where('status', '==', 'disputed'),
    orderBy('timestamp', 'desc'),
    limit(500),
  );

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync(RULES_PATH, 'utf8'),
      host: FIRESTORE_HOST,
      port: Number(FIRESTORE_PORT),
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    // Disputed three weeks before "now": outside the screen's old two-week window.
    await setDoc(doc(ctx.firestore(), 'activities/old_dispute'), {
      houseId: HOUSE,
      guestId: 'g1',
      type: 'chore',
      status: 'disputed',
      timestamp: new Date('2026-10-20T15:00:00Z'),
    });
  });
});

afterEach(async () => {
  await testEnv.clearFirestore();
});

describe("the house's open-dispute list with no date range", () => {
  it("lets the house's staff and residents list it, old disputes included", async () => {
    const staff = testEnv.authenticatedContext('staffUid', { admin: { [HOUSE]: true } });
    const resident = testEnv.authenticatedContext('residentUid', { guest: { [HOUSE]: true } });

    const forStaff = await assertSucceeds(getDocs(openDisputes(staff)));
    expect(forStaff.docs.map((d) => d.id)).toEqual(['old_dispute']);
    await assertSucceeds(getDocs(openDisputes(resident)));
  });

  it("refuses another house's staff", async () => {
    const other = testEnv.authenticatedContext('otherUid', { admin: { house999: true } });
    await assertFails(getDocs(openDisputes(other)));
  });
});
