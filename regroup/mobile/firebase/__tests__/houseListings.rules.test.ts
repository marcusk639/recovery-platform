/**
 * Firestore Security Rules Tests — house-listings (EMU-009, owner 2026-11-27)
 *
 * A signed-out visitor (the app's anonymous session) searches houses and
 * reads the summary it applies from. They read house-listings/{houseId}, the
 * server-written public fields, and nothing else of a house: not the house
 * document, its residents, or any money record. No client writes a listing.
 *
 * Requires a Firestore emulator: FIRESTORE_EMULATOR_HOST, else 127.0.0.1:8080.
 *   cd firebase && firebase emulators:exec --only firestore \
 *     "cd .. && npx jest --config jest.config.rules.js firebase/__tests__/houseListings.rules.test.ts"
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
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ID = 'demo-house-listings-rules-test';
const [FIRESTORE_HOST, FIRESTORE_PORT] = (
  process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080'
).split(':');
const RULES_PATH = path.resolve(__dirname, '../firestore.rules');
const HOUSE = 'house-1';
const ANON = { firebase: { sign_in_provider: 'anonymous' } };

let testEnv: RulesTestEnvironment;

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
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `house-listings/${HOUSE}`), {
      id: HOUSE,
      name: 'Hope House',
      geohash: '9v6kpm',
      city: 'Austin',
      openBeds: 3,
    });
    await setDoc(doc(db, `houses/${HOUSE}`), {
      id: HOUSE,
      name: 'Hope House',
      street: '100 Test St',
      subscriptionStatus: 'active',
      stripeAccountId: 'acct_1',
    });
    await setDoc(doc(db, 'guests/guest-a'), { id: 'guest-a', houseId: HOUSE, rentOwed: 15000 });
    await setDoc(doc(db, 'payments/p1'), { id: 'p1', houseId: HOUSE, amount: 2222 });
  });
});

const anon = () => testEnv.authenticatedContext('anon-1', ANON).firestore();

describe('house-listings', () => {
  it('an anonymous visitor reads a listing', async () => {
    await assertSucceeds(getDoc(doc(anon(), `house-listings/${HOUSE}`)));
  });

  it('an anonymous visitor searches listings by geohash', async () => {
    const q = query(
      collection(anon(), 'house-listings'),
      where('geohash', '>=', '9v6k'),
      where('geohash', '<=', '9v6m'),
    );
    const snap = await assertSucceeds(getDocs(q));
    expect(snap.docs.map((d: { id: string }) => d.id)).toEqual([HOUSE]);
  });

  it('nobody without a session reads a listing', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, `house-listings/${HOUSE}`)));
  });

  it('no client writes a listing, house staff included', async () => {
    const owner = testEnv
      .authenticatedContext('owner', { superAdmin: { [HOUSE]: true } })
      .firestore();
    await assertFails(setDoc(doc(anon(), 'house-listings/fake'), { id: 'fake', name: 'Fake' }));
    await assertFails(updateDoc(doc(owner, `house-listings/${HOUSE}`), { openBeds: 99 }));
    await assertFails(deleteDoc(doc(owner, `house-listings/${HOUSE}`)));
  });
});

describe('an anonymous visitor still reads nothing else of a house', () => {
  it('not the house document', async () => {
    await assertFails(getDoc(doc(anon(), `houses/${HOUSE}`)));
  });

  it('not the house search on houses', async () => {
    await assertFails(getDocs(query(collection(anon(), 'houses'), where('geohash', '>=', '9v6k'))));
  });

  it("not a resident's record", async () => {
    await assertFails(getDoc(doc(anon(), 'guests/guest-a')));
  });

  it('not a payment', async () => {
    await assertFails(getDoc(doc(anon(), 'payments/p1')));
  });
});
