/**
 * Firestore Security Rules Tests — dispute resolution and the peer dispute flow
 *
 * Owner's dispute model: house admins — owners (superAdmin claim), managers
 * and peer leaders (admin claim, granted by promoteGuestsToAdmin) — approve
 * or reject a dispute:
 *   approve -> status resolved, disputed 'successful', incomplete true
 *   reject  -> status resolved, disputed 'rejected',  incomplete false
 * Residents and peers may never set incomplete, disputed or disputeResult,
 * on create or update.
 *
 * Also runs the app's whole peer dispute flow under the rules: the activity
 * update, then the house.disputes mirror (services/dispute.tsx), which no
 * longer writes the guest doc or notifications.
 *
 * Requires the Firestore emulator on port 8080:
 *   cd firebase && firebase emulators:exec --only firestore --project demo-test \
 *     "cd .. && npx jest --config jest.config.rules.js firebase/__tests__/disputeResolution.rules.test.ts"
 */

import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, writeBatch, Timestamp, DocumentData } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ID = 'demo-dispute-resolution-rules-test';
const RULES_PATH = path.resolve(__dirname, '../firestore.rules');

const HOUSE = 'house123';
const OWNER_UID = 'residentUid'; // the resident whose activity it is
const PEER_UID = 'peerUid';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: fs.readFileSync(RULES_PATH, 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

const activity = (overrides: Record<string, unknown> = {}) => ({
  guestId: 'residentGuest',
  houseId: HOUSE,
  type: 'chore',
  status: 'active',
  verified: false,
  loggedBy: OWNER_UID,
  timestamp: Timestamp.fromDate(new Date('2026-01-14T18:00:00Z')),
  data: { type: 'chore', choreName: 'Kitchen' },
  ...overrides,
});

beforeEach(async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'guests/residentGuest'), { houseId: HOUSE, userId: OWNER_UID });
    await setDoc(doc(db, `houses/${HOUSE}`), { name: 'House', disputes: {} });
    await setDoc(doc(db, 'activities/active'), activity());
    await setDoc(
      doc(db, 'activities/disputed'),
      activity({ status: 'disputed', disputedBy: PEER_UID, disputeResolvedBy: PEER_UID }),
    );
  });
});

afterEach(async () => {
  await testEnv.clearFirestore();
});

const ctx = (uid: string, claims: Record<string, unknown>) =>
  testEnv.authenticatedContext(uid, claims);
const resident = () => ctx(OWNER_UID, { guest: { [HOUSE]: true } });
const peer = () => ctx(PEER_UID, { guest: { [HOUSE]: true } });
const manager = () => ctx('managerUid', { admin: { [HOUSE]: true } });
const peerLeader = () =>
  ctx('peerLeaderUid', { guest: { [HOUSE]: true }, admin: { [HOUSE]: true } });
const owner = () => ctx('operatorUid', { superAdmin: { [HOUSE]: true } });
type Ctx = ReturnType<typeof resident>;
const update = (c: Ctx, id: string, data: DocumentData) =>
  updateDoc(doc(c.firestore(), `activities/${id}`), data);

/** What resolveDispute(id, by, outcome) writes. */
const resolution = (outcome: 'approve' | 'reject', by: string): DocumentData => ({
  status: 'resolved',
  disputed: outcome === 'approve' ? 'successful' : 'rejected',
  incomplete: outcome === 'approve',
  disputeResult: outcome === 'approve' ? 'success' : 'fail',
  disputeResolvedBy: by,
  disputeResolvedAt: Timestamp.now(),
  loggedAt: Timestamp.now(),
});

describe('who can resolve a dispute', () => {
  it('a manager (admin claim) can approve', async () => {
    await assertSucceeds(update(manager(), 'disputed', resolution('approve', 'managerUid')));
  });

  it('a peer leader (admin claim) can reject', async () => {
    await assertSucceeds(update(peerLeader(), 'disputed', resolution('reject', 'peerLeaderUid')));
  });

  it('the owner/operator (superAdmin claim) can approve', async () => {
    await assertSucceeds(update(owner(), 'disputed', resolution('approve', 'operatorUid')));
  });

  it('BLOCKS a peer from resolving, whether approving or rejecting', async () => {
    await assertFails(update(peer(), 'disputed', resolution('approve', PEER_UID)));
    await assertFails(update(peer(), 'disputed', resolution('reject', PEER_UID)));
  });

  it('BLOCKS the disputed resident from resolving their own dispute', async () => {
    await assertFails(update(resident(), 'disputed', resolution('reject', OWNER_UID)));
  });

  it('BLOCKS an admin of another house', async () => {
    const other = ctx('otherAdmin', { admin: { house999: true } });
    await assertFails(update(other, 'disputed', resolution('approve', 'otherAdmin')));
  });
});

describe('residents and peers can never set the resolution fields', () => {
  it.each([
    ['incomplete', { incomplete: true }],
    ['incomplete (false)', { incomplete: false }],
    ['disputed', { disputed: 'rejected' }],
    ['disputeResult', { disputeResult: 'fail' }],
  ])('BLOCKS the logging resident setting %s', async (_label, fields) => {
    await assertFails(update(resident(), 'active', fields));
    await assertFails(update(resident(), 'disputed', fields));
  });

  it('BLOCKS a peer smuggling a resolution field into a dispute', async () => {
    await assertFails(
      update(peer(), 'active', {
        status: 'disputed',
        disputeReason: 'x',
        disputedBy: PEER_UID,
        disputeResolvedBy: PEER_UID,
        incomplete: false,
      }),
    );
  });

  it.each([
    ['incomplete', { incomplete: true }],
    ['disputed', { disputed: 'rejected' }],
    ['disputeResult', { disputeResult: 'fail' }],
  ])('BLOCKS a resident creating an activity with %s', async (_label, fields) => {
    await assertFails(setDoc(doc(resident().firestore(), 'activities/new'), activity(fields)));
  });

  it('still lets a resident create a plain activity', async () => {
    await assertSucceeds(setDoc(doc(resident().firestore(), 'activities/new'), activity()));
  });
});

describe("the app's peer dispute flow, end to end under the rules", () => {
  it('peer disputes the activity, then mirrors it into house.disputes', async () => {
    const db = peer().firestore();
    // 1. services/activity.ts disputeActivity
    await assertSucceeds(
      updateDoc(doc(db, 'activities/active'), {
        status: 'disputed',
        disputeReason: 'Kitchen was not cleaned',
        disputedBy: PEER_UID,
        disputeResolvedBy: PEER_UID,
        loggedAt: Timestamp.now(),
      }),
    );
    // 2. services/dispute.tsx updateDispute(house): one house update, nothing else
    const batch = writeBatch(db);
    batch.update(doc(db, `houses/${HOUSE}`), {
      id: HOUSE,
      disputes: {
        d1: {
          id: 'd1',
          activityId: 'active',
          guestId: 'residentGuest',
          houseId: HOUSE,
          status: 'pending',
        },
      },
    });
    await assertSucceeds(batch.commit());
  });

  it('the batch the app used to send (guest doc + notification) was denied for a peer', async () => {
    const db = peer().firestore();
    const batch = writeBatch(db);
    batch.update(doc(db, `houses/${HOUSE}`), { disputes: {} });
    batch.update(doc(db, 'guests/residentGuest'), { houseId: HOUSE, userId: OWNER_UID });
    batch.set(doc(db, 'notifications/n1'), { userId: OWNER_UID, type: 'dispute' });
    await assertFails(batch.commit());
  });

  it('an admin resolves it and archives the house entry', async () => {
    await assertSucceeds(update(manager(), 'disputed', resolution('approve', 'managerUid')));
    const db = manager().firestore();
    const batch = writeBatch(db);
    batch.update(doc(db, `houses/${HOUSE}`), { disputes: {} });
    batch.set(doc(db, 'disputes/d1'), {
      id: 'd1',
      houseId: HOUSE,
      guestId: 'residentGuest',
      status: 'resolved',
    });
    await assertSucceeds(batch.commit());
  });
});
