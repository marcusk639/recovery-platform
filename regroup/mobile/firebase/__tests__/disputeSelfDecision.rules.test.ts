/**
 * Firestore Security Rules Tests — PR #141 review round 6 (probe7).
 *
 *   A. A resident who is also staff (admin claim) cannot decide a dispute on
 *      their own activity by changing their guest doc: the stamp is
 *      immutable (no client writes it, the server only fills an empty one).
 *      With no usable stamp only the house's primary owner
 *      (houses/{id}.superAdminId) decides; peers may still raise a dispute.
 *   C. A decision cannot clear or forge flaggedForReview, and no client path
 *      backdates loggedAt.
 *
 * Requires the Firestore emulator on port 8080:
 *   cd firebase && firebase emulators:exec --only firestore --project demo-test \
 *     "cd .. && npx jest --config jest.config.rules.js firebase/__tests__/disputeSelfDecision.rules.test.ts"
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
const S = 'staffResident'; // admin claim AND the resident of guests/gS
const P = 'peerUid';
const M = 'mgr';
const M2 = 'mgr2';
const O = 'primaryOwner'; // houses/h1.superAdminId
const CO = 'coOwner'; // superAdmin claim, not the primary owner
const T0 = Timestamp.fromDate(new Date('2026-01-14T18:00:00Z'));

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-dispute-self-decision-rules-test',
    firestore: { rules: fs.readFileSync(RULES_PATH, 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});

afterAll(async () => {
  await env.cleanup();
});

const act = (o: DocumentData = {}) => ({
  guestId: 'gS',
  houseId: H,
  type: 'chore',
  status: 'disputed',
  verified: false,
  loggedBy: M,
  disputeReason: 'S skipped chores',
  disputedBy: P,
  disputeResolvedBy: P,
  timestamp: T0,
  loggedAt: T0,
  ...o,
});

beforeEach(async () => {
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, `houses/${H}`), { name: 'H', superAdminId: O });
    await setDoc(doc(db, 'guests/gS'), { houseId: H, userId: S });
    await setDoc(doc(db, 'guests/gP'), { houseId: H, userId: P });
    // Stamped S when logged (onActivityWritten, or the app at create).
    await setDoc(doc(db, 'activities/xA'), act({ residentUid: S }));
    // Logged by an older build; the trigger has not stamped it yet.
    await setDoc(doc(db, 'activities/unstamped'), act());
    await setDoc(
      doc(db, 'activities/flagged'),
      act({
        residentUid: S,
        flaggedForReview: { reason: 'self_decision', event: 'rejected', decisionId: 'd' },
      }),
    );
  });
});

afterEach(async () => {
  await env.clearFirestore();
});

const ctx = (uid: string, claims: DocumentData) =>
  env.authenticatedContext(uid, claims).firestore();
const staff = () => ctx(S, { admin: { [H]: true }, guest: { [H]: true } });
const peer = () => ctx(P, { guest: { [H]: true } });
const mgr2 = () => ctx(M2, { admin: { [H]: true } });
const owner = () => ctx(O, { superAdmin: { [H]: true } });
const coOwner = () => ctx(CO, { superAdmin: { [H]: true } });
type Db = ReturnType<typeof peer>;
const upd = (db: Db, id: string, data: DocumentData) =>
  updateDoc(doc(db, `activities/${id}`), data);
const reject = (uid: string, extra: DocumentData = {}): DocumentData => ({
  status: 'resolved',
  disputed: 'rejected',
  incomplete: false,
  disputeResult: 'fail',
  disputeResolvedBy: uid,
  disputeResolvedAt: serverTimestamp(),
  ...extra,
});

describe('A: a staff member who is the resident', () => {
  it('cannot reject their own dispute after pointing their guest doc at a decoy (#141 rules alone)', async () => {
    await assertFails(upd(staff(), 'xA', reject(S)));
    await assertSucceeds(updateDoc(doc(staff(), 'guests/gS'), { userId: 'decoy' }));
    await assertFails(upd(staff(), 'xA', reject(S)));
    await assertFails(upd(staff(), 'xA', { residentUid: 'decoy' }));
  });

  it('cannot reject it after deleting and recreating their guest doc with a decoy', async () => {
    await assertSucceeds(deleteDoc(doc(staff(), 'guests/gS')));
    await assertSucceeds(setDoc(doc(staff(), 'guests/gS'), { houseId: H, userId: 'decoy' }));
    await assertFails(upd(staff(), 'xA', reject(S)));
    await assertSucceeds(upd(mgr2(), 'xA', reject(M2)));
  });

  it('an unstamped activity of an accountless guest: any admin but its logger decides', async () => {
    // A staff resident blanking their OWN guest doc is stopped by #145's
    // guest rules (userId immutable once set); here the guest never had one.
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), 'guests/gS'), { houseId: H, userId: '' });
    });
    await assertFails(upd(ctx(M, { admin: { [H]: true } }), 'unstamped', reject(M)));
    await assertSucceeds(upd(coOwner(), 'unstamped', reject(CO)));
  });

  it('an unstamped activity can still be disputed by a peer (not its logger)', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(
        doc(c.firestore(), 'activities/fresh'),
        act({ status: 'active', disputedBy: null, disputeResolvedBy: null, disputeReason: null }),
      );
    });
    await assertSucceeds(
      upd(peer(), 'fresh', {
        status: 'disputed',
        disputeReason: 'not done',
        disputedBy: P,
        disputeResolvedBy: P,
        disputedAt: serverTimestamp(),
      }),
    );
  });
});

describe('C: flaggedForReview and loggedAt on the decision paths', () => {
  it('a resolution can neither clear nor forge flaggedForReview', async () => {
    await assertFails(upd(mgr2(), 'flagged', reject(M2, { flaggedForReview: deleteField() })));
    await assertFails(upd(mgr2(), 'xA', reject(M2, { flaggedForReview: { reason: 'forged' } })));
    await assertSucceeds(upd(mgr2(), 'flagged', reject(M2)));
  });

  it('a resolution, and an admin edit of a decided activity, cannot backdate loggedAt', async () => {
    const old = Timestamp.fromDate(new Date('2020-01-01'));
    await assertFails(upd(mgr2(), 'xA', reject(M2, { loggedAt: old })));
    await assertSucceeds(upd(mgr2(), 'xA', reject(M2, { loggedAt: serverTimestamp() })));
    await assertFails(upd(mgr2(), 'xA', { loggedAt: old }));
    // L1: once there is dispute history, not even the server time.
    await assertFails(upd(mgr2(), 'xA', { verified: true, loggedAt: serverTimestamp() }));
    await assertSucceeds(upd(mgr2(), 'xA', { verified: true }));
  });

  it('a reopen can neither clear nor forge flaggedForReview', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      const db = c.firestore();
      await setDoc(
        doc(db, 'activities/decided'),
        act({
          residentUid: S,
          status: 'resolved',
          disputeResolvedBy: M2,
          disputeResolvedAt: T0,
          flaggedForReview: { reason: 'self_decision' },
        }),
      );
      await setDoc(doc(db, `activities/decided/dispute-decisions/decided_${T0.toMillis()}`), {
        event: 'kept',
      });
    });
    const reopen = {
      status: 'disputed',
      reopenedBy: O,
      reopenedAt: serverTimestamp(),
      disputed: null,
      incomplete: null,
      disputeResult: null,
      disputeOutcome: null,
      disputeResolvedBy: null,
      disputeResolvedAt: null,
    };
    await assertFails(upd(owner(), 'decided', { ...reopen, flaggedForReview: deleteField() }));
    await assertFails(
      upd(owner(), 'decided', { ...reopen, flaggedForReview: { reason: 'forged' } }),
    );
    await assertSucceeds(upd(owner(), 'decided', reopen));
  });
});
