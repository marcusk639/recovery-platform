/**
 * Firestore Security Rules Tests — PR #141 review round 5 (probe6).
 *
 *   - An admin creates activities only as their own logger (a senior peer
 *     could log their own activity "by" another admin, with a stamp they had
 *     just pointed elsewhere).
 *   - A null residentUid is no stamp: with neither a usable stamp nor a guest
 *     doc, only the house owner (superAdmin) may dispute, decide or reopen.
 *   - Activity ids are limited to what the server's dispute mirror can key on.
 *   - loggedAt is not the disputer's (or the soft-deleting owner's) to
 *     rewrite; older builds' server-time stamp stays allowed.
 *   - An older build's KEEP is accepted after a reopen (incomplete is null).
 *   - flaggedForReview is server-only; house-disputes/{houseId}, the
 *     authoritative open-dispute list, is server-only and member-readable.
 *
 * Requires the Firestore emulator on port 8080:
 *   cd firebase && firebase emulators:exec --only firestore --project demo-test \
 *     "cd .. && npx jest --config jest.config.rules.js firebase/__tests__/disputeStamp.rules.test.ts"
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
const PL = 'peerLeader';
const OWN = 'ownerSuper';
const T0 = Timestamp.fromDate(new Date('2026-01-14T18:00:00Z'));

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-dispute-stamp-rules-test',
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
  type: 'meeting',
  status: 'active',
  verified: false,
  loggedBy: MGR,
  timestamp: T0,
  loggedAt: T0,
  ...o,
});

beforeEach(async () => {
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, 'guests/g1'), { houseId: H, userId: RES });
    await setDoc(doc(db, 'guests/gpl'), { houseId: H, userId: PL });
    await setDoc(doc(db, 'activities/active'), act());
    await setDoc(doc(db, 'activities/mine'), act({ loggedBy: RES }));
    // Stamped while the guest had no account; the guest doc is gone since.
    await setDoc(
      doc(db, 'activities/nullStampNoGuest'),
      act({ guestId: 'gone', residentUid: null }),
    );
    // Stamped null; the account was linked later (the re-stamp has not run).
    await setDoc(doc(db, 'activities/nullStampLinked'), act({ residentUid: null }));
    await setDoc(
      doc(db, 'activities/reopened'),
      act({
        status: 'disputed',
        disputeReason: 'r',
        disputedBy: PEER,
        disputeResolvedBy: null,
        disputeResolvedAt: null,
        disputed: null,
        incomplete: null,
        disputeResult: null,
        disputeOutcome: null,
        reopenedBy: OWN,
        reopenedAt: T0,
      }),
    );
    await setDoc(doc(db, `house-disputes/${H}`), {
      houseId: H,
      disputes: { active: { status: 'pending' } },
    });
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
const stranger = () => ctx('stranger', { guest: { h9: true } });
type Db = ReturnType<typeof res>;
const upd = (db: Db, id: string, data: DocumentData) =>
  updateDoc(doc(db, `activities/${id}`), data);
const dispute = (uid: string): DocumentData => ({
  status: 'disputed',
  disputeReason: 'did not attend',
  disputedBy: uid,
  disputeResolvedBy: uid,
  disputedAt: serverTimestamp(),
});
const fresh = (o: DocumentData = {}) => {
  const { residentUid: _r, ...rest } = act(o);
  return rest;
};

describe('who an activity is for', () => {
  it('BREAK 1: an admin creates activities only as their own logger', async () => {
    await assertFails(
      setDoc(doc(pl(), 'activities/c1'), fresh({ guestId: 'gpl', loggedBy: MGR, verified: true })),
    );
    await assertSucceeds(
      setDoc(doc(pl(), 'activities/c2'), fresh({ guestId: 'gpl', loggedBy: PL })),
    );
    await assertSucceeds(setDoc(doc(mgr(), 'activities/c3'), fresh({ loggedBy: MGR })));
  });

  it('BREAK 2: a null stamp with no guest doc: peers may dispute; only the primary owner decides', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), `houses/${H}`), { superAdminId: OWN });
    });
    const keep = (uid: string) => ({ status: 'resolved', disputeResolvedBy: uid, disputeResolvedAt: serverTimestamp() });
    await assertSucceeds(upd(peer(), 'nullStampNoGuest', dispute(PEER)));
    await assertFails(upd(pl(), 'nullStampNoGuest', keep(PL)));
    await assertFails(upd(ctx('coOwner', { superAdmin: { [H]: true } }), 'nullStampNoGuest', keep('coOwner')));
    await assertSucceeds(upd(own(), 'nullStampNoGuest', keep(OWN)));
  });

  it('a null stamp after the account was linked: the guest doc still identifies the resident', async () => {
    await assertFails(upd(res(), 'nullStampLinked', dispute(RES)));
    await assertSucceeds(upd(peer(), 'nullStampLinked', dispute(PEER)));
  });

  it('flaggedForReview is server-only', async () => {
    await assertFails(
      setDoc(doc(mgr(), 'activities/c4'), { ...fresh({ loggedBy: MGR }), flaggedForReview: null }),
    );
    await assertFails(upd(own(), 'active', { flaggedForReview: { reason: 'x' } }));
  });
});

describe('activity ids', () => {
  it('BREAK 3: refuses an id the dispute mirror cannot key on', async () => {
    await assertFails(setDoc(doc(res(), 'activities/evil.id'), fresh({ loggedBy: RES })));
    await assertFails(setDoc(doc(res(), 'activities/sp ace'), fresh({ loggedBy: RES })));
    await assertSucceeds(setDoc(doc(res(), 'activities/Ok_id-1'), fresh({ loggedBy: RES })));
  });
});

describe('loggedAt', () => {
  it('BREAK 6: a disputer cannot rewrite loggedAt; an older build stamping server time still can', async () => {
    await assertFails(
      upd(peer(), 'active', {
        ...dispute(PEER),
        loggedAt: Timestamp.fromDate(new Date('2020-01-01')),
      }),
    );
    await assertSucceeds(upd(peer(), 'active', { ...dispute(PEER), loggedAt: serverTimestamp() }));
  });

  it('the owner soft-deleting cannot backdate loggedAt', async () => {
    await assertFails(
      upd(res(), 'mine', {
        status: 'deleted',
        loggedAt: Timestamp.fromDate(new Date('2020-01-01')),
      }),
    );
    await assertSucceeds(upd(res(), 'mine', { status: 'deleted', loggedAt: serverTimestamp() }));
  });
});

describe("an older build's KEEP after a reopen", () => {
  it('I1: is accepted with incomplete null, and records the resolver', async () => {
    await assertFails(upd(own(), 'reopened', { status: 'resolved' }));
    await assertSucceeds(
      upd(own(), 'reopened', {
        status: 'resolved',
        disputeResolvedBy: OWN,
        disputeResolvedAt: serverTimestamp(),
      }),
    );
  });
});

describe('house-disputes/{houseId}', () => {
  it('BREAK 5: is readable by house members and written by nobody but the server', async () => {
    await assertSucceeds(getDoc(doc(res(), `house-disputes/${H}`)));
    await assertSucceeds(getDoc(doc(mgr(), `house-disputes/${H}`)));
    await assertFails(getDoc(doc(stranger(), `house-disputes/${H}`)));
    await assertFails(
      updateDoc(doc(own(), `house-disputes/${H}`), { 'disputes.active': deleteField() }),
    );
    await assertFails(
      updateDoc(doc(pl(), `house-disputes/${H}`), { 'disputes.active': deleteField() }),
    );
    await assertFails(setDoc(doc(res(), `house-disputes/${H}`), { disputes: {} }));
  });
});
