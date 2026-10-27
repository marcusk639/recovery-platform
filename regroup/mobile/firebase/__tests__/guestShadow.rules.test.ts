/**
 * Firestore Security Rules Tests — no "shadow" resident records (#145 round 6,
 * verifier break 2).
 *
 * A peer leader P must not give another peer leader Q an extra active guest
 * doc: when Q's real doc is discharged, onGuestWrite would count the shadow
 * doc as entitling and Q would keep their claims. A staff create or link of a
 * guest doc to an account needs the caller to rank strictly above that
 * account, and a re-activation is rank-checked against the after-state
 * account as well as the before-state one.
 *
 *   cd firebase && firebase emulators:exec --only firestore --project demo-rules \
 *     "cd .. && npx jest --config jest.config.rules.js firebase/__tests__/guestShadow.rules.test.ts"
 */
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';

const H = 'houseA';
let testEnv: RulesTestEnvironment;

const seed = (p: string, data: Record<string, unknown>) =>
  testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), p), data);
  });
const STAFF = { admin: { [H]: true }, guest: { [H]: true } };
const db = (uid: string) => testEnv.authenticatedContext(uid, STAFF).firestore();

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-guest-shadow-rules',
    firestore: {
      rules: fs.readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});
afterAll(() => testEnv.cleanup());
beforeEach(async () => {
  await seed(`house-roles/${H}_mgr`, { tier: 'manager' });
  await seed(`house-roles/${H}_pl`, { tier: 'peerLeader' });
  await seed(`house-roles/${H}_pl2`, { tier: 'peerLeader' });
  await seed('guests/blank', { houseId: H, userId: '', status: 'active' });
  await seed('guests/blank-out', { houseId: H, userId: '', status: 'discharged' });
});
afterEach(() => testEnv.clearFirestore());

describe('a peer leader cannot give another peer leader a shadow record', () => {
  it('DENIES creating an active doc linked to another peer leader', async () => {
    await assertFails(
      setDoc(doc(db('pl'), 'guests/shadow'), { houseId: H, userId: 'pl2', status: 'active' }),
    );
  });

  it('DENIES linking a blank doc to another peer leader', async () => {
    await assertFails(updateDoc(doc(db('pl'), 'guests/blank'), { userId: 'pl2' }));
  });

  it('DENIES linking a discharged blank doc to another peer leader and re-activating it', async () => {
    await assertFails(
      updateDoc(doc(db('pl'), 'guests/blank-out'), { userId: 'pl2', status: 'active' }),
    );
  });
});

describe('ordinary staff creates and links still work', () => {
  it('ALLOWS a manager creating a doc for a peer leader or a resident', async () => {
    await assertSucceeds(
      setDoc(doc(db('mgr'), 'guests/a'), { houseId: H, userId: 'pl2', status: 'active' }),
    );
    await assertSucceeds(
      setDoc(doc(db('mgr'), 'guests/b'), { houseId: H, userId: 'res', status: 'active' }),
    );
  });

  it('ALLOWS a peer leader creating a doc for a plain resident, or with no account', async () => {
    await assertSucceeds(
      setDoc(doc(db('pl'), 'guests/c'), { houseId: H, userId: 'res', status: 'active' }),
    );
    await assertSucceeds(setDoc(doc(db('pl'), 'guests/d'), { houseId: H, status: 'active' }));
  });

  it('ALLOWS a peer leader linking a blank doc to a plain resident, and re-activating it', async () => {
    await assertSucceeds(updateDoc(doc(db('pl'), 'guests/blank'), { userId: 'res' }));
    await assertSucceeds(
      updateDoc(doc(db('pl'), 'guests/blank-out'), { userId: 'res2', status: 'active' }),
    );
  });
});
