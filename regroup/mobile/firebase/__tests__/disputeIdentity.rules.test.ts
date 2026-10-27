/**
 * Firestore Security Rules Tests — who an activity belongs to, and dispute
 * history, cannot be changed around a dispute (PR #141 review round 4).
 *
 * Each "GAP" case was allowed by the previous rules (probe5):
 *   - the resident is the server-stamped residentUid, which no client writes,
 *     so editing or deleting the guest doc no longer hides them;
 *   - guestId, loggedBy and houseId are frozen once there is dispute history
 *     (for admins too) and always for non-admins;
 *   - no dispute field is ever removed; ENTER names the caller; RESOLVE records
 *     the caller and the server time; `resolved` alone is history;
 *   - outcomes are consistent (incl. disputeResult), set only by a resolution,
 *     and undone only by REOPEN (disputeReopen.rules.test.ts).
 *
 * Requires the Firestore emulator on port 8080:
 *   cd firebase && firebase emulators:exec --only firestore --project demo-test \
 *     "cd .. && npx jest --config jest.config.rules.js firebase/__tests__/disputeIdentity.rules.test.ts"
 */

import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  serverTimestamp,
  Timestamp,
  DocumentData,
} from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';

const RULES_PATH = path.resolve(__dirname, '../firestore.rules');
const H = 'h1';
const RES = 'residentUid';
const PEER = 'peerUid';
const MGR = 'mgr';
const PL = 'peerLeader'; // admin claim AND a resident (guests/gpl)
const OWN = 'ownerSuper';
const T0 = Timestamp.fromDate(new Date('2026-01-14T18:00:00Z'));

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-dispute-identity-rules-test',
    firestore: { rules: fs.readFileSync(RULES_PATH, 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});

afterAll(async () => {
  await env.cleanup();
});

// residentUid as the onActivityWritten Cloud Function stamps it.
const act = (o: DocumentData = {}) => ({
  guestId: 'g1',
  residentUid: RES,
  houseId: H,
  type: 'chore',
  status: 'active',
  verified: false,
  loggedBy: RES,
  timestamp: T0,
  ...o,
});
const pending = (o: DocumentData = {}) =>
  act({ status: 'disputed', disputeReason: 'r', disputedBy: PEER, disputeResolvedBy: PEER, ...o });
const decided = (o: DocumentData) =>
  pending({ status: 'resolved', disputeResolvedBy: MGR, disputeResolvedAt: T0, ...o });

const FIXTURES: Record<string, DocumentData> = {
  active: act(),
  adminLogged: act({ loggedBy: MGR }),
  plOwnPending: pending({ guestId: 'gpl', residentUid: PL, loggedBy: PL }),
  plOwnPending2: pending({ guestId: 'gpl', residentUid: PL, loggedBy: MGR }),
  pending: pending(),
  pendingNoResolver: act({ status: 'disputed', disputeReason: 'r', disputedBy: PEER }),
  approved: decided({
    disputed: 'successful',
    incomplete: true,
    disputeOutcome: 'incomplete-per-residents',
    disputeResult: 'success',
  }),
  rejected: decided({ disputed: 'rejected', incomplete: false, disputeResult: 'fail' }),
  resolvedBare: act({ status: 'resolved' }),
};

beforeEach(async () => {
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, 'guests/g1'), { houseId: H, userId: RES });
    await setDoc(doc(db, 'guests/gp'), { houseId: H, userId: PEER });
    await setDoc(doc(db, 'guests/gpl'), { houseId: H, userId: PL });
    for (const [id, data] of Object.entries(FIXTURES)) {
      await setDoc(doc(db, `activities/${id}`), data);
    }
    // Written before residentUid existed, and its guest doc is gone.
    const { residentUid: _r, ...legacy } = act({ guestId: 'gone', loggedBy: MGR });
    await setDoc(doc(db, 'activities/legacyNoGuest'), legacy);
  });
});

afterEach(async () => {
  await env.clearFirestore();
});

const ctx = (uid: string, claims: DocumentData) =>
  env.authenticatedContext(uid, claims).firestore();
const res = () => ctx(RES, { guest: { [H]: true } });
const peer = () => ctx(PEER, { guest: { [H]: true } });
const mgr = () => ctx(MGR, { admin: { [H]: true } });
const pl = () => ctx(PL, { admin: { [H]: true }, guest: { [H]: true } });
const own = () => ctx(OWN, { superAdmin: { [H]: true } });
type Db = ReturnType<typeof res>;
const upd = (db: Db, id: string, data: DocumentData) =>
  updateDoc(doc(db, `activities/${id}`), data);

const dispute = (uid: string): DocumentData => ({
  status: 'disputed',
  disputeReason: 'no',
  disputedBy: uid,
  disputeResolvedBy: uid,
  disputedAt: serverTimestamp(),
  loggedAt: serverTimestamp(),
});
// An older build's payload: no disputedAt.
const disputeNoNonce = (uid: string) => ({ ...dispute(uid), disputedAt: deleteField() });
const reject = (uid: string): DocumentData => ({
  status: 'resolved',
  disputed: 'rejected',
  incomplete: false,
  disputeResult: 'fail',
  disputeResolvedBy: uid,
  disputeResolvedAt: serverTimestamp(),
});
const approve = (uid: string): DocumentData => ({
  ...reject(uid),
  disputed: 'successful',
  incomplete: true,
  disputeOutcome: 'incomplete-per-residents',
  disputeResult: 'success',
});

describe('the resident is the server-stamped residentUid', () => {
  it("a client sets residentUid only at create, only to the guest doc's account; never on update", async () => {
    const fresh = act({ residentUid: RES });
    await assertSucceeds(setDoc(doc(res(), 'activities/new1'), fresh));
    await assertFails(setDoc(doc(res(), 'activities/new1b'), act({ residentUid: PEER })));
    await assertFails(setDoc(doc(mgr(), 'activities/new2'), act({ residentUid: PEER, loggedBy: MGR })));
    await assertFails(upd(mgr(), 'active', { residentUid: PEER }));
    await assertFails(upd(mgr(), 'active', { residentUid: deleteField() }));
    const { residentUid: _r, ...unstamped } = fresh;
    await assertSucceeds(setDoc(doc(res(), 'activities/new3'), unstamped));
  });

  it('GAP: a resident who deletes and recreates their guest doc still cannot dispute their own activity', async () => {
    await assertSucceeds(deleteDoc(doc(res(), 'guests/g1')));
    await assertFails(upd(res(), 'adminLogged', disputeNoNonce(RES)));
    await assertSucceeds(setDoc(doc(res(), 'guests/g1'), { houseId: H, userId: RES }));
    await assertFails(upd(res(), 'adminLogged', disputeNoNonce(RES)));
  });

  it('GAP: a peer leader cannot swap guestId/loggedBy on their own pending dispute to resolve it', async () => {
    await assertFails(upd(pl(), 'plOwnPending', { guestId: 'g1', loggedBy: RES }));
    await assertFails(upd(pl(), 'plOwnPending', reject(PL)));
  });

  it('GAP: a peer leader who clears userId on their own guest doc still cannot resolve their dispute', async () => {
    await assertSucceeds(updateDoc(doc(pl(), 'guests/gpl'), { userId: deleteField() }));
    await assertFails(upd(pl(), 'plOwnPending2', reject(PL)));
    await assertSucceeds(upd(own(), 'plOwnPending2', reject(OWN)));
  });

  it('no guest doc and no residentUid: peers may dispute it; only the primary owner decides', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), `houses/${H}`), { superAdminId: OWN });
    });
    await assertSucceeds(upd(peer(), 'legacyNoGuest', disputeNoNonce(PEER)));
    await assertFails(upd(pl(), 'legacyNoGuest', reject(PL)));
    await assertSucceeds(upd(own(), 'legacyNoGuest', reject(OWN)));
  });

  it('freezes guestId, loggedBy and houseId once there is dispute history, for admins too', async () => {
    for (const id of ['pending', 'approved', 'rejected', 'resolvedBare']) {
      await assertFails(upd(mgr(), id, { guestId: 'gp' }));
      await assertFails(upd(mgr(), id, { loggedBy: MGR }));
    }
    await assertFails(upd(mgr(), 'active', { ...dispute(MGR), guestId: 'gp' }));
    await assertSucceeds(upd(mgr(), 'active', { guestId: 'gp' }));
  });

  it('non-admins never change guestId, loggedBy or houseId', async () => {
    await assertFails(upd(res(), 'active', { guestId: 'gp' }));
    await assertFails(upd(peer(), 'active', { ...dispute(PEER), loggedBy: PEER }));
  });
});

describe('dispute history is never erased', () => {
  it('GAP: a pending dispute is never cleared back to active, stripped, or deleted', async () => {
    await assertFails(
      upd(mgr(), 'pendingNoResolver', {
        status: 'active',
        disputedBy: deleteField(),
        disputeReason: deleteField(),
      }),
    );
    await assertFails(upd(mgr(), 'pending', { status: 'active' }));
    await assertFails(deleteDoc(doc(mgr(), 'activities/pendingNoResolver')));
  });

  it('GAP: entering a dispute names the caller in disputeResolvedBy; disputedBy alone is refused', async () => {
    const { disputeResolvedBy: _x, ...onlyDisputedBy } = dispute(PEER);
    await assertFails(upd(peer(), 'active', onlyDisputedBy));
    await assertFails(upd(peer(), 'active', { ...dispute(PEER), disputedAt: T0 }));
    await assertSucceeds(upd(peer(), 'active', dispute(PEER)));
  });

  it("an old build's dispute (disputeResolvedBy only) is still allowed, and is history", async () => {
    const { disputedBy: _x, disputedAt: _y, ...oldBuild } = dispute(PEER);
    await assertSucceeds(upd(peer(), 'active', oldBuild));
    await assertFails(deleteDoc(doc(mgr(), 'activities/active')));
  });

  it('GAP: a resolution records the caller and the server time, and removes nothing', async () => {
    const { disputeResolvedBy: _b, disputeResolvedAt: _a, ...noResolver } = reject(MGR);
    await assertFails(upd(mgr(), 'pendingNoResolver', noResolver));
    await assertFails(
      upd(mgr(), 'pendingNoResolver', { ...reject(MGR), disputeResolvedAt: Timestamp.now() }),
    );
    await assertFails(
      upd(mgr(), 'pendingNoResolver', { ...reject(MGR), disputedBy: deleteField() }),
    );
    await assertSucceeds(upd(mgr(), 'pendingNoResolver', reject(MGR)));
  });

  it('nothing removes or nulls a recorded dispute field', async () => {
    for (const k of [
      'disputeReason',
      'disputedBy',
      'disputeResolvedBy',
      'disputeResolvedAt',
      'disputed',
    ]) {
      await assertFails(upd(mgr(), 'rejected', { [k]: deleteField() }));
      await assertFails(upd(mgr(), 'rejected', { [k]: null }));
    }
    await assertFails(upd(mgr(), 'approved', { disputeOutcome: deleteField() }));
    await assertSucceeds(upd(mgr(), 'rejected', { verified: true, verifiedBy: MGR }));
  });

  it('`resolved` alone is dispute history: never deleted', async () => {
    await assertFails(deleteDoc(doc(mgr(), 'activities/resolvedBare')));
    await assertFails(
      upd(res(), 'resolvedBare', { status: 'deleted', loggedAt: serverTimestamp() }),
    );
  });
});

describe('outcomes are consistent and set only by a resolution', () => {
  it('GAP: a decision never goes back to active', async () => {
    await assertFails(upd(mgr(), 'approved', { status: 'active', incomplete: false }));
    await assertFails(upd(own(), 'rejected', { status: 'active' }));
  });

  it("GAP: no outcome field without a dispute (e.g. disputed 'successful' while counted)", async () => {
    await assertFails(upd(mgr(), 'active', { disputed: 'successful', incomplete: false }));
    await assertFails(upd(mgr(), 'active', { incomplete: true }));
    await assertFails(upd(mgr(), 'active', { status: 'resolved', disputed: 'rejected' }));
    await assertFails(setDoc(doc(mgr(), 'activities/new'), act({ disputed: 'successful' })));
    await assertFails(setDoc(doc(mgr(), 'activities/new'), act({ status: 'disputed' })));
  });

  it('GAP: disputeResult must match the outcome', async () => {
    await assertFails(upd(mgr(), 'pending', { ...approve(MGR), disputeResult: 'fail' }));
    await assertFails(upd(mgr(), 'pending', { ...reject(MGR), disputeResult: 'success' }));
    await assertFails(upd(mgr(), 'pending', { ...reject(MGR), disputeResult: deleteField() }));
    await assertSucceeds(upd(mgr(), 'pending', approve(MGR)));
  });

  it("an old build's keep (no outcome fields) must record the resolver; it counts like REJECT", async () => {
    await assertFails(upd(mgr(), 'pending', { status: 'resolved' }));
    await assertSucceeds(
      upd(mgr(), 'pending', {
        status: 'resolved',
        disputeResolvedBy: MGR,
        disputeResolvedAt: serverTimestamp(),
      }),
    );
  });

  it('a decided outcome is frozen (only REOPEN undoes it)', async () => {
    await assertFails(upd(mgr(), 'approved', reject(MGR)));
    await assertFails(
      upd(mgr(), 'approved', { disputed: 'rejected', incomplete: false, disputeResult: 'fail' }),
    );
    await assertFails(upd(mgr(), 'rejected', { status: 'disputed' }));
  });
});
