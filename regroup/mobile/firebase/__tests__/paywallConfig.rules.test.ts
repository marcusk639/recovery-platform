/**
 * Firestore Security Rules Tests — the paywall kill switch (paywall/config)
 *
 * The app's paywall reads paywall/config.enabled. With no rule for it the read
 * is denied and the hook fails closed, so the switch could never let anyone
 * in. Signed-in users may read it; no client may write it (the server-side
 * script functions/src/scripts/setServerSwitch.ts does).
 *
 * Requires a Firestore emulator: FIRESTORE_EMULATOR_HOST, else 127.0.0.1:8080.
 *   cd firebase && firebase emulators:exec --only firestore \
 *     "cd .. && npx jest --config jest.config.rules.js firebase/__tests__/paywallConfig.rules.test.ts"
 */

import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ID = 'demo-paywall-config-rules-test';
const [FIRESTORE_HOST, FIRESTORE_PORT] = (
  process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080'
).split(':');
const RULES_PATH = path.resolve(__dirname, '../firestore.rules');

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
    await setDoc(doc(ctx.firestore(), 'paywall/config'), { enabled: true });
    await setDoc(doc(ctx.firestore(), 'paywall/other'), { enabled: true });
  });
});

describe('paywall/config', () => {
  it('a signed-in user can read the kill switch', async () => {
    const db = testEnv.authenticatedContext('anyUser').firestore();
    await assertSucceeds(getDoc(doc(db, 'paywall/config')));
  });

  it('a signed-out visitor cannot read it', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'paywall/config')));
  });

  it('a signed-in user cannot write it', async () => {
    const db = testEnv.authenticatedContext('anyUser').firestore();
    await assertFails(setDoc(doc(db, 'paywall/config'), { enabled: false }));
  });

  it('a house admin cannot write it either', async () => {
    const db = testEnv.authenticatedContext('admin', { admin: { house123: true } }).firestore();
    await assertFails(setDoc(doc(db, 'paywall/config'), { enabled: false }));
  });

  it('other paywall documents stay closed', async () => {
    const db = testEnv.authenticatedContext('anyUser').firestore();
    await assertFails(getDoc(doc(db, 'paywall/other')));
  });
});
