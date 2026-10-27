/**
 * Firestore Security Rules Tests — dispute transitions, disputer identity and
 * the house document (PR #141 review)
 *
 * Each "BLOCKS" case below was a working attack against the previous rules
 * (the reviewer's probes plus the variants around them):
 *   - a resident moved their own DELETED or APPROVED activity to disputed,
 *     which made it count again / reopened the dispute, and each move
 *     notified the admins (so disputed <-> deleted cycling flooded them);
 *   - a resident planted disputedBy/disputeResolvedBy on create, or named
 *     someone else as the disputer, suppressing that person's notification;
 *   - a resident rewrote arbitrary house fields, including the whole
 *     house.disputes map (forging or deleting other people's disputes).
 *
 * Rules now: only active -> disputed enters a dispute, and it must name the
 * caller as disputer; -> deleted is allowed from anywhere; nothing leaves
 * deleted or an approved resolution except through an admin. house.disputes
 * is maintained by the onActivityWritten Cloud Function; residents may update
 * only complaints, issues and currentCapacity on the house document, never
 * house.disputes.
 *
 * Requires the Firestore emulator on port 8080:
 *   cd firebase && firebase emulators:exec --only firestore --project demo-test \
 *     "cd .. && npx jest --config jest.config.rules.js firebase/__tests__/disputeIntegrity.rules.test.ts"
 */

import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, writeBatch, Timestamp, DocumentData, serverTimestamp } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ID = 'demo-dispute-integrity-rules-test';
const RULES_PATH = path.resolve(__dirname, '../firestore.rules');

const HOUSE = 'h1';
const OWNER = 'residentUid';
const PEER = 'peerUid';
const MGR = 'mgr';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
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
    await setDoc(doc(db, `houses/${HOUSE}`), {
      name: 'H',
      disputes: { pending: { activityId: 'pending', guestId: 'g1', status: 'pending' } },
      adminIds: [MGR],
    });
    await setDoc(doc(db, 'activities/active'), act());
    await setDoc(doc(db, 'activities/del'), act({ status: 'deleted' }));
    await setDoc(
      doc(db, 'activities/approved'),
      act({
        status: 'resolved',
        incomplete: true,
        disputed: 'successful',
        disputeResult: 'success',
      }),
    );
    await setDoc(
      doc(db, 'activities/rejected'),
      act({ status: 'resolved', incomplete: false, disputed: 'rejected', disputeResult: 'fail' }),
    );
    await setDoc(
      doc(db, 'activities/pending'),
      act({ status: 'disputed', disputedBy: PEER, disputeResolvedBy: PEER }),
    );
  });
});

afterEach(async () => {
  await env.clearFirestore();
});

const resident = () => env.authenticatedContext(OWNER, { guest: { [HOUSE]: true } }).firestore();
const peer = () => env.authenticatedContext(PEER, { guest: { [HOUSE]: true } }).firestore();
const manager = () => env.authenticatedContext(MGR, { admin: { [HOUSE]: true } }).firestore();
type Db = ReturnType<typeof resident>;
const upd = (db: Db, id: string, data: DocumentData) =>
  updateDoc(doc(db, `activities/${id}`), data);

/** What the current app's disputeActivity(id, reason, uid) writes. */
const dispute = (uid: string): DocumentData => ({
  status: 'disputed',
  disputeReason: 'x',
  disputedBy: uid,
  disputeResolvedBy: uid,
  loggedAt: Timestamp.now(),
});

describe('only active -> disputed starts a dispute', () => {
  it('BLOCKS the owner resurrecting a soft-deleted activity by disputing it (probe 1)', async () => {
    await assertFails(upd(resident(), 'del', dispute(OWNER)));
  });

  it('BLOCKS the owner re-disputing an approved activity (probe 2)', async () => {
    await assertFails(upd(resident(), 'approved', { status: 'disputed' }));
    await assertFails(upd(resident(), 'approved', dispute(OWNER)));
  });

  it('BLOCKS re-disputing a rejected or still-pending dispute', async () => {
    await assertFails(upd(resident(), 'rejected', dispute(OWNER)));
    await assertFails(upd(peer(), 'rejected', dispute(PEER)));
    await assertFails(upd(resident(), 'pending', dispute(OWNER)));
  });

  it('breaks the disputed <-> deleted cycle that flooded admins with notifications', async () => {
    await assertSucceeds(upd(peer(), 'active', dispute(PEER)));
    // A disputed activity is never deleted (owner rule), and cannot be
    // re-disputed while its dispute is open.
    await assertFails(
      upd(resident(), 'active', { status: 'deleted', loggedAt: Timestamp.now() }),
    );
    await assertFails(upd(peer(), 'active', dispute(PEER)));
  });

  it('lets the owner soft-delete only an activity with no dispute history', async () => {
    await assertSucceeds(upd(resident(), 'active', { status: 'deleted', loggedAt: Timestamp.now() }));
    for (const id of ['pending', 'approved', 'rejected']) {
      await assertFails(upd(resident(), id, { status: 'deleted', loggedAt: Timestamp.now() }));
    }
  });

  it('BLOCKS the owner leaving deleted for any other status', async () => {
    await assertFails(upd(resident(), 'del', { status: 'active' }));
    await assertFails(upd(resident(), 'del', { status: 'resolved' }));
  });

  it('lets an admin restore a deleted, never-disputed activity, but not move a decision back to active (REOPEN is the way back)', async () => {
    await assertSucceeds(upd(manager(), 'del', { status: 'active' }));
    await assertFails(upd(manager(), 'approved', { status: 'active', incomplete: false }));
  });
});

describe('the disputer is the caller', () => {
  it('BLOCKS a resident creating an activity with a planted disputer (probe 3)', async () => {
    await assertFails(
      setDoc(
        doc(resident(), 'activities/planted'),
        act({ disputedBy: MGR, disputeResolvedBy: MGR }),
      ),
    );
    await assertFails(
      setDoc(doc(resident(), 'activities/planted'), act({ disputeResolvedBy: MGR })),
    );
    await assertFails(
      setDoc(doc(resident(), 'activities/planted'), act({ disputeReason: 'pre-filled' })),
    );
  });

  it('BLOCKS the owner self-disputing while naming someone else (probe 4)', async () => {
    await assertFails(upd(resident(), 'active', { status: 'disputed', disputeResolvedBy: MGR }));
    await assertFails(upd(resident(), 'active', { ...dispute(OWNER), disputedBy: MGR }));
  });

  it('BLOCKS a peer naming someone else in disputedBy or disputeResolvedBy', async () => {
    await assertFails(upd(peer(), 'active', { ...dispute(PEER), disputedBy: OWNER }));
    await assertFails(upd(peer(), 'active', { ...dispute(PEER), disputeResolvedBy: MGR }));
  });

  it('BLOCKS a dispute that does not name the caller at all', async () => {
    await assertFails(upd(peer(), 'active', { status: 'disputed', disputeReason: 'x' }));
    await assertFails(upd(resident(), 'active', { status: 'disputed' }));
  });

  it('accepts the current app payload, and the payload of builds before disputedBy', async () => {
    await assertSucceeds(upd(peer(), 'active', dispute(PEER)));
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), 'activities/active'), act());
    });
    const { disputedBy: _omit, ...legacy } = dispute(PEER);
    await assertSucceeds(upd(peer(), 'active', legacy));
  });

  it('BLOCKS an admin recording someone else as the resolver', async () => {
    await assertFails(
      upd(manager(), 'pending', {
        status: 'resolved',
        disputed: 'rejected',
        incomplete: false,
        disputeResult: 'fail',
        disputeResolvedBy: OWNER,
        disputeResolvedAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(
      upd(manager(), 'pending', {
        status: 'resolved',
        disputed: 'rejected',
        incomplete: false,
        disputeResult: 'fail',
        disputeResolvedBy: MGR,
        disputeResolvedAt: serverTimestamp(),
      }),
    );
  });
});

describe('the house document', () => {
  it('BLOCKS a resident rewriting an arbitrary house field (probe 5)', async () => {
    await assertFails(updateDoc(doc(resident(), `houses/${HOUSE}`), { name: 'pwned', rules: 'x' }));
  });

  it('BLOCKS a resident writing house.disputes (the server maintains it)', async () => {
    await assertFails(
      updateDoc(doc(peer(), `houses/${HOUSE}`), { disputes: { forged: { activityId: 'active' } } }),
    );
    // ...or wiping someone else's entry.
    await assertFails(updateDoc(doc(peer(), `houses/${HOUSE}`), { disputes: {} }));
  });

  it('still lets a house admin update the house', async () => {
    await assertSucceeds(updateDoc(doc(manager(), `houses/${HOUSE}`), { name: 'Renamed' }));
  });

  it("an old build's dispute still records: the activity write is separate from its failing house batch", async () => {
    const db = peer();
    // Old builds await the activity update first...
    await assertSucceeds(
      upd(db, 'active', { status: 'disputed', disputeReason: 'x', disputeResolvedBy: PEER }),
    );
    // ...then send the house mirror batch, which now fails on its own.
    const batch = writeBatch(db);
    batch.update(doc(db, `houses/${HOUSE}`), { disputes: { d1: { activityId: 'active' } } });
    await assertFails(batch.commit());
  });
});
