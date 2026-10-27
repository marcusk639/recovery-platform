/**
 * Firestore Security Rules Tests — disputed activities are never deleted
 *
 * Owner rule: "Disputed activities should never be deleted. They should be
 * marked as having been successfully disputed and that the residents of the
 * house claim the activity was incomplete."
 *
 * Once an activity has any dispute history (an open dispute, a resolution, or
 * any disputer / resolver / resolution time recorded), nobody — owner, peer,
 * admin or superAdmin — may move it to `deleted` or hard-delete it. A dispute
 * ends only by APPROVE (resolved, disputed 'successful', incomplete true,
 * disputeOutcome 'incomplete-per-residents') or REJECT (disputed 'rejected',
 * incomplete false). An old build's resolveDispute(..., 'delete') is refused.
 *
 * Requires the Firestore emulator on port 8080:
 *   cd firebase && firebase emulators:exec --only firestore --project demo-test \
 *     "cd .. && npx jest --config jest.config.rules.js firebase/__tests__/noDeleteAfterDispute.rules.test.ts"
 */

import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc, Timestamp, DocumentData, serverTimestamp } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';

const RULES_PATH = path.resolve(__dirname, '../firestore.rules');
const HOUSE = 'h1';
const OWNER = 'residentUid';
const PEER = 'peerUid';
const MGR = 'mgr';
const OPERATOR = 'operator';
const T0 = Timestamp.fromDate(new Date('2026-01-15T10:00:00Z'));

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-no-delete-after-dispute-rules-test',
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

const HISTORY: Record<string, Record<string, unknown>> = {
  disputed: { status: 'disputed', disputedBy: PEER, disputeResolvedBy: PEER, disputeReason: 'r' },
  approved: {
    status: 'resolved',
    disputed: 'successful',
    incomplete: true,
    disputeOutcome: 'incomplete-per-residents',
    disputeResult: 'success',
    disputedBy: PEER,
    disputeResolvedBy: MGR,
    disputeResolvedAt: T0,
  },
  rejected: {
    status: 'resolved',
    disputed: 'rejected',
    incomplete: false,
    disputeResult: 'fail',
    disputedBy: PEER,
    disputeResolvedBy: MGR,
    disputeResolvedAt: T0,
  },
  // Kept the old way: resolved with no outcome fields, but a resolver/time.
  legacyKept: { status: 'resolved', disputeResolvedBy: MGR, disputeResolvedAt: T0 },
  // Restored to active by an admin after a dispute: still has history.
  restored: { status: 'active', disputedBy: PEER, disputeResolvedBy: PEER, disputeReason: 'r' },
};

beforeEach(async () => {
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, 'guests/g1'), { houseId: HOUSE, userId: OWNER });
    await setDoc(doc(db, 'activities/clean'), act());
    for (const [id, fields] of Object.entries(HISTORY)) {
      await setDoc(doc(db, `activities/${id}`), act(fields));
    }
  });
});

afterEach(async () => {
  await env.clearFirestore();
});

const ctx = (uid: string, claims: Record<string, unknown>) => env.authenticatedContext(uid, claims).firestore();
const actors: Record<string, () => ReturnType<typeof ctx>> = {
  owner: () => ctx(OWNER, { guest: { [HOUSE]: true } }),
  peer: () => ctx(PEER, { guest: { [HOUSE]: true } }),
  admin: () => ctx(MGR, { admin: { [HOUSE]: true } }),
  superAdmin: () => ctx(OPERATOR, { superAdmin: { [HOUSE]: true } }),
};
const softDelete: DocumentData = { status: 'deleted', loggedAt: serverTimestamp() };

describe('no deletion once an activity has dispute history', () => {
  for (const actor of Object.keys(actors)) {
    it(`DENIES ${actor} soft-deleting a disputed, approved, rejected, legacy-kept or restored activity`, async () => {
      for (const id of Object.keys(HISTORY)) {
        await assertFails(updateDoc(doc(actors[actor](), `activities/${id}`), softDelete));
      }
    });
  }

  it('DENIES a hard delete of an activity with dispute history, by admin or superAdmin', async () => {
    for (const actor of ['admin', 'superAdmin']) {
      for (const id of Object.keys(HISTORY)) {
        await assertFails(deleteDoc(doc(actors[actor](), `activities/${id}`)));
      }
    }
  });

  it("DENIES an old build's resolveDispute(..., 'delete') on an open dispute", async () => {
    await assertFails(
      updateDoc(doc(actors.admin(), 'activities/disputed'), {
        status: 'deleted',
        disputeResolvedBy: MGR,
        disputeResolvedAt: serverTimestamp(),
        loggedAt: serverTimestamp(),
      }),
    );
  });

  it('still lets the owner soft-delete, and an admin hard-delete, an activity never disputed', async () => {
    await assertSucceeds(updateDoc(doc(actors.owner(), 'activities/clean'), softDelete));
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), 'activities/clean2'), act());
    });
    await assertSucceeds(deleteDoc(doc(actors.admin(), 'activities/clean2')));
  });
});

describe('APPROVE and REJECT record a consistent outcome', () => {
  const approve: DocumentData = {
    status: 'resolved',
    disputed: 'successful',
    incomplete: true,
    disputeOutcome: 'incomplete-per-residents',
    disputeResult: 'success',
    disputeResolvedBy: MGR,
    disputeResolvedAt: serverTimestamp(),
    loggedAt: serverTimestamp(),
  };

  it('accepts APPROVE with disputeOutcome incomplete-per-residents', async () => {
    await assertSucceeds(updateDoc(doc(actors.admin(), 'activities/disputed'), approve));
  });

  it('DENIES an APPROVE missing the outcome, or a REJECT that marks it incomplete', async () => {
    const { disputeOutcome: _o, ...noOutcome } = approve;
    await assertFails(updateDoc(doc(actors.admin(), 'activities/disputed'), noOutcome));
    await assertFails(
      updateDoc(doc(actors.admin(), 'activities/disputed'), {
        ...approve,
        disputed: 'rejected',
        disputeResult: 'fail',
      }),
    );
  });

  it('DENIES a resident creating an activity that carries disputeOutcome', async () => {
    await assertFails(
      setDoc(doc(actors.owner(), 'activities/new'), act({ disputeOutcome: 'incomplete-per-residents' })),
    );
  });
});
