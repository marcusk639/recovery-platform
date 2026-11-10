/**
 * paywall/config is the server's paywall kill switch (#196). The app reads it on
 * cold start (useSubscriptionGate); with no rule the read was refused, so the
 * client could never see the switch turned off. Only the server writes it.
 *
 * Requires the Firestore emulator (FIRESTORE_EMULATOR_HOST, set by
 * `firebase emulators:exec`).
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

const [HOST, PORT] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'rats-paywall-config-rules-test',
    firestore: {
      rules: fs.readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf8'),
      host: HOST,
      port: Number(PORT),
    },
  });
  await testEnv.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), 'paywall/config'), { killSwitchEnabled: false });
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

const signedIn = () => testEnv.authenticatedContext('anyone', {}).firestore();
const houseAdmin = () =>
  testEnv.authenticatedContext('admin', { admin: { house123: true } }).firestore();

describe('paywall/config (#196)', () => {
  test('any signed-in user can read it', async () => {
    await assertSucceeds(getDoc(doc(signedIn(), 'paywall/config')));
  });

  test('a signed-out user cannot read it', async () => {
    await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'paywall/config')));
  });

  test('nobody can write it, not even a house admin', async () => {
    await assertFails(setDoc(doc(signedIn(), 'paywall/config'), { killSwitchEnabled: true }));
    await assertFails(setDoc(doc(houseAdmin(), 'paywall/config'), { killSwitchEnabled: true }));
  });
});
