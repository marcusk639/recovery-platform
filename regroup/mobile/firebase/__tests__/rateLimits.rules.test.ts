/**
 * rateLimits/{bucket}_{sha256(uid)}: the per-account call counters for the
 * paid 12-step meeting callables (functions util/rateLimit.ts). Server-only:
 * an account that could read, reset or delete its own counter would have no
 * limit, so every client is refused, its own counter included.
 *
 * Requires the Firestore emulator (FIRESTORE_EMULATOR_HOST, set by
 * `firebase emulators:exec`).
 */
import {
  initializeTestEnvironment,
  assertFails,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const [HOST, PORT] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
const UID = 'resident-1';
const OWN = `rateLimits/findMeetings_${createHash('sha256').update(UID).digest('hex')}`;

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'rats-rate-limits-rules-test',
    firestore: {
      rules: fs.readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf8'),
      host: HOST,
      port: Number(PORT),
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), OWN), { windowStart: 1, count: 60 });
  });
});

const signedIn = (claims: Record<string, unknown> = {}) =>
  testEnv.authenticatedContext(UID, claims).firestore();

describe('rateLimits — server-only', () => {
  it('an account cannot read its own counter', async () => {
    await assertFails(getDoc(doc(signedIn(), OWN)));
  });

  it('an account cannot list counters', async () => {
    await assertFails(getDocs(collection(signedIn(), 'rateLimits')));
  });

  it('an account cannot reset its own counter', async () => {
    await assertFails(setDoc(doc(signedIn(), OWN), { windowStart: 1, count: 0 }));
  });

  it('an account cannot delete its own counter', async () => {
    await assertFails(deleteDoc(doc(signedIn(), OWN)));
  });

  it('a house owner cannot touch counters either', async () => {
    const owner = signedIn({ superAdmin: ['house-1'], admin: ['house-1'] });
    await assertFails(getDoc(doc(owner, OWN)));
    await assertFails(deleteDoc(doc(owner, OWN)));
  });

  it('a signed-out caller cannot read a counter', async () => {
    await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), OWN)));
  });
});
