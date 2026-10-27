/**
 * Firestore Security Rules Tests — the trusted dispute record (round 5,
 * item 4 and D7).
 *
 *   - dispute-archive/{key}_{stamp}_{decisionId} is server-only: no client
 *     rule matches it, so nobody reads or writes it from the app.
 *   - /disputes stays the legacy, client-written collection: an older
 *     build's resolve batch (house + guest + /disputes) must still commit,
 *     or its activity write after it never runs.
 *   - A REOPEN sets the six decision fields to null explicitly; deleting
 *     them is refused.
 *
 * Requires the Firestore emulator on port 8080:
 *   cd firebase && firebase emulators:exec --only firestore --project demo-test \
 *     "cd .. && npx jest --config jest.config.rules.js firebase/__tests__/disputeArchive.rules.test.ts"
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
  writeBatch,
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
const OWN = 'ownerSuper';
const T0 = Timestamp.fromDate(new Date('2026-01-14T18:00:00Z'));
const ARCHIVE_ID = 'a1_0123456789abcdef_decided_1';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-dispute-archive-rules-test',
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
  status: 'disputed',
  verified: false,
  loggedBy: RES,
  disputeReason: 'r',
  disputeResolvedBy: PEER,
  timestamp: T0,
  loggedAt: T0,
  ...o,
});

beforeEach(async () => {
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, 'guests/g1'), { houseId: H, userId: RES, firstName: 'R' });
    await setDoc(doc(db, `houses/${H}`), {
      name: 'H',
      disputes: { 'uuid-1': { id: 'uuid-1', activityId: 'a1', status: 'pending', message: 'r' } },
    });
    // An older build's pending dispute (disputer only in disputeResolvedBy).
    await setDoc(doc(db, 'activities/a1'), act());
    await setDoc(
      doc(db, 'activities/decided'),
      act({ status: 'resolved', disputedBy: PEER, disputeResolvedBy: MGR, disputeResolvedAt: T0 }),
    );
    await setDoc(doc(db, `activities/decided/dispute-decisions/decided_${T0.toMillis()}`), {
      event: 'kept',
    });
    await setDoc(doc(db, `dispute-archive/${ARCHIVE_ID}`), {
      houseId: H,
      resolutionMessage: 'approved',
    });
  });
});

afterEach(async () => {
  await env.clearFirestore();
});

const ctx = (uid: string, claims: DocumentData) =>
  env.authenticatedContext(uid, claims).firestore();
const res = () => ctx(RES, { guest: { [H]: true } });
const mgr = () => ctx(MGR, { admin: { [H]: true } });
const own = () => ctx(OWN, { superAdmin: { [H]: true } });

describe('dispute-archive (trusted, server-only)', () => {
  it('no client reads or writes it: residents, admins, owners', async () => {
    for (const db of [res(), mgr(), own()]) {
      await assertFails(getDoc(doc(db, `dispute-archive/${ARCHIVE_ID}`)));
      await assertFails(
        setDoc(doc(db, 'dispute-archive/forged'), { houseId: H, resolutionMessage: 'approved' }),
      );
      await assertFails(
        updateDoc(doc(db, `dispute-archive/${ARCHIVE_ID}`), { resolutionMessage: 'rejected' }),
      );
    }
  });
});

describe("an older build's resolve (legacy /disputes)", () => {
  it('its batch (house + guest + /disputes) still commits, then its activity write', async () => {
    const db = mgr();
    const batch = writeBatch(db);
    batch.update(doc(db, `houses/${H}`), { id: H, disputes: {} });
    batch.update(doc(db, 'guests/g1'), { houseId: H, userId: RES, firstName: 'R' });
    batch.set(doc(db, 'disputes/uuid-1'), {
      id: 'uuid-1',
      activityId: 'a1',
      guestId: 'g1',
      houseId: H,
      status: 'resolved',
      resolutionMessage: 'upheld',
    });
    await assertSucceeds(batch.commit());
    // Its "keep": resolved with the resolver and server time.
    await assertSucceeds(
      updateDoc(doc(db, 'activities/a1'), {
        status: 'resolved',
        disputeResolvedBy: MGR,
        disputeResolvedAt: serverTimestamp(),
        loggedAt: serverTimestamp(),
      }),
    );
  });
});

describe('D7: a reopen clears the decision to null, never deletes it', () => {
  const nulls = {
    disputed: null,
    incomplete: null,
    disputeResult: null,
    disputeOutcome: null,
    disputeResolvedBy: null,
    disputeResolvedAt: null,
  };
  const reopen = (decision: DocumentData) => ({
    status: 'disputed',
    reopenedBy: OWN,
    reopenedAt: serverTimestamp(),
    ...decision,
  });

  it('refuses a reopen that deletes the decision fields', async () => {
    const deletes = Object.fromEntries(Object.keys(nulls).map((k) => [k, deleteField()]));
    await assertFails(updateDoc(doc(own(), 'activities/decided'), reopen(deletes)));
    await assertFails(
      updateDoc(
        doc(own(), 'activities/decided'),
        reopen({ ...nulls, disputeResolvedAt: deleteField() }),
      ),
    );
  });

  it('accepts the reopen the app writes (explicit nulls)', async () => {
    await assertSucceeds(updateDoc(doc(own(), 'activities/decided'), reopen(nulls)));
  });
});
