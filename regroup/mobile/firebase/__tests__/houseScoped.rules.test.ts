/**
 * Firestore Security Rules Tests — house scoping the app's queries and writes
 * must carry.
 *
 * Rules are not filters: a list query is allowed only if the rules can prove
 * every possible result readable. activities/{id} is readable by the guests and
 * admins of resource.data.houseId, so a list filtered by guestId alone is
 * denied for everyone, and the client must also filter by houseId. Likewise
 * meetings/{id} accepts a create only from a guest or admin of the meeting's
 * houseId, so a meeting without one can never be created. On update, a meeting
 * is checked against its stored houseId, which may not change.
 *
 * Requires the Firebase Firestore emulator running on port 8080.
 */

import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ID = 'rats-house-scoped-rules-test';
const RULES_PATH = path.resolve(__dirname, '../firestore.rules');

const HOUSE_ID = 'house123';
const GUEST_ID = 'guest-doc-1';
const RESIDENT_UID = 'residentUser';
const ADMIN_UID = 'adminUser';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync(RULES_PATH, 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

afterEach(async () => {
  await testEnv.clearFirestore();
});

const asAdmin = () =>
  testEnv.authenticatedContext(ADMIN_UID, { admin: { [HOUSE_ID]: true } }).firestore();
const asResident = () =>
  testEnv.authenticatedContext(RESIDENT_UID, { guest: { [HOUSE_ID]: true } }).firestore();
const asNoRole = () => testEnv.authenticatedContext('noRoleUser', {}).firestore();
const asAnonymous = () => testEnv.unauthenticatedContext().firestore();
// The public demo account is held to houses flagged isDemoHouse, whatever its claims.
const asDemo = (houseId: string) =>
  testEnv
    .authenticatedContext('demoUser', {
      email: 'demo_user@appdemo.net',
      admin: { [houseId]: true },
    })
    .firestore();

describe('activities list queries', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'activities/a1'), {
        guestId: GUEST_ID,
        houseId: HOUSE_ID,
        status: 'active',
        type: 'chore',
        loggedBy: RESIDENT_UID,
        timestamp: new Date('2026-02-17T12:00:00Z'),
      });
    });
  });

  // The shape of getActivities / getActivitiesPage.
  const guestWeek = (db: ReturnType<typeof asAdmin>, ...houseScope: ReturnType<typeof where>[]) =>
    query(
      collection(db, 'activities'),
      where('guestId', '==', GUEST_ID),
      ...houseScope,
      where('timestamp', '>=', new Date('2026-02-16T00:00:00Z')),
      where('timestamp', '<', new Date('2026-02-23T00:00:00Z')),
      where('status', 'in', ['active', 'disputed', 'resolved']),
      orderBy('timestamp', 'desc'),
    );

  it('denies a house admin a list by guestId alone', async () => {
    await assertFails(getDocs(guestWeek(asAdmin())));
  });

  it('denies the resident a list by guestId alone', async () => {
    await assertFails(getDocs(guestWeek(asResident())));
  });

  it('allows a house admin the same list filtered by the house', async () => {
    const snapshot = await assertSucceeds(
      getDocs(guestWeek(asAdmin(), where('houseId', '==', HOUSE_ID))),
    );
    expect(snapshot.size).toBe(1);
  });

  it('allows the resident the same list filtered by the house', async () => {
    await assertSucceeds(getDocs(guestWeek(asResident(), where('houseId', '==', HOUSE_ID))));
  });

  it('denies a list filtered by a house the caller does not belong to', async () => {
    await assertFails(getDocs(guestWeek(asAdmin(), where('houseId', '==', 'other-house'))));
  });

  it('denies a resident a list filtered by another house', async () => {
    await assertFails(getDocs(guestWeek(asResident(), where('houseId', '==', 'other-house'))));
  });

  it('denies a signed-in user with no house role', async () => {
    await assertFails(getDocs(guestWeek(asNoRole(), where('houseId', '==', HOUSE_ID))));
  });

  it('denies an unauthenticated caller', async () => {
    await assertFails(getDocs(guestWeek(asAnonymous(), where('houseId', '==', HOUSE_ID))));
  });

  describe('the demo account', () => {
    it('is denied a house not flagged isDemoHouse, even with an admin claim for it', async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), `houses/${HOUSE_ID}`), { isDemoHouse: false });
      });
      await assertFails(getDocs(guestWeek(asDemo(HOUSE_ID), where('houseId', '==', HOUSE_ID))));
    });

    it('is allowed a house flagged isDemoHouse', async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), `houses/${HOUSE_ID}`), { isDemoHouse: true });
      });
      await assertSucceeds(getDocs(guestWeek(asDemo(HOUSE_ID), where('houseId', '==', HOUSE_ID))));
    });
  });
});

describe('meetings create', () => {
  const meeting = { name: 'AA Tuesday', type: 'AA', day: 'tuesday', time: '19:00' };

  it('denies a meeting without a houseId, even to a house admin', async () => {
    await assertFails(setDoc(doc(asAdmin(), 'meetings/m1'), meeting));
  });

  it('allows a resident to create a meeting for their house', async () => {
    await assertSucceeds(
      setDoc(doc(asResident(), 'meetings/m1'), { ...meeting, houseId: HOUSE_ID }),
    );
  });

  it('denies a meeting for a house the caller does not belong to', async () => {
    await assertFails(
      setDoc(doc(asAdmin(), 'meetings/m1'), { ...meeting, houseId: 'other-house' }),
    );
  });
});

describe('meetings update', () => {
  const OTHER_HOUSE = 'house999';
  const asOtherHouseAdmin = () =>
    testEnv.authenticatedContext('otherAdmin', { admin: { [OTHER_HOUSE]: true } }).firestore();

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'meetings/m1'), { name: 'AA Tuesday', houseId: HOUSE_ID });
    });
  });

  it("allows a member of the meeting's house to update it", async () => {
    await assertSucceeds(updateDoc(doc(asResident(), 'meetings/m1'), { name: 'AA Wednesday' }));
  });

  it("denies another house's admin re-homing the meeting into their own house", async () => {
    await assertFails(
      updateDoc(doc(asOtherHouseAdmin(), 'meetings/m1'), {
        name: 'Taken over',
        houseId: OTHER_HOUSE,
      }),
    );
  });

  it("denies another house's admin editing it without moving it", async () => {
    await assertFails(updateDoc(doc(asOtherHouseAdmin(), 'meetings/m1'), { name: 'Edited' }));
  });

  // Meetings without a houseId (none are client-created: creates require one)
  // stay Admin-only; writing a houseId in no longer adopts them into a house.
  it('denies updating a meeting that has no houseId, even by writing one', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'meetings/legacy'), { name: 'Legacy' });
    });
    await assertFails(
      updateDoc(doc(asAdmin(), 'meetings/legacy'), { name: 'Adopted', houseId: HOUSE_ID }),
    );
  });

  it('denies moving a meeting to another house, even for an admin of both', async () => {
    const asBothAdmin = testEnv
      .authenticatedContext('bothAdmin', { admin: { [HOUSE_ID]: true, [OTHER_HOUSE]: true } })
      .firestore();
    await assertFails(updateDoc(doc(asBothAdmin, 'meetings/m1'), { houseId: OTHER_HOUSE }));
  });
});
