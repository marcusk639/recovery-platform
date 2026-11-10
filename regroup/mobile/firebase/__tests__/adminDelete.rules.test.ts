/**
 * Removing a manager deletes their admins/{id} doc (#196). The old rule read
 * request.resource, which is null on a delete, so every removal was refused.
 * An owner or manager of the house may delete a single-house admin's doc; a
 * peer leader may not, nobody may delete the owner's doc, and a doc listing
 * several houses can't be deleted from one of them.
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
import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';

const [HOST, PORT] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
const HOUSE = 'house123';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'rats-admin-delete-rules-test',
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
  await testEnv.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    for (const [uid, tier] of [['owner', 'owner'], ['manager', 'manager'], ['peer', 'peerLeader']]) {
      await setDoc(doc(db, `house-roles/${HOUSE}_${uid}`), { tier });
    }
    await setDoc(doc(db, 'admins/target'), { userId: 'target', houseIds: [HOUSE] });
    await setDoc(doc(db, 'admins/owner'), {
      userId: 'owner',
      houseIds: [HOUSE],
      superAdmin: [HOUSE],
    });
    await setDoc(doc(db, 'admins/multi'), { userId: 'multi', houseIds: [HOUSE, 'other'] });
  });
});

const db = (uid: string, house = HOUSE) =>
  testEnv.authenticatedContext(uid, { admin: { [house]: true } }).firestore();

describe('admins delete (#196)', () => {
  test("the house's manager or owner can remove a manager", async () => {
    await assertSucceeds(deleteDoc(doc(db('manager'), 'admins/target')));
  });

  test('a peer leader cannot', async () => {
    await assertFails(deleteDoc(doc(db('peer'), 'admins/target')));
  });

  test("nobody can delete the owner's doc", async () => {
    await assertFails(deleteDoc(doc(db('manager'), 'admins/owner')));
  });

  test("another house's admin cannot", async () => {
    await assertFails(deleteDoc(doc(db('manager', 'elsewhere'), 'admins/target')));
  });

  test('a doc for several houses cannot be deleted from one of them', async () => {
    await assertFails(deleteDoc(doc(db('owner'), 'admins/multi')));
  });
});
