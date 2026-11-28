/**
 * Firestore Security Rules Tests — the demo account by its claim (S5, REV-A8)
 *
 * Owner decision 2026-11-27: the App Review demo account is identified by the
 * server-set `demo: true` custom claim, so changing its email (anyone can sign
 * in as it and do that) does not escape isDemoAccount(). Its house roles count
 * only in isDemoHouse houses, and it may not change its profile email.
 *
 * Requires the Firestore emulator on port 8080:
 *   cd firebase && firebase emulators:start --only firestore
 *   npx jest --config jest.config.rules.js firebase/__tests__/demoClaim.rules.test.ts
 */

import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ID = 'rats-demo-claim-rules-test';
const RULES_PATH = path.resolve(__dirname, '../firestore.rules');
const DEMO_UID = 'demoUser';
const DEMO_HOUSE = 'demoHouse';
const REAL_HOUSE = 'realHouse';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: fs.readFileSync(RULES_PATH, 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `houses/${DEMO_HOUSE}`), { id: DEMO_HOUSE, isDemoHouse: true });
    await setDoc(doc(db, `houses/${REAL_HOUSE}`), { id: REAL_HOUSE, isDemoHouse: false });
    await setDoc(doc(db, `users/${DEMO_UID}`), {
      id: DEMO_UID,
      email: 'demo_user@appdemo.net',
      firstName: 'Demo',
    });
    await setDoc(doc(db, 'users/operator'), {
      id: 'operator',
      email: 'op@example.com',
      firstName: 'Op',
    });
  });
});

/** Staff claims on both houses, as a misgranted demo account might hold. */
const staffOnBoth = { admin: { [DEMO_HOUSE]: true, [REAL_HOUSE]: true } };
const demoWithChangedEmail = () =>
  testEnv
    .authenticatedContext(DEMO_UID, { ...staffOnBoth, demo: true, email: 'attacker@example.com' })
    .firestore();

describe('isDemoAccount() by the demo claim', () => {
  it('scopes the house roles to demo houses even after the email changed', async () => {
    const db = demoWithChangedEmail();
    await assertSucceeds(getDoc(doc(db, `houses/${DEMO_HOUSE}`)));
    await assertFails(getDoc(doc(db, `houses/${REAL_HOUSE}`)));
  });

  // The claim alone identifies it, so it must be set before these rules deploy
  // (npm run demo:mark-account).
  it('does not treat the demo email without the claim as the demo account', async () => {
    const db = testEnv
      .authenticatedContext(DEMO_UID, { ...staffOnBoth, email: 'demo_user@appdemo.net' })
      .firestore();
    await assertSucceeds(getDoc(doc(db, `houses/${REAL_HOUSE}`)));
  });

  it('leaves the same claims on another account alone', async () => {
    const db = testEnv
      .authenticatedContext('operator', { ...staffOnBoth, email: 'op@example.com' })
      .firestore();
    await assertSucceeds(getDoc(doc(db, `houses/${REAL_HOUSE}`)));
  });

  it('treats a non-boolean demo claim as not demo', async () => {
    const db = testEnv
      .authenticatedContext('operator', { ...staffOnBoth, demo: 'true', email: 'op@example.com' })
      .firestore();
    await assertSucceeds(getDoc(doc(db, `houses/${REAL_HOUSE}`)));
  });
});

describe('users/{userId} email', () => {
  it('BLOCKS the demo account changing its profile email', async () => {
    const db = demoWithChangedEmail();
    await assertFails(updateDoc(doc(db, `users/${DEMO_UID}`), { email: 'attacker@example.com' }));
  });

  it('ALLOWS the demo account other profile edits, and echoing the same email', async () => {
    const db = demoWithChangedEmail();
    await assertSucceeds(
      updateDoc(doc(db, `users/${DEMO_UID}`), {
        firstName: 'Demo2',
        email: 'demo_user@appdemo.net',
      }),
    );
  });

  it('ALLOWS any other account to change its own profile email', async () => {
    const db = testEnv.authenticatedContext('operator', { email: 'op@example.com' }).firestore();
    await assertSucceeds(updateDoc(doc(db, 'users/operator'), { email: 'op2@example.com' }));
  });
});
