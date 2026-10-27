/**
 * Firestore Security Rules Tests — PR #141 re-review probes
 *
 *   A. A resident lowered their own phase thresholds (house.phases was in the
 *      resident allowlist for a self-delete path that is denied anyway).
 *   C. A peer leader (admin claim) disputed while naming the resident as the
 *      disputer; admins entering a dispute were not held to naming
 *      themselves, and the Cloud Function trusts that field.
 *   F. The owner could not re-dispute an activity an admin had restored after
 *      the owner disputed it: the disputer fields already named them, so the
 *      write "changed" neither.
 *   +  A second admin's resolve overwrote the first admin's outcome.
 *
 * Requires the Firestore emulator on port 8080:
 *   cd firebase && firebase emulators:exec --only firestore --project demo-test \
 *     "cd .. && npx jest --config jest.config.rules.js firebase/__tests__/disputeReReview.rules.test.ts"
 */

import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, Timestamp, DocumentData, serverTimestamp } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';

const RULES_PATH = path.resolve(__dirname, '../firestore.rules');
const HOUSE = 'h1';
const OWNER = 'residentUid';
const PEER = 'peerUid';
const MGR = 'mgr';
const PL = 'peerLeader';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-dispute-rereview-rules-test',
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
  // Stamped by the server (onActivityWritten) from guests.userId.
  residentUid: OWNER,
  timestamp: Timestamp.fromDate(new Date('2026-01-14T18:00:00Z')),
  ...o,
});

beforeEach(async () => {
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, 'guests/g1'), { houseId: HOUSE, userId: OWNER, phase: 'Entry' });
    await setDoc(doc(db, `houses/${HOUSE}`), {
      name: 'H',
      disputes: {},
      adminIds: [MGR],
      currentCapacity: 2,
      phases: { Entry: { name: 'Entry', rules: { meetings: 5, work: 20 } } },
      rooms: { r1: { beds: { b1: { id: 'b1', guestId: 'g1' } } } },
    });
    await setDoc(doc(db, 'activities/active'), act());
    await setDoc(doc(db, 'activities/pending'), act({ status: 'disputed', disputedBy: PEER, disputeResolvedBy: PEER }));
    // The owner disputed it, then an admin restored it to active.
    await setDoc(
      doc(db, 'activities/restored'),
      act({ disputedBy: OWNER, disputeResolvedBy: OWNER, disputeReason: 'x' }),
    );
    await setDoc(
      doc(db, 'activities/approvedByOwner'),
      act({ status: 'resolved', incomplete: true, disputed: 'successful', disputedBy: OWNER, disputeResolvedBy: MGR }),
    );
  });
});

afterEach(async () => {
  await env.clearFirestore();
});

const ctx = (uid: string, claims: Record<string, unknown>) => env.authenticatedContext(uid, claims).firestore();
const res = () => ctx(OWNER, { guest: { [HOUSE]: true } });
const peer = () => ctx(PEER, { guest: { [HOUSE]: true } });
const mgr = () => ctx(MGR, { admin: { [HOUSE]: true } });
const pl = () => ctx(PL, { admin: { [HOUSE]: true }, guest: { [HOUSE]: true } });
type Db = ReturnType<typeof res>;
const upd = (db: Db, id: string, data: DocumentData) => updateDoc(doc(db, `activities/${id}`), data);
const disp = (uid: string): DocumentData => ({
  status: 'disputed',
  disputeReason: 'r',
  disputedBy: uid,
  disputeResolvedBy: uid,
  loggedAt: serverTimestamp(),
});
const resolve = (outcome: 'approve' | 'reject', by: string): DocumentData => ({
  status: 'resolved',
  disputed: outcome === 'approve' ? 'successful' : 'rejected',
  ...(outcome === 'approve' ? { disputeOutcome: 'incomplete-per-residents' } : {}),
  incomplete: outcome === 'approve',
  disputeResult: outcome === 'approve' ? 'success' : 'fail',
  disputeResolvedBy: by,
  disputeResolvedAt: serverTimestamp(),
  loggedAt: serverTimestamp(),
});

describe('A: residents cannot change the house configuration', () => {
  it('BLOCKS a resident lowering their own phase thresholds', async () => {
    await assertFails(
      updateDoc(doc(res(), `houses/${HOUSE}`), {
        'phases.Entry.rules.meetings': 0,
        'phases.Entry.rules.work': 0,
      }),
    );
  });

  it('BLOCKS a resident rewriting rooms', async () => {
    await assertFails(updateDoc(doc(res(), `houses/${HOUSE}`), { rooms: {} }));
  });

  it('still allows the fields resident flows write: complaints, issues, currentCapacity', async () => {
    await assertSucceeds(updateDoc(doc(res(), `houses/${HOUSE}`), { complaints: { c1: { description: 'x' } } }));
    await assertSucceeds(updateDoc(doc(res(), `houses/${HOUSE}`), { issues: { i1: { description: 'y' } } }));
    await assertSucceeds(updateDoc(doc(res(), `houses/${HOUSE}`), { currentCapacity: 3 }));
  });
});

describe('C: an admin entering a dispute names themselves', () => {
  it('BLOCKS a peer leader disputing while naming the resident as disputer', async () => {
    await assertFails(
      upd(pl(), 'active', { status: 'disputed', disputeReason: 'r', disputedBy: OWNER, loggedAt: serverTimestamp() }),
    );
    await assertFails(upd(mgr(), 'active', { ...disp(MGR), disputeResolvedBy: OWNER }));
  });

  it('lets a peer leader or manager dispute naming themselves', async () => {
    await assertSucceeds(upd(pl(), 'active', disp(PL)));
    await assertSucceeds(upd(mgr(), 'restored', disp(MGR)));
  });
});

describe('F: closed by the owner rule (never your own activity)', () => {
  it('DENIES the owner re-disputing their own restored activity, even with the fields already naming them', async () => {
    await assertFails(upd(res(), 'restored', disp(OWNER)));
    await assertFails(upd(res(), 'restored', { status: 'disputed', disputeReason: 'r', loggedAt: serverTimestamp() }));
  });

  it('opens no other path: not from a resolution, and not for someone the fields do not name', async () => {
    await assertFails(upd(res(), 'approvedByOwner', disp(OWNER)));
    await assertFails(upd(res(), 'restored', { status: 'disputed', disputeReason: 'r', disputedBy: PEER }));
  });

  it('a peer can still dispute the restored activity, naming themselves', async () => {
    await assertSucceeds(upd(peer(), 'restored', disp(PEER)));
  });
});

describe('resolving: only an open dispute, once', () => {
  it("BLOCKS a second admin overwriting the first admin's resolution", async () => {
    await assertSucceeds(upd(mgr(), 'pending', resolve('approve', MGR)));
    await assertFails(upd(pl(), 'pending', resolve('reject', PL)));
    await assertFails(upd(mgr(), 'pending', resolve('approve', MGR)));
  });

  it('BLOCKS resolving an activity that was never disputed', async () => {
    await assertFails(upd(mgr(), 'active', resolve('reject', MGR)));
  });

  it('DENIES an admin restoring an approved activity to active (REOPEN is the way back), still lets them edit other fields', async () => {
    await assertFails(upd(mgr(), 'approvedByOwner', { status: 'active', incomplete: false }));
    await assertSucceeds(upd(mgr(), 'active', { verified: true, verifiedBy: MGR }));
  });
});
