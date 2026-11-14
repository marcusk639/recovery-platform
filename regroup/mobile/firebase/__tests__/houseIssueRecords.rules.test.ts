/**
 * Residents add issues and complaints only to the house's own maps
 * (screens/Personal/Personal.tsx); nothing creates issues/{id} or
 * complaints/{id}. Those rules read resource.data, so a client can neither read
 * nor delete a record that doesn't exist. That is why removing or deciding an
 * issue or complaint writes the house map alone (services/issues.ts,
 * screens/Complaints/Complaints.tsx), and why a batch that also deleted the
 * record failed the whole removal.
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
import { deleteDoc, doc, getDoc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';

const [HOST, PORT] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
const HOUSE = 'house123';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'rats-house-issue-records-rules-test',
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
    await setDoc(doc(ctx.firestore(), `houses/${HOUSE}`), {
      id: HOUSE,
      name: 'Oak',
      issues: { i1: { id: 'i1', status: 'open', houseId: HOUSE } },
      complaints: { c1: { id: 'c1', houseId: HOUSE } },
    });
  });
});

const admin = () => testEnv.authenticatedContext('admin', { admin: { [HOUSE]: true } }).firestore();

describe('an issue or complaint with no record of its own', () => {
  it('an admin can remove the issue from the house map', async () => {
    await assertSucceeds(updateDoc(doc(admin(), `houses/${HOUSE}`), { issues: {} }));
  });

  it('an admin can resolve the issue in the house map', async () => {
    await assertSucceeds(
      updateDoc(doc(admin(), `houses/${HOUSE}`), {
        issues: { i1: { id: 'i1', status: 'resolved', houseId: HOUSE, resolution: 'Fixed' } },
      }),
    );
  });

  it('an admin can remove the complaint from the house map', async () => {
    await assertSucceeds(updateDoc(doc(admin(), `houses/${HOUSE}`), { complaints: {} }));
  });

  it("the missing records can't be read or deleted", async () => {
    await assertFails(getDoc(doc(admin(), 'issues/i1')));
    await assertFails(deleteDoc(doc(admin(), 'issues/i1')));
    await assertFails(deleteDoc(doc(admin(), 'complaints/c1')));
  });

  it('a batch that also deletes the missing record fails, house update included', async () => {
    const db = admin();
    const batch = writeBatch(db);
    batch.update(doc(db, `houses/${HOUSE}`), { complaints: {} });
    batch.delete(doc(db, 'complaints/c1'));
    await assertFails(batch.commit());
  });
});

describe('a record an older build left', () => {
  it('an admin can delete it', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'issues/i1'), { id: 'i1', houseId: HOUSE });
    });
    await assertSucceeds(deleteDoc(doc(admin(), 'issues/i1')));
  });
});
