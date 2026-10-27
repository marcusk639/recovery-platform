/**
 * Firestore Security Rules Tests — PR #141 review round 7 (probe8).
 *
 *   1. No dispute is left undecidable: an accountless guest's (or a missing
 *      guest doc's) unstamped activity is decided and reopened by any house
 *      admin but its logger, also in a house with no superAdminId.
 *   2. A changed guestId must belong to the activity's house (as at create).
 *   3. loggedAt is frozen once there is dispute history, even to the server
 *      time (an older build's "delete" is recognised by
 *      disputeResolvedAt == loggedAt).
 *   7. With no stamp and no guest doc, a non-admin may raise a dispute unless
 *      they logged the activity.
 *
 * The guest-doc cases rely on #145's guest rules (userId immutable once set,
 * no self-delete): these rules deploy only after #145 has merged.
 *
 * Requires the Firestore emulator on port 8080:
 *   cd firebase && firebase emulators:exec --only firestore --project demo-test \
 *     "cd .. && npx jest --config jest.config.rules.js firebase/__tests__/disputeDecidable.rules.test.ts"
 */

import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
  DocumentData,
} from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';

const RULES_PATH = path.resolve(__dirname, '../firestore.rules');
const H = 'h1';
const H2 = 'h2';
const O = 'owner'; // primary owner AND the logger below
const M2 = 'mgr2';
const P = 'peerUid';
const T0 = Timestamp.fromDate(new Date('2026-01-14T18:00:00Z'));

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-dispute-decidable-rules-test',
    firestore: { rules: fs.readFileSync(RULES_PATH, 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});

afterAll(async () => {
  await env.cleanup();
});

const act = (o: DocumentData = {}) => ({
  guestId: 'gU',
  houseId: H,
  type: 'chore',
  status: 'disputed',
  verified: false,
  loggedBy: O,
  disputeReason: 'not done',
  disputedBy: P,
  disputeResolvedBy: P,
  timestamp: T0,
  loggedAt: T0,
  ...o,
});

/** An active activity with no dispute fields at all. */
const clean = (o: DocumentData = {}) => {
  const { disputeReason: _r, disputedBy: _b, disputeResolvedBy: _x, ...rest } = act({ status: 'active', ...o });
  return rest;
};

beforeEach(async () => {
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, `houses/${H}`), { name: 'H', superAdminId: O });
    await setDoc(doc(db, `houses/${H2}`), { name: 'H2' }); // no superAdminId, no ownerId
    await setDoc(doc(db, 'guests/gU'), { houseId: H, userId: '' }); // accountless
    await setDoc(doc(db, 'guests/gP'), { houseId: H, userId: P });
    await setDoc(doc(db, 'guests/gV'), { houseId: H2 });
    await setDoc(doc(db, 'guests/gX'), { houseId: H2, userId: 'x' });
    // 5c: the owner logged it for an accountless guest; never stamped.
    await setDoc(doc(db, 'activities/uA'), act({ residentUid: null, residentUidPending: false }));
    // 5e: a house with no superAdminId.
    await setDoc(doc(db, 'activities/vA'), act({ guestId: 'gV', houseId: H2, loggedBy: 'm3' }));
    // No guest doc, no stamp.
    await setDoc(doc(db, 'activities/gone'), act({ guestId: 'missing' }));
    await setDoc(
      doc(db, 'activities/fresh'),
      clean({ guestId: 'missing' }),
    );
    await setDoc(
      doc(db, 'activities/plain'),
      clean({ guestId: 'gP', residentUid: P }),
    );
    // An older build's "delete": deleted, resolved at loggedAt.
    await setDoc(
      doc(db, 'activities/upheld'),
      act({ status: 'deleted', residentUid: P, disputeResolvedBy: M2, disputeResolvedAt: T0 }),
    );
  });
});

afterEach(async () => {
  await env.clearFirestore();
});

const ctx = (uid: string, claims: DocumentData) =>
  env.authenticatedContext(uid, claims).firestore();
const owner = () => ctx(O, { superAdmin: { [H]: true } });
const mgr2 = () => ctx(M2, { admin: { [H]: true } });
const m4 = () => ctx('m4', { admin: { [H2]: true } });
const m3 = () => ctx('m3', { admin: { [H2]: true } });
const peer = () => ctx(P, { guest: { [H]: true } });
type Db = ReturnType<typeof peer>;
const upd = (db: Db, id: string, data: DocumentData) =>
  updateDoc(doc(db, `activities/${id}`), data);
const approve = (uid: string): DocumentData => ({
  status: 'resolved',
  disputed: 'successful',
  incomplete: true,
  disputeOutcome: 'incomplete-per-residents',
  disputeResult: 'success',
  disputeResolvedBy: uid,
  disputeResolvedAt: serverTimestamp(),
});
const reopen = (uid: string): DocumentData => ({
  status: 'disputed',
  reopenedBy: uid,
  reopenedAt: serverTimestamp(),
  disputed: null,
  incomplete: null,
  disputeResult: null,
  disputeOutcome: null,
  disputeResolvedBy: null,
  disputeResolvedAt: null,
});
/** Logs the decision as the server does, so a reopen is allowed. */
async function logDecision(id: string) {
  await env.withSecurityRulesDisabled(async (c) => {
    const at = (await getDoc(doc(c.firestore(), `activities/${id}`))).get(
      'disputeResolvedAt',
    ) as Timestamp;
    await setDoc(
      doc(c.firestore(), `activities/${id}/dispute-decisions/decided_${at.toMillis()}`),
      { event: 'approved' },
    );
  });
}

describe('1: no dispute is left undecidable', () => {
  it('5c: the owner logged it for an accountless guest: a manager decides and reopens it, the owner cannot', async () => {
    await assertFails(upd(owner(), 'uA', approve(O)));
    await assertSucceeds(upd(mgr2(), 'uA', approve(M2)));
    await logDecision('uA');
    await assertFails(upd(owner(), 'uA', reopen(O)));
    await assertSucceeds(upd(mgr2(), 'uA', reopen(M2)));
  });

  it('5e: a house with no superAdminId: any admin but the logger decides and reopens', async () => {
    await assertFails(upd(m3(), 'vA', approve('m3')));
    await assertSucceeds(upd(m4(), 'vA', approve('m4')));
    await logDecision('vA');
    await assertSucceeds(upd(m4(), 'vA', reopen('m4')));
  });

  it('no guest doc and no stamp: any admin but the logger decides and reopens', async () => {
    await assertFails(upd(owner(), 'gone', approve(O)));
    await assertSucceeds(upd(mgr2(), 'gone', approve(M2)));
    await logDecision('gone');
    await assertSucceeds(upd(mgr2(), 'gone', reopen(M2)));
  });
});

describe('2: a new guestId must belong to the house', () => {
  it("refuses moving an activity to another house's guest (probe8 xH)", async () => {
    await assertFails(upd(mgr2(), 'plain', { guestId: 'gX' }));
    await assertSucceeds(upd(mgr2(), 'plain', { guestId: 'gU' }));
  });
});

describe('3: loggedAt is frozen once there is dispute history', () => {
  it("even to the server time, e.g. on an older build's delete record", async () => {
    await assertFails(upd(mgr2(), 'upheld', { loggedAt: serverTimestamp() }));
    await assertFails(upd(mgr2(), 'uA', { loggedAt: serverTimestamp() }));
    await assertSucceeds(upd(mgr2(), 'plain', { loggedAt: serverTimestamp() }));
  });
});

describe('7: ENTER with no stamp and no guest doc', () => {
  it('a non-admin may raise a dispute unless they logged the activity', async () => {
    const enter = (uid: string) => ({
      status: 'disputed',
      disputeReason: 'not done',
      disputedBy: uid,
      disputeResolvedBy: uid,
      disputedAt: serverTimestamp(),
    });
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(
        doc(c.firestore(), 'activities/byPeer'),
        clean({ guestId: 'missing', loggedBy: P }),
      );
    });
    await assertFails(upd(peer(), 'byPeer', enter(P)));
    await assertSucceeds(upd(peer(), 'fresh', enter(P)));
  });
});
