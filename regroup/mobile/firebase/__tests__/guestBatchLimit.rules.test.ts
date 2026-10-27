/**
 * Firestore Security Rules Tests — batch size of guest-doc writes (#145
 * round 7, verifier N-C).
 *
 * Each departure, delete or account-linked create of a guest doc makes the
 * rules read the house-roles record of the doc's account (one get() per
 * record, plus the caller's record once per batch); a batch may make at most
 * 20 such reads. A move between houses reads the account's record in both
 * houses (and the caller's in both, once per batch), so 9 moves fit. The app
 * removes and discharges one guest doc at a time, so these limits do not
 * affect it; they bound what a direct client batch can carry.
 *
 *   cd firebase && firebase emulators:exec --only firestore --project demo-rules \
 *     "cd .. && npx jest --config jest.config.rules.js firebase/__tests__/guestBatchLimit.rules.test.ts"
 */
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, writeBatch } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';
import { GUEST_BATCH_SIZE } from '../../src/services/guestBatch';

const H = 'houseA';
let testEnv: RulesTestEnvironment;

const seed = (p: string, data: Record<string, unknown>) =>
  testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), p), data);
  });
const OWNER = { admin: { [H]: true, houseB: true }, superAdmin: { [H]: true, houseB: true } };

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-guest-batch-rules',
    firestore: {
      rules: fs.readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});
afterAll(() => testEnv.cleanup());
beforeEach(async () => {
  await seed(`house-roles/${H}_owner`, { tier: 'owner', primary: true });
  for (let i = 0; i < 20; i++) {
    await seed(`house-roles/${H}_u${i}`, { tier: 'peerLeader' });
    await seed(`guests/g${i}`, { houseId: H, userId: `u${i}`, status: 'active' });
  }
});
afterEach(() => testEnv.clearFirestore());

const batchOf = (n: number, op: 'delete' | 'discharge' | 'move', from = 0) => {
  const db = testEnv.authenticatedContext('owner', OWNER).firestore();
  const b = writeBatch(db);
  for (let i = from; i < from + n; i++) {
    const ref = doc(db, `guests/g${i}`);
    if (op === 'delete') {
      b.delete(ref);
      b.set(doc(db, `guest-archive/g${i}`), { houseId: H, userId: `u${i}` });
    } else if (op === 'move') {
      b.update(ref, { houseId: 'houseB' });
    } else {
      b.update(ref, { status: 'discharged' });
    }
  }
  return b.commit();
};

it('ALLOWS a batch of GUEST_BATCH_SIZE (8) removals with their archive copies, or discharges', async () => {
  await assertSucceeds(batchOf(GUEST_BATCH_SIZE, 'delete'));
  await assertSucceeds(batchOf(GUEST_BATCH_SIZE, 'discharge', GUEST_BATCH_SIZE));
});

it('ALLOWS the documented ceiling: 19 account-linked docs in one batch', async () => {
  await assertSucceeds(batchOf(19, 'delete'));
});

it('DENIES 20 account-linked removals in one batch (21 reads)', async () => {
  await assertFails(batchOf(20, 'delete'));
});

it('ALLOWS 8 moves between two houses in one batch, DENIES 10', async () => {
  await assertSucceeds(batchOf(8, 'move'));
  await assertFails(batchOf(10, 'move', 8));
});

it('ALLOWS 9 moves between two houses in one batch (the documented ceiling)', async () => {
  await assertSucceeds(batchOf(9, 'move'));
});
