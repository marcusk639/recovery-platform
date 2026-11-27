/**
 * houses/{houseId}/applications/{appId}: owners and managers only (owner
 * decision 2026-11-27). A resident application holds the applicant's recovery
 * history and contact details, so a house's peer leaders, who hold the same
 * admin claim as managers, may no longer read or decide them: the read and
 * update rules check the house-roles tier too (callerRank >= 2, as for the
 * house's money). The applicant's own read, the empty-slot read and the
 * create rule are unchanged.
 *
 * Requires the Firestore emulator (FIRESTORE_EMULATOR_HOST, set by
 * `firebase emulators:exec`).
 */
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';

const [HOST, PORT] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
const H = 'house123';
const APPLICANT = 'applicant';
const APP_ID = `${H}_${APPLICANT}`;
const APP_PATH = `houses/${H}/applications/${APP_ID}`;

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'rats-applications-access-rules-test',
    firestore: {
      rules: fs.readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf8'),
      host: HOST,
      port: Number(PORT),
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

const STAFF: Record<string, { record: Record<string, unknown>; claims: Record<string, unknown> }> =
  {
    primaryOwner: {
      record: { houseId: H, tier: 'owner', primary: true },
      claims: { superAdmin: { [H]: true }, admin: { [H]: true } },
    },
    coOwner: { record: { houseId: H, tier: 'owner' }, claims: { superAdmin: { [H]: true }, admin: { [H]: true } } },
    manager: { record: { houseId: H, tier: 'manager' }, claims: { admin: { [H]: true } } },
    peerLeader: { record: { houseId: H, tier: 'peerLeader' }, claims: { admin: { [H]: true } } },
    // An admin claim with no role record: the rules rank it 1, from the claim
    // alone, the same as a peer leader.
    noRecordAdmin: { record: {}, claims: { admin: { [H]: true } } },
    // An owner from before role records: the superAdmin claim alone ranks 3.
    legacyOwner: { record: {}, claims: { superAdmin: { [H]: true } } },
    // A co-owner holding the superAdmin claim but no admin claim.
    superAdminOnlyCoOwner: { record: { houseId: H, tier: 'owner' }, claims: { superAdmin: { [H]: true } } },
  };

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `houses/${H}`), { id: H, superAdminId: 'primaryOwner' });
    for (const [uid, { record }] of Object.entries(STAFF)) {
      if (Object.keys(record).length) await setDoc(doc(db, `house-roles/${H}_${uid}`), record);
    }
    await setDoc(doc(db, APP_PATH), {
      id: APP_ID,
      houseId: H,
      applicantUid: APPLICANT,
      applicantName: 'Alice Applicant',
      applicantEmail: 'alice@example.com',
      status: 'pending',
    });
  });
});

const as = (uid: string) => testEnv.authenticatedContext(uid, STAFF[uid].claims).firestore();

describe('applications — owners and managers only', () => {
  describe.each(['primaryOwner', 'coOwner', 'manager', 'legacyOwner', 'superAdminOnlyCoOwner'])('%s', (uid) => {
    it('may read an application', async () => {
      await assertSucceeds(getDoc(doc(as(uid), APP_PATH)));
    });

    it("may list the house's applications", async () => {
      await assertSucceeds(getDocs(collection(as(uid), `houses/${H}/applications`)));
    });

    it('may decide an application', async () => {
      await assertSucceeds(updateDoc(doc(as(uid), APP_PATH), { status: 'approved' }));
    });
  });

  describe.each(['peerLeader', 'noRecordAdmin'])('%s', (uid) => {
    it('may not read an application', async () => {
      await assertFails(getDoc(doc(as(uid), APP_PATH)));
    });

    it("may not list the house's applications", async () => {
      await assertFails(getDocs(collection(as(uid), `houses/${H}/applications`)));
    });

    it('may not decide an application', async () => {
      await assertFails(updateDoc(doc(as(uid), APP_PATH), { status: 'approved' }));
      await assertFails(updateDoc(doc(as(uid), APP_PATH), { status: 'rejected' }));
    });
  });

  it("a manager of another house may not read this house's application", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `house-roles/other_mgr2`), {
        houseId: 'other',
        tier: 'manager',
      });
    });
    const db = testEnv.authenticatedContext('mgr2', { admin: { other: true } }).firestore();
    await assertFails(getDoc(doc(db, APP_PATH)));
  });

  // The admin claim passes here, so only the tier check refuses: a manager record
  // counts in its own house only.
  it("a manager of another house who is also on this house's staff claim may not read or decide", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `house-roles/other_mgr3`), { houseId: 'other', tier: 'manager' });
    });
    const db = testEnv.authenticatedContext('mgr3', { admin: { [H]: true, other: true } }).firestore();
    await assertFails(getDoc(doc(db, APP_PATH)));
    await assertFails(updateDoc(doc(db, APP_PATH), { status: 'approved' }));
  });

  // The collection-group rule ("Check my application") is a second way to the same
  // documents: it must stay the applicant's own only.
  it('a peer leader may not reach the applications through a collection-group query', async () => {
    const db = as('peerLeader');
    await assertFails(getDocs(query(collectionGroup(db, 'applications'), where('houseId', '==', H))));
    await assertFails(getDocs(query(collectionGroup(db, 'applications'), where('applicantUid', '==', APPLICANT))));
  });
});

describe('applications — the applicant, unchanged', () => {
  const applicant = () => testEnv.authenticatedContext(APPLICANT, {}).firestore();

  it('may read their own application', async () => {
    await assertSucceeds(getDoc(doc(applicant(), APP_PATH)));
  });

  it('may not decide their own application', async () => {
    await assertFails(updateDoc(doc(applicant(), APP_PATH), { status: 'approved' }));
  });

  it('may read their own empty slot in another house, and create the application there', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'houses/house2'), { id: 'house2' });
    });
    const slot = doc(applicant(), `houses/house2/applications/house2_${APPLICANT}`);
    await assertSucceeds(getDoc(slot));
    await assertSucceeds(
      setDoc(slot, {
        id: `house2_${APPLICANT}`,
        houseId: 'house2',
        applicantUid: APPLICANT,
        applicantName: 'Alice Applicant',
        status: 'pending',
      }),
    );
  });

  it("may not read another applicant's slot", async () => {
    await assertFails(getDoc(doc(applicant(), `houses/${H}/applications/${H}_someoneElse`)));
  });
});
