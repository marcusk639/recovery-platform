/**
 * Storage Security Rules Tests
 *
 * Run with: npm run test:rules:storage
 * Requires Firebase Storage Emulator running (started automatically by the script).
 */

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import * as fs from "fs";
import * as path from "path";

let testEnv: RulesTestEnvironment;

const groupId = "group1";
const filePath = `groups/${groupId}/resources/handbook.pdf`;

function getAuthenticatedContext(
  uid: string,
  claims: Record<string, any> = {},
) {
  return testEnv.authenticatedContext(uid, claims);
}

function getUnauthenticatedContext() {
  return testEnv.unauthenticatedContext();
}

beforeAll(async () => {
  const rulesPath = path.join(__dirname, "../../../storage.rules");
  const rules = fs.readFileSync(rulesPath, "utf8");

  testEnv = await initializeTestEnvironment({
    projectId: "recovery-connect-test",
    storage: {
      rules,
      host: "localhost",
      port: 9199,
    },
  });

  // Seed test file into storage (bypassing rules for fixture setup)
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.storage().ref(filePath).put(Buffer.from("seed data"));
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe("Group Resources — /groups/{groupId}/resources/{fileName}", () => {
  it("denies read for unauthenticated users", async () => {
    const storage = getUnauthenticatedContext().storage();
    await assertFails(storage.ref(filePath).getDownloadURL());
  });

  it("denies read for an authenticated user who is not a group member", async () => {
    const storage = getAuthenticatedContext("user-outsider", {
      memberGroups: ["some-other-group"],
    }).storage();
    await assertFails(storage.ref(filePath).getDownloadURL());
  });

  it("allows read for an authenticated group member", async () => {
    const storage = getAuthenticatedContext("user-member", {
      memberGroups: [groupId],
    }).storage();
    await assertSucceeds(storage.ref(filePath).getDownloadURL());
  });

  it("allows read for a group admin (also present in memberGroups)", async () => {
    const storage = getAuthenticatedContext("user-admin", {
      memberGroups: [groupId],
      adminGroups: [groupId],
    }).storage();
    await assertSucceeds(storage.ref(filePath).getDownloadURL());
  });

  it("allows read for a super admin who is not a group member", async () => {
    const storage = getAuthenticatedContext("user-super", {
      superAdmin: true,
    }).storage();
    await assertSucceeds(storage.ref(filePath).getDownloadURL());
  });

  it("denies write for a group member who is not an admin", async () => {
    const storage = getAuthenticatedContext("user-member", {
      memberGroups: [groupId],
    }).storage();
    await assertFails(storage.ref(filePath).put(Buffer.from("data")));
  });

  it("allows write for a group admin under the size limit", async () => {
    const storage = getAuthenticatedContext("user-admin", {
      memberGroups: [groupId],
      adminGroups: [groupId],
    }).storage();
    await assertSucceeds(storage.ref(filePath).put(Buffer.from("small file")));
  });
});
