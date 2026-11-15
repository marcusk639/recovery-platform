/**
 * Contacts' ADMIN section (#183 item 4). A resident reaches their house's
 * managers from Contacts: the app reads each id in the house's adminIds with a
 * get. Before, only an admin of the doc's houses or the doc's own user could
 * read an admins doc, so a resident's ADMIN section was always empty. Now a
 * resident (guest claim) of one of the doc's houses may read it too, and no
 * one else: residents of other houses and signed-out callers are still
 * refused, and no list query is opened up.
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
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';

const [HOST, PORT] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
const H = 'house123';
const OTHER = 'otherHouse';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'rats-admin-contacts-rules-test',
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
    const db = ctx.firestore();
    await setDoc(doc(db, 'admins/manager'), {
      userId: 'manager',
      firstName: 'Max',
      lastName: 'Manager',
      phoneNumber: '5551234567',
      houseIds: [H],
    });
    await setDoc(doc(db, 'admins/operator'), {
      userId: 'operator',
      firstName: 'Olga',
      lastName: 'Owner',
      houseIds: [OTHER, H],
      superAdmin: [OTHER, H],
    });
    await setDoc(doc(db, 'admins/elsewhere'), { userId: 'elsewhere', houseIds: [OTHER] });
  });
});

const resident = (houseId = H) =>
  testEnv.authenticatedContext('resident', { guest: { [houseId]: true } }).firestore();

describe('admins/{adminId} reads for Contacts', () => {
  it("ALLOWS a resident to read their house's manager", async () => {
    const snap = await assertSucceeds(getDoc(doc(resident(), 'admins/manager')));
    expect(snap.data()?.phoneNumber).toBe('5551234567');
  });

  it('ALLOWS a resident to read an operator whose houses include theirs', async () => {
    await assertSucceeds(getDoc(doc(resident(), 'admins/operator')));
  });

  it("DENIES a resident reading another house's admin", async () => {
    await assertFails(getDoc(doc(resident(), 'admins/elsewhere')));
  });

  it("DENIES a resident of another house reading this house's manager", async () => {
    await assertFails(getDoc(doc(resident('house999'), 'admins/manager')));
  });

  it('DENIES a signed-out caller', async () => {
    await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'admins/manager')));
  });

  it('DENIES a signed-in user with no house role', async () => {
    await assertFails(
      getDoc(doc(testEnv.authenticatedContext('nobody').firestore(), 'admins/manager')),
    );
  });

  it("still ALLOWS an admin of the doc's house", async () => {
    const db = testEnv.authenticatedContext('admin2', { admin: { [H]: true } }).firestore();
    await assertSucceeds(getDoc(doc(db, 'admins/manager')));
  });

  it('still DENIES a list query over admins by houseIds', async () => {
    await assertFails(
      getDocs(query(collection(resident(), 'admins'), where('houseIds', 'array-contains', H))),
    );
  });
});
