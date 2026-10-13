/**
 * Rules matrix for the per-user meeting-attendance reverse index.
 *
 * Requires the Firestore emulator; run with:
 *   firebase emulators:exec --only firestore "npx jest src/__tests__/meetingAttendance-security-rules.test.ts"
 *
 * The filename must end `security-rules.test.ts` — jest.config.js un-ignores that
 * suffix only when FIRESTORE_EMULATOR_HOST is set, and a bare `npx jest` run would
 * otherwise execute this file with no emulator and break `firebase deploy`'s predeploy.
 */
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import * as fs from "fs";

let testEnv: RulesTestEnvironment;

const PATH = "users/user-a/meetingAttendance/inst-1";

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "homegroups-rules-attendance",
    firestore: {
      rules: fs.readFileSync("../firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

afterAll(async () => {
  if (testEnv) await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx
      .firestore()
      .doc(PATH)
      .set({ instanceId: "inst-1", groupId: "g1" });
  });
});

describe("users/{uid}/meetingAttendance", () => {
  it("lets the owner read their own attendance", async () => {
    const db = testEnv.authenticatedContext("user-a").firestore();
    await assertSucceeds(db.doc(PATH).get());
  });

  it("DENIES another signed-in user reading it", async () => {
    const db = testEnv.authenticatedContext("user-b").firestore();
    await assertFails(db.doc(PATH).get());
  });

  it("DENIES an unauthenticated read", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(db.doc(PATH).get());
  });

  it("DENIES the owner writing their own attendance (server-only)", async () => {
    const db = testEnv.authenticatedContext("user-a").firestore();
    await assertFails(
      db.doc("users/user-a/meetingAttendance/inst-2").set({ instanceId: "inst-2" }),
    );
  });

  it("DENIES the owner deleting an attendance record", async () => {
    const db = testEnv.authenticatedContext("user-a").firestore();
    await assertFails(db.doc(PATH).delete());
  });
});
