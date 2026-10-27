/**
 * Firestore Security Rules Tests — activities/{activityId} identity fields
 *
 * Activities feed the server-computed week-summaries (phase compliance) and
 * the court compliance export. The old rules let any signed-in user create an
 * activity for any guestId/houseId with any status, and let the logging user
 * later change guestId, houseId, status and timestamp. That allowed:
 *   (A) logging activities that count toward someone else's week;
 *   (B) claiming another house for an activity;
 *   (C) reactivating one's own disputed activity, or moving it to another week.
 * The onActivityWritten trigger also refuses to count such activities; these
 * tests pin the rules side.
 *
 * Requires the Firestore emulator on port 8080:
 *   cd firebase && firebase emulators:exec --only firestore --project demo-test \
 *     "cd .. && npx jest --config jest.config.rules.js firebase/__tests__/activityIntegrity.rules.test.ts"
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

const PROJECT_ID = 'demo-activity-integrity-rules-test';
const RULES_PATH = path.resolve(__dirname, '../firestore.rules');

const HOUSE = 'house123';
const OTHER_HOUSE = 'house999';
const RESIDENT_UID = 'residentUid';
const ROOMMATE_UID = 'roommateUid';
const ADMIN_UID = 'adminUid';
const GUEST_ID = 'guestDoc1'; // guest doc ids are not auth uids
const ROOMMATE_GUEST_ID = 'guestDoc2';

const WHEN = Timestamp.fromDate(new Date('2026-01-14T18:00:00Z'));

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

beforeEach(async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `guests/${GUEST_ID}`), { houseId: HOUSE, userId: RESIDENT_UID });
    await setDoc(doc(db, `guests/${ROOMMATE_GUEST_ID}`), { houseId: HOUSE, userId: ROOMMATE_UID });
    await setDoc(doc(db, 'activities/disputed'), activity({ status: 'disputed' }));
    await setDoc(doc(db, 'activities/mine'), activity());
  });
});

afterEach(async () => {
  await testEnv.clearFirestore();
});

/** An activity as logActivity() writes it for the resident. */
function activity(overrides: Record<string, unknown> = {}) {
  return {
    guestId: GUEST_ID,
    houseId: HOUSE,
    type: 'chore',
    status: 'active',
    verified: false,
    loggedBy: RESIDENT_UID,
    timestamp: WHEN,
    data: { type: 'chore', choreType: 'daily', choreName: 'Kitchen' },
    ...overrides,
  };
}

const resident = () => testEnv.authenticatedContext(RESIDENT_UID, { guest: { [HOUSE]: true } });
const roommate = () => testEnv.authenticatedContext(ROOMMATE_UID, { guest: { [HOUSE]: true } });
const houseAdmin = () => testEnv.authenticatedContext(ADMIN_UID, { admin: { [HOUSE]: true } });
const otherAdmin = () =>
  testEnv.authenticatedContext('otherAdmin', { admin: { [OTHER_HOUSE]: true } });
type Ctx = ReturnType<typeof resident>;
const create = (ctx: Ctx, data: Record<string, unknown>) =>
  setDoc(doc(ctx.firestore(), 'activities/new'), data);
const update = (ctx: Ctx, id: string, data: DocumentData) =>
  updateDoc(doc(ctx.firestore(), `activities/${id}`), data);

describe('activities create', () => {
  it('lets a resident log their own activity', async () => {
    await assertSucceeds(create(resident(), activity()));
  });

  it('(A) BLOCKS a resident logging an activity for another guest', async () => {
    await assertFails(create(roommate(), activity({ loggedBy: ROOMMATE_UID })));
  });

  it('(A) BLOCKS logging with someone else as loggedBy', async () => {
    await assertFails(create(roommate(), activity({ guestId: ROOMMATE_GUEST_ID })));
  });

  it("(B) BLOCKS an activity whose houseId is not the guest's house", async () => {
    const ctx = testEnv.authenticatedContext(RESIDENT_UID, {
      guest: { [HOUSE]: true, [OTHER_HOUSE]: true },
    });
    await assertFails(create(ctx, activity({ houseId: OTHER_HOUSE })));
  });

  it('BLOCKS a resident creating a non-active or pre-verified activity', async () => {
    await assertFails(create(resident(), activity({ status: 'resolved' })));
    await assertFails(create(resident(), activity({ verified: true })));
  });

  it('BLOCKS a signed-in user with no role in the house', async () => {
    const stranger = testEnv.authenticatedContext(RESIDENT_UID, {});
    await assertFails(create(stranger, activity()));
  });

  it("lets a house admin log on a resident's behalf", async () => {
    await assertSucceeds(create(houseAdmin(), activity({ loggedBy: ADMIN_UID })));
  });

  it('BLOCKS an admin of another house logging for this guest', async () => {
    await assertFails(create(otherAdmin(), activity({ loggedBy: 'otherAdmin' })));
    await assertFails(
      create(otherAdmin(), activity({ loggedBy: 'otherAdmin', houseId: OTHER_HOUSE })),
    );
  });

  it('BLOCKS an activity for a guest doc that does not exist', async () => {
    await assertFails(create(houseAdmin(), activity({ guestId: 'ghost', loggedBy: ADMIN_UID })));
  });
});

describe('activities update by the logging resident', () => {
  it('no longer allows editing the activity details (no resident UI edits them)', async () => {
    await assertFails(
      update(resident(), 'mine', { data: { type: 'chore', choreName: 'Bathroom' } }),
    );
  });

  it('BLOCKS changing data or type on a verified activity (it would stay verified)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), 'activities/verified'),
        activity({ type: 'work', data: { hoursWorked: 2 }, verified: true, verifiedBy: ADMIN_UID }),
      );
    });
    await assertFails(update(resident(), 'verified', { data: { hoursWorked: 40 } }));
    await assertFails(update(resident(), 'verified', { type: 'meeting' }));
  });

  it('allows exactly the fields disputeActivity and deleteActivity write', async () => {
    await assertSucceeds(
      update(resident(), 'mine', {
        status: 'disputed',
        disputeReason: 'Not done',
        disputeResolvedBy: RESIDENT_UID,
        loggedAt: Timestamp.now(),
      }),
    );
    await assertSucceeds(update(resident(), 'mine', { status: 'deleted', loggedAt: Timestamp.now() }));
  });

  it('allows disputing or deleting their own activity (only lowers counts)', async () => {
    await assertSucceeds(update(resident(), 'mine', { status: 'disputed', disputeReason: 'x' }));
    await assertSucceeds(update(resident(), 'mine', { status: 'deleted' }));
  });

  it('(C) BLOCKS reactivating their own disputed activity', async () => {
    await assertFails(update(resident(), 'disputed', { status: 'active' }));
    await assertFails(update(resident(), 'disputed', { status: 'resolved' }));
  });

  it('(C) BLOCKS moving the activity to another week', async () => {
    const later = Timestamp.fromDate(new Date('2026-01-21T18:00:00Z'));
    await assertFails(update(resident(), 'mine', { timestamp: later }));
  });

  it('BLOCKS changing guestId, houseId or loggedBy', async () => {
    await assertFails(update(resident(), 'mine', { guestId: ROOMMATE_GUEST_ID }));
    await assertFails(update(resident(), 'mine', { houseId: OTHER_HOUSE }));
    await assertFails(update(resident(), 'mine', { loggedBy: ADMIN_UID }));
  });
});

describe('activities update by an admin', () => {
  it('can resolve a dispute (reactivate) and correct the timestamp', async () => {
    await assertSucceeds(update(houseAdmin(), 'disputed', { status: 'resolved' }));
    await assertSucceeds(
      update(houseAdmin(), 'mine', {
        timestamp: Timestamp.fromDate(new Date('2026-01-15T18:00:00Z')),
      }),
    );
  });

  it('BLOCKS moving an activity into a house they do not administer', async () => {
    await assertFails(update(houseAdmin(), 'mine', { houseId: OTHER_HOUSE }));
  });
});
