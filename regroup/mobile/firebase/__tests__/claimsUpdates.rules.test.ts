/**
 * Firestore Security Rules Tests — claims-updates/{userId} (S5, REV-A5)
 *
 * The server stamps the doc after every custom-claims write (functions
 * util/userClaims.ts); the account's app listens to it and force-refreshes its
 * ID token. Only the account reads its own doc, and no client writes it: a
 * forged stamp could only make the app refresh, but a doc readable by others
 * would show when someone's role changed.
 *
 * Requires the Firestore emulator on port 8080:
 *   cd firebase && firebase emulators:start --only firestore
 *   npx jest --config jest.config.rules.js firebase/__tests__/claimsUpdates.rules.test.ts
 */

import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ID = 'rats-claims-updates-rules-test';
const RULES_PATH = path.resolve(__dirname, '../firestore.rules');
const UID = 'residentUser';
const MARKER = `claims-updates/${UID}`;

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

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), MARKER), { updatedAt: new Date() });
  });
});

const listenOnce = (ref: ReturnType<typeof doc>) =>
  new Promise<void>((resolve, reject) => {
    const unsubscribe = onSnapshot(
      ref,
      () => {
        unsubscribe();
        resolve();
      },
      reject,
    );
  });

describe('claims-updates/{userId}', () => {
  it('ALLOWS the account to read and listen to its own marker', async () => {
    const db = testEnv.authenticatedContext(UID, { guest: { h1: true } }).firestore();
    await assertSucceeds(getDoc(doc(db, MARKER)));
    await assertSucceeds(listenOnce(doc(db, MARKER)));
  });

  it("BLOCKS another account reading someone's marker, staff of their house too", async () => {
    const other = testEnv.authenticatedContext('someoneElse').firestore();
    await assertFails(getDoc(doc(other, MARKER)));
    const staff = testEnv
      .authenticatedContext('staffUser', { admin: { h1: true }, superAdmin: { h1: true } })
      .firestore();
    await assertFails(getDoc(doc(staff, MARKER)));
  });

  it('BLOCKS signed-out reads', async () => {
    await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), MARKER)));
  });

  it('BLOCKS every client write, by the account itself too', async () => {
    const db = testEnv.authenticatedContext(UID).firestore();
    await assertFails(setDoc(doc(db, MARKER), { updatedAt: new Date() }));
    await assertFails(updateDoc(doc(db, MARKER), { updatedAt: new Date() }));
    await assertFails(deleteDoc(doc(db, MARKER)));
    await assertFails(setDoc(doc(db, 'claims-updates/newUser'), { updatedAt: new Date() }));
  });

  it('BLOCKS listing the collection', async () => {
    const { collection, getDocs } = await import('firebase/firestore');
    const db = testEnv.authenticatedContext(UID).firestore();
    await assertFails(getDocs(collection(db, 'claims-updates')));
  });
});
