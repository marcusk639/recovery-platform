/**
 * Firestore Security Rules Tests — activities/{activityId} verification fields
 *
 * `verified`/`verifiedBy` feed the Verified column of the court-ready
 * compliance export (functions/src/callable/compliance.ts). The document-level
 * `allow update: if isSameUser(resource.data.loggedBy) || isAdmin(...)` let the
 * resident who logged an activity set verified:true on their own attendance —
 * i.e. the subject of a court compliance report could self-certify it. These
 * tests pin the field-level guard that closes it.
 *
 * Requires the Firebase Firestore emulator running on port 8080.
 *
 * Setup:
 *   cd firebase && firebase emulators:start --only firestore
 *   npx jest firebase/__tests__/activities.rules.test.ts
 */

import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc } from "firebase/firestore";
import * as fs from "fs";
import * as path from "path";

const PROJECT_ID = "rats-activities-rules-test";
const FIRESTORE_HOST = "127.0.0.1";
const FIRESTORE_PORT = 8080;
const RULES_PATH = path.resolve(__dirname, "../firestore.rules");

const ADMIN_UID = "adminUser";
const GUEST_UID = "guestUser";
const OTHER_UID = "otherUser";
const HOUSE_ID = "house123";
const ACTIVITY_ID = "activity_meeting_1";

function authHouseAdmin(_uid: string, houseId: string) {
  return { admin: { [houseId]: true } };
}

function authHouseSuperAdmin(_uid: string, houseId: string) {
  return { superAdmin: { [houseId]: true } };
}

function authHouseGuest(_uid: string, houseId: string) {
  return { guest: { [houseId]: true } };
}

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync(RULES_PATH, "utf8"),
      host: FIRESTORE_HOST,
      port: FIRESTORE_PORT,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

afterEach(async () => {
  await testEnv.clearFirestore();
});

/** Seeds the meeting activity as logActivity() writes it: unverified. */
async function seedActivity() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `activities/${ACTIVITY_ID}`), {
      houseId: HOUSE_ID,
      loggedBy: GUEST_UID,
      type: "meeting",
      verified: false,
      status: "active",
      data: { meetingName: "Tuesday AA", duration: 60 },
    });
  });
}

function activityDoc(ctx: ReturnType<RulesTestEnvironment["authenticatedContext"]>) {
  return doc(ctx.firestore(), `activities/${ACTIVITY_ID}`);
}

describe("activities verification fields", () => {
  beforeEach(seedActivity);

  it("lets the logging resident edit non-verification fields", async () => {
    const ctx = testEnv.authenticatedContext(GUEST_UID, authHouseGuest(GUEST_UID, HOUSE_ID));
    await assertSucceeds(
      updateDoc(activityDoc(ctx), { data: { meetingName: "Tuesday AA", duration: 90 } }),
    );
  });

  it("BLOCKS the logging resident from self-certifying verified", async () => {
    const ctx = testEnv.authenticatedContext(GUEST_UID, authHouseGuest(GUEST_UID, HOUSE_ID));
    await assertFails(updateDoc(activityDoc(ctx), { verified: true }));
  });

  it("BLOCKS the logging resident from writing verifiedBy", async () => {
    const ctx = testEnv.authenticatedContext(GUEST_UID, authHouseGuest(GUEST_UID, HOUSE_ID));
    await assertFails(updateDoc(activityDoc(ctx), { verifiedBy: ADMIN_UID }));
  });

  it("BLOCKS self-certification smuggled alongside a legitimate edit", async () => {
    const ctx = testEnv.authenticatedContext(GUEST_UID, authHouseGuest(GUEST_UID, HOUSE_ID));
    await assertFails(
      updateDoc(activityDoc(ctx), {
        verified: true,
        data: { meetingName: "Tuesday AA", duration: 90 },
      }),
    );
  });

  it("allows a resident write that echoes the same verified value back", async () => {
    const ctx = testEnv.authenticatedContext(GUEST_UID, authHouseGuest(GUEST_UID, HOUSE_ID));
    await assertSucceeds(
      updateDoc(activityDoc(ctx), { verified: false, data: { duration: 45 } }),
    );
  });

  it("lets a house admin verify", async () => {
    const ctx = testEnv.authenticatedContext(ADMIN_UID, authHouseAdmin(ADMIN_UID, HOUSE_ID));
    await assertSucceeds(
      updateDoc(activityDoc(ctx), { verified: true, verifiedBy: ADMIN_UID }),
    );
  });

  it("lets a house superAdmin verify", async () => {
    const ctx = testEnv.authenticatedContext(ADMIN_UID, authHouseSuperAdmin(ADMIN_UID, HOUSE_ID));
    await assertSucceeds(
      updateDoc(activityDoc(ctx), { verified: true, verifiedBy: ADMIN_UID }),
    );
  });

  it("blocks a non-member entirely", async () => {
    const ctx = testEnv.authenticatedContext(OTHER_UID, authHouseGuest(OTHER_UID, "houseOther"));
    await assertFails(updateDoc(activityDoc(ctx), { data: { duration: 90 } }));
  });
});
