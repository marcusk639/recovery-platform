/**
 * Firestore Security Rules Tests — the owner rule and round-3 review probes
 *
 * Owner rule: "Activities should never be disputed by the user that did the
 * activity. Disputes are intended for other users to claim that the resident
 * that did the activity did not actually do it."
 *   - The person who did it = the account on the activity's guest doc
 *     (guests.userId) and whoever logged it (loggedBy). Neither may enter a
 *     dispute on it — as a resident, a peer, or an admin — nor resolve one.
 *   - A guest doc with no userId (admin intake) leaves only the loggedBy check.
 *
 * Round-3 probes (each a working attack before):
 *   - probe F / peerOld: re-dispute without changing any disputer field;
 *   - a peer kept a stale disputedBy naming someone else;
 *   - an admin rewrote the disputer/resolver of an open dispute;
 *   - an old build's "delete" resolution overwrote another admin's outcome.
 *
 * Requires the Firestore emulator on port 8080:
 *   cd firebase && firebase emulators:exec --only firestore --project demo-test \
 *     "cd .. && npx jest --config jest.config.rules.js firebase/__tests__/ownActivityDispute.rules.test.ts"
 */

import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, Timestamp, DocumentData } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';

const RULES_PATH = path.resolve(__dirname, '../firestore.rules');
const HOUSE = 'h1';
const OWNER = 'residentUid';
const PEER = 'peerUid';
const MGR = 'mgr';
const MGR2 = 'mgr2';
const ADMIN_RESIDENT = 'adminResidentUid'; // a resident who is also a house admin

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-own-activity-dispute-rules-test',
    firestore: { rules: fs.readFileSync(RULES_PATH, 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});

afterAll(async () => {
  await env.cleanup();
});

const act = (o: Record<string, unknown> = {}) => ({
  guestId: 'g1',
  houseId: HOUSE,
  type: 'chore',
  status: 'active',
  verified: false,
  loggedBy: OWNER,
  timestamp: Timestamp.fromDate(new Date('2026-01-14T18:00:00Z')),
  ...o,
});

beforeEach(async () => {
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, 'guests/g1'), { houseId: HOUSE, userId: OWNER });
    await setDoc(doc(db, 'guests/gAdmin'), { houseId: HOUSE, userId: ADMIN_RESIDENT });
    await setDoc(doc(db, 'guests/gIntake'), { houseId: HOUSE }); // no account
    await setDoc(doc(db, `houses/${HOUSE}`), { name: 'H', disputes: {}, adminIds: [MGR, MGR2, ADMIN_RESIDENT] });
    await setDoc(doc(db, 'activities/own'), act());
    await setDoc(doc(db, 'activities/byAdmin'), act({ loggedBy: MGR })); // g1's, logged by MGR
    await setDoc(doc(db, 'activities/adminsOwn'), act({ guestId: 'gAdmin', loggedBy: ADMIN_RESIDENT }));
    await setDoc(doc(db, 'activities/intake'), act({ guestId: 'gIntake', loggedBy: MGR }));
    await setDoc(doc(db, 'activities/restored'), act({ disputedBy: OWNER, disputeResolvedBy: OWNER, disputeReason: 'x' }));
    await setDoc(doc(db, 'activities/peerOld'), act({ disputeResolvedBy: PEER }));
    await setDoc(doc(db, 'activities/staleOther'), act({ disputedBy: OWNER }));
    await setDoc(doc(db, 'activities/pending'), act({ status: 'disputed', disputedBy: PEER, disputeResolvedBy: PEER }));
    await setDoc(
      doc(db, 'activities/adminsOwnPending'),
      act({ guestId: 'gAdmin', loggedBy: ADMIN_RESIDENT, status: 'disputed', disputedBy: PEER, disputeResolvedBy: PEER }),
    );
  });
});

afterEach(async () => {
  await env.clearFirestore();
});

const ctx = (uid: string, claims: Record<string, unknown>) => env.authenticatedContext(uid, claims).firestore();
const owner = () => ctx(OWNER, { guest: { [HOUSE]: true } });
const ownerAsAdmin = () => ctx(OWNER, { guest: { [HOUSE]: true }, admin: { [HOUSE]: true } });
const peer = () => ctx(PEER, { guest: { [HOUSE]: true } });
const mgr = () => ctx(MGR, { admin: { [HOUSE]: true } });
const mgr2 = () => ctx(MGR2, { admin: { [HOUSE]: true } });
const adminResident = () => ctx(ADMIN_RESIDENT, { guest: { [HOUSE]: true }, admin: { [HOUSE]: true } });
type Db = ReturnType<typeof owner>;
const upd = (db: Db, id: string, data: DocumentData) => updateDoc(doc(db, `activities/${id}`), data);
const disp = (uid: string): DocumentData => ({
  status: 'disputed',
  disputeReason: 'r',
  disputedBy: uid,
  disputeResolvedBy: uid,
  loggedAt: Timestamp.now(),
});
const legacyDisp = (uid: string): DocumentData => ({
  status: 'disputed',
  disputeReason: 'r',
  disputeResolvedBy: uid,
  loggedAt: Timestamp.now(),
});
const resolve = (outcome: 'approve' | 'reject', by: string): DocumentData => ({
  status: 'resolved',
  disputed: outcome === 'approve' ? 'successful' : 'rejected',
  ...(outcome === 'approve' ? { disputeOutcome: 'incomplete-per-residents' } : {}),
  incomplete: outcome === 'approve',
  disputeResult: outcome === 'approve' ? 'success' : 'fail',
  disputeResolvedBy: by,
  disputeResolvedAt: Timestamp.now(),
  loggedAt: Timestamp.now(),
});

describe('owner rule: never your own activity', () => {
  it('DENIES the resident disputing their own activity: current build', async () => {
    await assertFails(upd(owner(), 'own', disp(OWNER)));
  });

  it('DENIES it from an old build (disputeResolvedBy only)', async () => {
    await assertFails(upd(owner(), 'own', legacyDisp(OWNER)));
  });

  it('DENIES it when the resident is also a house admin', async () => {
    await assertFails(upd(ownerAsAdmin(), 'own', disp(OWNER)));
    await assertFails(upd(adminResident(), 'adminsOwn', disp(ADMIN_RESIDENT)));
  });

  it('DENIES the resident disputing an activity an admin logged for them (guest doc account)', async () => {
    await assertFails(upd(owner(), 'byAdmin', disp(OWNER)));
  });

  it('DENIES whoever logged it (loggedBy) disputing it, admin included', async () => {
    await assertFails(upd(mgr(), 'byAdmin', disp(MGR)));
    await assertFails(upd(mgr(), 'intake', disp(MGR)));
  });

  it('DENIES probe F: the owner re-disputing their restored activity, fields already naming them', async () => {
    await assertFails(upd(owner(), 'restored', { status: 'disputed', disputeReason: 'r', loggedAt: Timestamp.now() }));
  });

  it('DENIES peerOld: a dispute that changes no disputer field (disputeResolvedBy already the peer)', async () => {
    await assertFails(upd(peer(), 'peerOld', { status: 'disputed', disputeReason: 'r', loggedAt: Timestamp.now() }));
  });

  it('DENIES an admin who is the resident resolving a dispute on their own activity', async () => {
    await assertFails(upd(adminResident(), 'adminsOwnPending', resolve('reject', ADMIN_RESIDENT)));
    await assertSucceeds(upd(mgr(), 'adminsOwnPending', resolve('reject', MGR)));
  });

  it("still allows a peer disputing someone else's activity", async () => {
    await assertSucceeds(upd(peer(), 'own', disp(PEER)));
  });

  it("still allows an admin disputing someone else's activity, incl. an intake guest's", async () => {
    await assertSucceeds(upd(mgr2(), 'byAdmin', disp(MGR2)));
    await assertSucceeds(upd(mgr2(), 'intake', disp(MGR2)));
  });

  it('a guest with no account (intake): only the loggedBy check applies', async () => {
    await assertSucceeds(upd(peer(), 'intake', disp(PEER)));
  });

  it('still lets the owner soft-delete their own activity', async () => {
    await assertSucceeds(upd(owner(), 'own', { status: 'deleted', loggedAt: Timestamp.now() }));
  });
});

describe('round-3 probes', () => {
  it('DENIES a peer keeping a stale disputedBy that names someone else', async () => {
    await assertFails(upd(peer(), 'staleOther', legacyDisp(PEER)));
    await assertSucceeds(upd(peer(), 'staleOther', disp(PEER)));
  });

  it('DENIES an admin rewriting the disputer or resolver of an open dispute', async () => {
    await assertFails(upd(mgr(), 'pending', { disputedBy: OWNER, disputeResolvedBy: OWNER }));
    await assertFails(upd(mgr(), 'pending', { disputeResolvedBy: MGR }));
    await assertSucceeds(upd(mgr(), 'pending', { verified: true, verifiedBy: MGR }));
  });

  it("DENIES an old build's 'delete' resolution after another admin already resolved", async () => {
    await assertSucceeds(upd(mgr(), 'pending', resolve('reject', MGR)));
    await assertFails(
      upd(mgr2(), 'pending', {
        status: 'deleted',
        disputeResolvedBy: MGR2,
        disputeResolvedAt: Timestamp.now(),
        loggedAt: Timestamp.now(),
      }),
    );
  });

  it("DENIES an old build's 'delete' resolution, even of an open dispute (never delete a disputed activity)", async () => {
    await assertFails(
      upd(mgr(), 'pending', {
        status: 'deleted',
        disputeResolvedBy: MGR,
        disputeResolvedAt: Timestamp.now(),
        loggedAt: Timestamp.now(),
      }),
    );
  });

  it('DENIES the owner soft-deleting a resolved activity (dispute history); an undisputed one still works', async () => {
    await assertSucceeds(upd(mgr(), 'pending', resolve('reject', MGR)));
    await assertFails(upd(owner(), 'pending', { status: 'deleted', loggedAt: Timestamp.now() }));
    await assertSucceeds(upd(owner(), 'own', { status: 'deleted', loggedAt: Timestamp.now() }));
  });
});
