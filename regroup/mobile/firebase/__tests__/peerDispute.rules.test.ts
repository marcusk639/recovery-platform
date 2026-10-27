/**
 * Firestore Security Rules Tests — peer disputes on activities/{activityId}
 *
 * Disputes exist so residents can challenge OTHER residents' logged
 * activities (the ActivityScreen shows the DISPUTE button to every house
 * member). Before this, only an admin or the activity's own logger could
 * update an activity, so a peer dispute was always denied.
 *
 * A peer (a resident of the same house) may update someone else's activity
 * ONLY to dispute it: active -> disputed, writing exactly what
 * disputeActivity() writes, and naming themselves as the disputer. Verified
 * activities stay disputable, because the app's DISPUTE button does not
 * check `verified`.
 *
 * Requires the Firestore emulator on port 8080:
 *   cd firebase && firebase emulators:exec --only firestore --project demo-test \
 *     "cd .. && npx jest --config jest.config.rules.js firebase/__tests__/peerDispute.rules.test.ts"
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

const PROJECT_ID = 'demo-peer-dispute-rules-test';
const RULES_PATH = path.resolve(__dirname, '../firestore.rules');

const HOUSE = 'house123';
const OTHER_HOUSE = 'house999';
const OWNER_UID = 'ownerUid';
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
  guestId: 'ownerGuest',
  houseId: HOUSE,
  type: 'chore',
  status: 'active',
  verified: false,
  loggedBy: OWNER_UID,
  // Stamped by the onActivityWritten Cloud Function from guests.userId.
  residentUid: OWNER_UID,
  timestamp: Timestamp.fromDate(new Date('2026-01-14T18:00:00Z')),
  data: { type: 'chore', choreName: 'Kitchen' },
  ...overrides,
});

beforeEach(async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'activities/a1'), activity());
    await setDoc(
      doc(db, 'activities/verified'),
      activity({ verified: true, verifiedBy: 'adminUid' }),
    );
    await setDoc(doc(db, 'activities/disputed'), activity({ status: 'disputed' }));
    await setDoc(doc(db, 'activities/deleted'), activity({ status: 'deleted' }));
    await setDoc(doc(db, 'activities/elsewhere'), activity({ houseId: OTHER_HOUSE }));
  });
});

afterEach(async () => {
  await testEnv.clearFirestore();
});

const peer = () => testEnv.authenticatedContext(PEER_UID, { guest: { [HOUSE]: true } });
const update = (ctx: ReturnType<typeof peer>, id: string, data: DocumentData) =>
  updateDoc(doc(ctx.firestore(), `activities/${id}`), data);

/** Exactly what disputeActivity(id, reason, PEER_UID) writes. */
const dispute = (by = PEER_UID): DocumentData => ({
  status: 'disputed',
  disputeReason: 'Kitchen was not cleaned',
  disputedBy: by,
  disputeResolvedBy: by,
  loggedAt: serverTimestamp(),
});

describe('peer disputes', () => {
  it("lets a resident of the same house dispute another resident's active activity", async () => {
    await assertSucceeds(update(peer(), 'a1', dispute()));
  });

  it('accepts the payload of app builds that predate disputedBy', async () => {
    const { disputedBy: _omit, ...legacy } = dispute();
    await assertSucceeds(update(peer(), 'a1', legacy));
  });

  it('lets a peer dispute a verified activity (the app offers DISPUTE on it)', async () => {
    await assertSucceeds(update(peer(), 'verified', dispute()));
  });

  it('BLOCKS a peer naming someone else as the disputer', async () => {
    await assertFails(update(peer(), 'a1', dispute('someoneElse')));
    await assertFails(update(peer(), 'a1', { ...dispute(), disputeResolvedBy: 'someoneElse' }));
  });

  it('BLOCKS a peer changing any other field, alone or alongside a dispute', async () => {
    await assertFails(update(peer(), 'a1', { ...dispute(), data: { choreName: 'Nothing' } }));
    await assertFails(update(peer(), 'a1', { ...dispute(), type: 'meeting' }));
    await assertFails(
      update(peer(), 'a1', { ...dispute(), verified: false, verifiedBy: PEER_UID }),
    );
    await assertFails(update(peer(), 'a1', { disputeReason: 'just a note' }));
  });

  it("BLOCKS a peer reactivating, deleting or resolving someone else's activity", async () => {
    await assertFails(update(peer(), 'disputed', { status: 'active' }));
    await assertFails(update(peer(), 'disputed', { status: 'resolved' }));
    await assertFails(update(peer(), 'a1', { status: 'deleted', loggedAt: serverTimestamp() }));
    await assertFails(update(peer(), 'deleted', dispute()));
  });

  it('BLOCKS re-disputing an already disputed activity', async () => {
    await assertFails(update(peer(), 'disputed', dispute()));
  });

  it('BLOCKS a peer disputing an activity in another house', async () => {
    await assertFails(update(peer(), 'elsewhere', dispute()));
  });

  it('BLOCKS an outsider (no role in the house, or signed out) from disputing', async () => {
    const outsider = testEnv.authenticatedContext('outsiderUid', {
      guest: { [OTHER_HOUSE]: true },
    });
    await assertFails(update(outsider, 'a1', dispute('outsiderUid')));
    const noRole = testEnv.authenticatedContext('noRoleUid', {});
    await assertFails(update(noRole, 'a1', dispute('noRoleUid')));
    const anon = testEnv.unauthenticatedContext();
    await assertFails(updateDoc(doc(anon.firestore(), 'activities/a1'), dispute('x')));
  });

  it('BLOCKS the owner deleting their activity after a peer disputed it (owner rule)', async () => {
    await assertSucceeds(update(peer(), 'a1', dispute()));
    const owner = testEnv.authenticatedContext(OWNER_UID, { guest: { [HOUSE]: true } });
    await assertFails(update(owner, 'a1', { status: 'deleted', loggedAt: serverTimestamp() }));
    await assertFails(update(owner, 'a1', { disputedBy: 'someoneElse' }));
  });

  it('lets the owner delete, but never dispute, their own activity (owner rule)', async () => {
    const owner = testEnv.authenticatedContext(OWNER_UID, { guest: { [HOUSE]: true } });
    await assertFails(update(owner, 'a1', dispute(OWNER_UID)));
    await assertSucceeds(update(owner, 'a1', { status: 'deleted', loggedAt: serverTimestamp() }));
  });
});
