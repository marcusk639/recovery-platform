/**
 * A manual payment retried with the same id records once (#190).
 *
 * recordManualPayment writes payments/{id} and lowers guests/{g}.rentOwed in
 * one batch. The modal makes the id once per opening, so a retry after an error
 * reuses it. The rules refuse updating a payment doc, so if the first batch
 * landed, the second batch fails as a whole and the balance is lowered once.
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
import { doc, getDoc, increment, setDoc, writeBatch } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';

const [HOST, PORT] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
const HOUSE = 'house123';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'rats-manual-payment-retry-rules-test',
    firestore: {
      rules: fs.readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf8'),
      host: HOST,
      port: Number(PORT),
    },
  });
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `houses/${HOUSE}`), { id: HOUSE, adminIds: ['admin'] });
    // Recording a payment and lowering a balance take a manager or above (owner
    // decision 2026-11-10): a bare admin claim ranks as a peer leader.
    await setDoc(doc(ctx.firestore(), `house-roles/${HOUSE}_admin`), { tier: 'manager' });
    await setDoc(doc(ctx.firestore(), 'guests/g1'), { id: 'g1', houseId: HOUSE, rentOwed: 30000 });
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

const recordBatch = (paymentId: string) => {
  const db = testEnv.authenticatedContext('admin', { admin: { [HOUSE]: true } }).firestore();
  const batch = writeBatch(db);
  batch.set(doc(db, `payments/${paymentId}`), {
    id: paymentId,
    guestId: 'g1',
    houseId: HOUSE,
    amount: 15000,
    currency: 'usd',
    status: 'succeeded',
    description: 'Manual Payment — Cash',
    createdAt: new Date().toISOString(),
  });
  batch.update(doc(db, 'guests/g1'), { rentOwed: increment(-15000) });
  return batch.commit();
};

test('the same payment id can only be recorded once (#190)', async () => {
  await assertSucceeds(recordBatch('pay-1'));
  await assertFails(recordBatch('pay-1'));

  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const guest = await getDoc(doc(ctx.firestore(), 'guests/g1'));
    expect(guest.data()?.rentOwed).toBe(15000);
  });
});
