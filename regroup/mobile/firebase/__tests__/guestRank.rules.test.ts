/**
 * Firestore Security Rules Tests — staff departures follow rank (verifier B2, B4).
 *
 * Discharging, moving out, moving to another house or deleting a resident
 * record makes onGuestWrite strip that account's claims. The rules require
 * the caller to rank strictly above the record's account, from the
 * server-only house-roles records (primary owner 4, owner 3, manager 2,
 * peer leader 1, resident 0), and staff never change the status,
 * moveOutDate or house of their own record, or delete it.
 *
 *   cd firebase && firebase emulators:exec --only firestore --project demo-rules \
 *     "cd .. && npx jest --config jest.config.rules.js firebase/__tests__/guestRank.rules.test.ts"
 */
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';

const H = 'houseA';
let testEnv: RulesTestEnvironment;

const seed = (p: string, data: Record<string, unknown>) =>
  testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), p), data);
  });
const STAFF = { admin: { [H]: true }, guest: { [H]: true } };
const db = (uid: string, claims: Record<string, unknown> = STAFF) =>
  testEnv.authenticatedContext(uid, claims).firestore();
const resident = (userId: string) => ({ houseId: H, userId, status: 'active' });

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-guest-rank-rules',
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
  await seed(`house-roles/${H}_mgr`, { tier: 'manager' });
  await seed(`house-roles/${H}_pl`, { tier: 'peerLeader' });
  await seed(`house-roles/${H}_pl2`, { tier: 'peerLeader' });
  for (const u of ['mgr', 'pl', 'pl2', 'res']) await seed(`guests/${u}-doc`, resident(u));
});
afterEach(() => testEnv.clearFirestore());

describe('a peer leader cannot remove an equal or higher tier', () => {
  it('DENIES discharging or deleting another peer leader', async () => {
    await assertFails(updateDoc(doc(db('pl'), 'guests/pl2-doc'), { status: 'discharged' }));
    await assertFails(updateDoc(doc(db('pl'), 'guests/pl2-doc'), { moveOutDate: '2026-10-01' }));
    await assertFails(deleteDoc(doc(db('pl'), 'guests/pl2-doc')));
  });

  it("DENIES deleting or discharging a manager's resident record", async () => {
    await assertFails(deleteDoc(doc(db('pl'), 'guests/mgr-doc')));
    await assertFails(updateDoc(doc(db('pl'), 'guests/mgr-doc'), { status: 'discharged' }));
  });

  it('DENIES moving a manager record to another house the peer leader also admins', async () => {
    const both = { admin: { [H]: true, houseB: true }, guest: { [H]: true } };
    await assertFails(updateDoc(doc(db('pl', both), 'guests/mgr-doc'), { houseId: 'houseB' }));
  });
});

describe('a higher tier may', () => {
  it('ALLOWS a manager discharging a peer leader', async () => {
    await assertSucceeds(updateDoc(doc(db('mgr'), 'guests/pl-doc'), { status: 'discharged' }));
  });

  it('ALLOWS the owner deleting a manager record', async () => {
    await assertSucceeds(deleteDoc(doc(db('owner', { admin: { [H]: true } }), 'guests/mgr-doc')));
  });

  it("ALLOWS any staff departing or deleting a resident's record", async () => {
    await assertSucceeds(updateDoc(doc(db('pl'), 'guests/res-doc'), { status: 'discharged' }));
    await seed('guests/res-doc', resident('res'));
    await assertSucceeds(deleteDoc(doc(db('pl'), 'guests/res-doc')));
  });

  it('ALLOWS a peer leader editing a non-departure field on a higher record', async () => {
    await assertSucceeds(updateDoc(doc(db('pl'), 'guests/mgr-doc'), { firstName: 'M' }));
  });
});

describe('staff never depart or re-activate their own record', () => {
  it('DENIES a discharged peer leader re-activating their own record (B4)', async () => {
    await seed('guests/pl-doc', { ...resident('pl'), status: 'discharged' });
    await assertFails(updateDoc(doc(db('pl'), 'guests/pl-doc'), { status: 'active' }));
  });

  it('DENIES staff discharging, moving or deleting their own record', async () => {
    await assertFails(updateDoc(doc(db('mgr'), 'guests/mgr-doc'), { status: 'discharged' }));
    await assertFails(deleteDoc(doc(db('mgr'), 'guests/mgr-doc')));
  });

  it('ALLOWS staff editing other fields of their own record', async () => {
    await assertSucceeds(updateDoc(doc(db('pl'), 'guests/pl-doc'), { firstName: 'P' }));
  });
});
