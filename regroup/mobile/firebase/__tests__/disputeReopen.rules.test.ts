/**
 * Firestore Security Rules Tests — REOPEN: undoing a dispute decision.
 *
 * Owner decision: "Add a way to undo dispute decisions. The dispute should
 * stay alive and approve and reject should show as options again."
 *
 * A house admin (owner/superAdmin, manager, peer leader) who is not the
 * activity's resident (residentUid / guest doc) nor its logger moves a
 * decided dispute (approved, rejected, an old build's keep or "delete") back
 * to `disputed`: the write sets reopenedBy == caller and reopenedAt == server
 * time, clears the decision fields to null, and changes nothing else. The
 * decision must already be in the server's decision log
 * (activities/{id}/dispute-decisions/decided_{disputeResolvedAt ms}), so no
 * decision is lost. Clients cannot read or write that log.
 *
 * Requires the Firestore emulator on port 8080:
 *   cd firebase && firebase emulators:exec --only firestore --project demo-test \
 *     "cd .. && npx jest --config jest.config.rules.js firebase/__tests__/disputeReopen.rules.test.ts"
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
  deleteDoc,
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
const MGR2 = 'mgr2';
const PL = 'peerLeader'; // admin claim AND a resident (guests/gpl)
const OWN = 'ownerSuper';
const T0 = Timestamp.fromDate(new Date('2026-01-14T18:00:00Z'));

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-dispute-reopen-rules-test',
    firestore: { rules: fs.readFileSync(RULES_PATH, 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});

afterAll(async () => {
  await env.cleanup();
});

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
const APPROVED = {
  status: 'resolved',
  disputed: 'successful',
  incomplete: true,
  disputeOutcome: 'incomplete-per-residents',
  disputeResult: 'success',
  disputeResolvedBy: MGR,
  disputeResolvedAt: T0,
};
const REJECTED = {
  ...APPROVED,
  disputed: 'rejected',
  incomplete: false,
  disputeOutcome: null,
  disputeResult: 'fail',
};

// The server's decision-log entry for a decision made at `at`.
const logPath = (id: string, at: Timestamp) =>
  `activities/${id}/dispute-decisions/decided_${at.toMillis()}`;

const LOGGED: Record<string, DocumentData> = {
  approved: pending(APPROVED),
  rejected: pending(REJECTED),
  kept: pending({ status: 'resolved', disputeResolvedBy: MGR, disputeResolvedAt: T0 }),
  approvedLoggedByMgr2: pending({ ...APPROVED, loggedBy: MGR2 }),
  plOwnApproved: pending({ ...APPROVED, guestId: 'gpl', residentUid: PL, loggedBy: MGR }),
  // An old build's "delete" resolution: deleted, resolved at loggedAt.
  legacyUpheld: pending({
    status: 'deleted',
    disputeResolvedBy: MGR,
    disputeResolvedAt: T0,
    loggedAt: T0,
  }),
};

async function seedLog(id: string) {
  await env.withSecurityRulesDisabled(async (c) => {
    const at = (await getDoc(doc(c.firestore(), `activities/${id}`))).get(
      'disputeResolvedAt',
    ) as Timestamp;
    await setDoc(doc(c.firestore(), logPath(id, at)), { event: 'decided', at });
  });
}

beforeEach(async () => {
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, 'guests/g1'), { houseId: H, userId: RES });
    await setDoc(doc(db, 'guests/gpl'), { houseId: H, userId: PL });
    for (const [id, data] of Object.entries(LOGGED)) {
      await setDoc(doc(db, `activities/${id}`), data);
      await setDoc(doc(db, logPath(id, T0)), { event: 'decided', at: T0 });
    }
    await setDoc(doc(db, 'activities/approvedNoLog'), pending(APPROVED));
    await setDoc(doc(db, 'activities/pending'), pending());
    await setDoc(doc(db, 'activities/active'), act());
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
const mgr2 = () => ctx(MGR2, { admin: { [H]: true } });
const pl = () => ctx(PL, { admin: { [H]: true }, guest: { [H]: true } });
const own = () => ctx(OWN, { superAdmin: { [H]: true } });
type Db = ReturnType<typeof res>;
const upd = (db: Db, id: string, data: DocumentData) =>
  updateDoc(doc(db, `activities/${id}`), data);

/** Exactly what the app's reopenDispute(id, uid) writes. */
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
const resolve = (uid: string, outcome: 'approve' | 'reject'): DocumentData => ({
  ...(outcome === 'approve' ? APPROVED : REJECTED),
  disputeResolvedBy: uid,
  disputeResolvedAt: serverTimestamp(),
});

describe('who may reopen a decision', () => {
  it('a manager, the owner/operator and a peer leader can reopen approved, rejected and kept decisions', async () => {
    await assertSucceeds(upd(mgr(), 'approved', reopen(MGR)));
    await assertSucceeds(upd(own(), 'rejected', reopen(OWN)));
    await assertSucceeds(upd(pl(), 'kept', reopen(PL)));
  });

  it('DENIES the resident, a peer, the logger, and an admin who is the resident', async () => {
    await assertFails(upd(res(), 'approved', reopen(RES)));
    await assertFails(upd(peer(), 'approved', reopen(PEER)));
    await assertFails(upd(mgr2(), 'approvedLoggedByMgr2', reopen(MGR2)));
    await assertFails(upd(pl(), 'plOwnApproved', reopen(PL)));
    await assertSucceeds(upd(own(), 'plOwnApproved', reopen(OWN)));
  });

  it("an old build's 'delete' (legacy upheld) can be reopened by an admin, not by a peer", async () => {
    await assertFails(upd(peer(), 'legacyUpheld', reopen(PEER)));
    await assertSucceeds(upd(mgr(), 'legacyUpheld', reopen(MGR)));
  });
});

describe('what a reopen may write', () => {
  it('DENIES a reopen that changes any other field', async () => {
    const extras: DocumentData[] = [
      { verified: true },
      { disputeReason: 'changed' },
      { disputedBy: MGR },
      { guestId: 'gpl' },
      { loggedAt: serverTimestamp() },
      { disputed: 'rejected' },
      { incomplete: false },
      { reopenedBy: MGR2 },
      { reopenedAt: Timestamp.now() },
    ];
    for (const extra of extras) {
      await assertFails(upd(mgr(), 'approved', { ...reopen(MGR), ...extra }));
    }
  });

  it('DENIES reopening a pending or an active activity', async () => {
    await assertFails(upd(mgr(), 'pending', reopen(MGR)));
    await assertFails(upd(mgr(), 'active', reopen(MGR)));
  });

  it('DENIES reopening before the decision is in the decision log', async () => {
    await assertFails(upd(mgr(), 'approvedNoLog', reopen(MGR)));
    await seedLog('approvedNoLog');
    await assertSucceeds(upd(mgr(), 'approvedNoLog', reopen(MGR)));
  });

  it("DENIES a second admin's concurrent reopen, and an approve racing it", async () => {
    await assertSucceeds(upd(mgr(), 'approved', reopen(MGR)));
    await assertFails(upd(mgr2(), 'approved', reopen(MGR2)));
    await assertFails(upd(mgr2(), 'rejected', resolve(MGR2, 'approve')));
  });

  it('DENIES deleting a reopened activity, soft or hard', async () => {
    await assertSucceeds(upd(mgr(), 'approved', reopen(MGR)));
    await assertFails(deleteDoc(doc(own(), 'activities/approved')));
    await assertFails(upd(mgr(), 'approved', { status: 'deleted' }));
  });

  it('clients can neither read nor write the decision log', async () => {
    await assertFails(getDoc(doc(mgr(), logPath('approved', T0))));
    await assertFails(
      setDoc(doc(mgr(), `activities/approvedNoLog/dispute-decisions/decided_1`), { event: 'x' }),
    );
  });
});

describe('approve -> reopen -> reject -> reopen -> approve', () => {
  it('works, and each reopen waits until the decision it undoes is logged', async () => {
    await assertSucceeds(upd(mgr(), 'pending', resolve(MGR, 'approve')));
    await assertFails(upd(own(), 'pending', reopen(OWN)));
    await seedLog('pending');
    await assertSucceeds(upd(own(), 'pending', reopen(OWN)));
    await assertSucceeds(upd(pl(), 'pending', resolve(PL, 'reject')));
    await assertFails(upd(mgr(), 'pending', reopen(MGR)));
    await seedLog('pending');
    await assertSucceeds(upd(mgr(), 'pending', reopen(MGR)));
    await assertSucceeds(upd(mgr2(), 'pending', resolve(MGR2, 'approve')));
    await assertFails(deleteDoc(doc(own(), 'activities/pending')));
  });
});
