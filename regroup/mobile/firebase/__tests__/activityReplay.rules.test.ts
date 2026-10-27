/**
 * Firestore Security Rules Tests — offline-queue replay sequence
 *
 * logActivity({ docId }) replays a queued activity as: get(activities/{id}) to
 * see whether an earlier attempt already created it, then set() if missing,
 * then a week-summary transaction. These tests pin what the rules allow at
 * each step, because the `read` rule dereferences resource.data and so is
 * denied (not "not found") for a document that does not exist yet.
 *
 * Requires the Firestore emulator on port 8080:
 *   cd firebase && firebase emulators:exec --only firestore --project demo-rats-replay \
 *     "cd .. && npx jest --config jest.config.rules.js --no-coverage --forceExit activityReplay"
 */

import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import * as fs from "fs";
import * as path from "path";

const PROJECT_ID = "demo-rats-replay-rules-test";
const RULES_PATH = path.resolve(__dirname, "../firestore.rules");

const GUEST_UID = "guestUser";
const OTHER_UID = "otherUser";
const ADMIN_UID = "adminUser";
const HOUSE_ID = "house123";
const ACTIVITY_ID = "offline_1_abc";
const SUMMARY_ID = "guestUser_2026-01-12";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: fs.readFileSync(RULES_PATH, "utf8"), host: "127.0.0.1", port: 8080 },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

afterEach(async () => {
  await testEnv.clearFirestore();
});

const guest = (uid = GUEST_UID) =>
  testEnv.authenticatedContext(uid, { guest: { [HOUSE_ID]: true } });
const admin = () => testEnv.authenticatedContext(ADMIN_UID, { admin: { [HOUSE_ID]: true } });

const activity = (loggedBy: string) => ({
  guestId: GUEST_UID,
  houseId: HOUSE_ID,
  type: "meeting",
  loggedBy,
  verified: false,
  status: "active",
  data: { meetingName: "Tuesday AA", duration: 60 },
});

describe("replay of a queued activity (create under a client-chosen id)", () => {
  it("DENIES the existence get() of a missing activity doc for a house guest", async () => {
    await assertFails(getDoc(doc(guest().firestore(), `activities/${ACTIVITY_ID}`)));
  });

  it("then ALLOWS the set() when loggedBy is the signed-in user", async () => {
    const ctx = guest();
    await assertFails(getDoc(doc(ctx.firestore(), `activities/${ACTIVITY_ID}`)));
    await assertSucceeds(
      setDoc(doc(ctx.firestore(), `activities/${ACTIVITY_ID}`), activity(GUEST_UID)),
    );
  });

  it("DENIES a set() whose loggedBy is someone else (the create rule still guards the write)", async () => {
    await assertFails(
      setDoc(doc(guest().firestore(), `activities/${ACTIVITY_ID}`), activity(OTHER_UID)),
    );
  });

  it("ALLOWS the existence get() once the activity exists, so a retry skips the write", async () => {
    const ctx = guest();
    await setDoc(doc(ctx.firestore(), `activities/${ACTIVITY_ID}`), activity(GUEST_UID));
    await assertSucceeds(getDoc(doc(ctx.firestore(), `activities/${ACTIVITY_ID}`)));
  });
});

describe("week-summaries during replay", () => {
  it("DENIES even an admin's read of a missing summary (transaction tx.get)", async () => {
    await assertFails(getDoc(doc(admin().firestore(), `week-summaries/${SUMMARY_ID}`)));
  });

  it("DENIES a resident's write to week-summaries (admin-only)", async () => {
    await assertFails(
      setDoc(doc(guest().firestore(), `week-summaries/${SUMMARY_ID}`), {
        guestId: GUEST_UID,
        houseId: HOUSE_ID,
        activityCount: 1,
      }),
    );
  });

  it("ALLOWS an admin's write to week-summaries", async () => {
    await assertSucceeds(
      setDoc(doc(admin().firestore(), `week-summaries/${SUMMARY_ID}`), {
        guestId: GUEST_UID,
        houseId: HOUSE_ID,
        activityCount: 1,
      }),
    );
  });
});
