/**
 * Firestore Security Rules Tests — PR #141 review round 8 (verifier v9).
 *
 *   L1/L2: loggedBy is immutable after create, for every client. Re-sending
 *          the same value (old builds' full-object writes) still passes.
 *   C1-C3: once there is dispute history (pending, decided or reopened),
 *          type, timestamp and data are frozen: a retyped or re-dated meeting
 *          would drop out of the week summary and the court export (which
 *          lists type == 'meeting'). No app path edits them after a dispute;
 *          VERIFY does not write them.
 *   E1:    a peer's ENTER may stamp loggedAt with the server time (older
 *          builds do) only on an activity that has a timestamp: the export
 *          dates a timestamp-less activity by loggedAt.
 *
 * Requires the Firestore emulator on port 8080:
 *   cd firebase && firebase emulators:exec --only firestore --project demo-test \
 *     "cd .. && npx jest --config jest.config.rules.js firebase/__tests__/disputeFrozenFields.rules.test.ts"
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
  deleteField,
  serverTimestamp,
  Timestamp,
  DocumentData,
} from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';

const RULES_PATH = path.resolve(__dirname, '../firestore.rules');
const H = 'h1';
const R = 'residentUid';
const P = 'peerUid';
const M = 'mgr';
const M2 = 'mgr2';
const T0 = Timestamp.fromDate(new Date('2026-01-14T18:00:00Z'));
const OLD = Timestamp.fromDate(new Date('2020-01-01T00:00:00Z'));

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-dispute-frozen-fields-rules-test',
    firestore: { rules: fs.readFileSync(RULES_PATH, 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});

afterAll(async () => {
  await env.cleanup();
});

const meeting = (o: DocumentData = {}) => ({
  guestId: 'gR',
  residentUid: R,
  houseId: H,
  type: 'meeting',
  status: 'active',
  verified: false,
  loggedBy: M,
  data: { meetingName: 'AA', duration: 60 },
  timestamp: T0,
  loggedAt: T0,
  ...o,
});
const disputedBy = { disputeReason: 'not there', disputedBy: P, disputeResolvedBy: P };

beforeEach(async () => {
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, 'guests/gR'), { houseId: H, userId: R });
    await setDoc(doc(db, 'activities/active'), meeting());
    await setDoc(doc(db, 'activities/pending'), meeting({ status: 'disputed', ...disputedBy }));
    await setDoc(
      doc(db, 'activities/rejected'),
      meeting({
        status: 'resolved',
        disputed: 'rejected',
        incomplete: false,
        disputeResult: 'fail',
        ...disputedBy,
        disputeResolvedBy: M2,
        disputeResolvedAt: T0,
      }),
    );
    await setDoc(
      doc(db, 'activities/reopened'),
      meeting({
        status: 'disputed',
        ...disputedBy,
        disputeResolvedBy: null,
        disputeResolvedAt: null,
        reopenedBy: M2,
        reopenedAt: T0,
      }),
    );
    const { timestamp: _t, ...noTimestamp } = meeting();
    await setDoc(doc(db, 'activities/noTimestamp'), noTimestamp);
  });
});

afterEach(async () => {
  await env.clearFirestore();
});

const ctx = (uid: string, claims: DocumentData) =>
  env.authenticatedContext(uid, claims).firestore();
const mgr = () => ctx(M, { admin: { [H]: true } });
const mgr2 = () => ctx(M2, { admin: { [H]: true } });
const peer = () => ctx(P, { guest: { [H]: true } });
type Db = ReturnType<typeof peer>;
const upd = (db: Db, id: string, data: DocumentData) =>
  updateDoc(doc(db, `activities/${id}`), data);
const enter = (uid: string): DocumentData => ({
  status: 'disputed',
  disputeReason: 'not there',
  disputedBy: uid,
  disputeResolvedBy: uid,
  disputedAt: serverTimestamp(),
});

describe('L1/L2: loggedBy is immutable after create', () => {
  it('an admin cannot reassign loggedBy, to another admin or to a peer', async () => {
    await assertFails(upd(mgr(), 'active', { loggedBy: M2 }));
    await assertFails(upd(mgr(), 'active', { loggedBy: P }));
    await assertFails(upd(mgr(), 'active', { loggedBy: deleteField() }));
  });

  it('re-sending the same loggedBy (old builds) and VERIFY still pass', async () => {
    await assertSucceeds(
      upd(mgr2(), 'active', {
        loggedBy: M,
        verified: true,
        verifiedBy: M2,
        loggedAt: serverTimestamp(),
      }),
    );
  });
});

describe('C1-C3: type, timestamp and data are frozen once there is dispute history', () => {
  it('on a pending, a decided and a reopened dispute', async () => {
    for (const id of ['pending', 'rejected', 'reopened']) {
      await assertFails(upd(mgr2(), id, { type: 'chore' }));
      await assertFails(upd(mgr2(), id, { timestamp: OLD }));
      await assertFails(upd(mgr2(), id, { data: { meetingName: 'AA', duration: 0 } }));
      await assertSucceeds(
        upd(mgr2(), id, { verified: true, verifiedBy: M2, loggedAt: serverTimestamp() }),
      );
    }
  });

  it('nor in the resolving write itself; before any dispute they stay editable', async () => {
    const reject = {
      status: 'resolved',
      disputed: 'rejected',
      incomplete: false,
      disputeResult: 'fail',
      disputeResolvedBy: M2,
      disputeResolvedAt: serverTimestamp(),
    };
    await assertFails(upd(mgr2(), 'pending', { ...reject, type: 'chore' }));
    await assertFails(upd(mgr2(), 'pending', { ...reject, timestamp: OLD }));
    await assertSucceeds(
      upd(mgr2(), 'active', { timestamp: OLD, data: { meetingName: 'NA', duration: 30 } }),
    );
  });
});

describe('E1: ENTER and loggedAt on a timestamp-less activity', () => {
  it('may not move its export date; a dispute without loggedAt still works', async () => {
    await assertFails(upd(peer(), 'noTimestamp', { ...enter(P), loggedAt: serverTimestamp() }));
    await assertSucceeds(upd(peer(), 'noTimestamp', enter(P)));
  });

  it('with a timestamp, an older build may still stamp loggedAt', async () => {
    await assertSucceeds(upd(peer(), 'active', { ...enter(P), loggedAt: serverTimestamp() }));
  });
});
