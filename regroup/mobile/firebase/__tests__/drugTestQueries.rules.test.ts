/**
 * Drug test list queries against firestore.rules (#197).
 *
 * The read rule checks resource.data.houseId (house admin) or observedBy, so a
 * list query is only allowed when its filters prove every result is readable.
 * The phone's guest history and positive-count queries filtered on guestId
 * alone, which the rules refuse even for the house's own admin.
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
import { collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';

const [HOST, PORT] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
const HOUSE = 'house123';
const OTHER_HOUSE = 'houseOther';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'rats-drug-test-queries-rules-test',
    firestore: {
      rules: fs.readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf8'),
      host: HOST,
      port: Number(PORT),
    },
  });
  await testEnv.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), 'drug-tests/t1'), {
      houseId: HOUSE,
      guestId: 'g1',
      observedBy: 'staff',
      result: 'negative',
      testDate: '2026-10-01',
    });
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

const adminDb = (houseId: string) =>
  testEnv.authenticatedContext(`admin-${houseId}`, { admin: { [houseId]: true } }).firestore();

describe('drug test list queries (#197)', () => {
  test("a house admin's guest-only query is refused", async () => {
    const db = adminDb(HOUSE);
    await assertFails(getDocs(query(collection(db, 'drug-tests'), where('guestId', '==', 'g1'))));
  });

  test('a house admin can list a resident’s tests filtered by house and guest', async () => {
    const db = adminDb(HOUSE);
    await assertSucceeds(
      getDocs(
        query(
          collection(db, 'drug-tests'),
          where('houseId', '==', HOUSE),
          where('guestId', '==', 'g1'),
        ),
      ),
    );
  });

  test("another house's admin is refused the same query", async () => {
    const db = adminDb(OTHER_HOUSE);
    await assertFails(
      getDocs(
        query(
          collection(db, 'drug-tests'),
          where('houseId', '==', HOUSE),
          where('guestId', '==', 'g1'),
        ),
      ),
    );
  });
});
