/**
 * Tests for exportUserData (GDPR Article 15 export).
 *
 * Regression: previously queried `directMessages` collection (does not exist),
 * `participantIds` field (actual: `participants`), `groups/{gid}/chat`
 * subcollection (actual: `group_chats/{gid}/messages`), and
 * `favoriteMeetingIds` user field (actual: `favoriteMeetings`). These bugs
 * silently caused GDPR exports to omit DMs, group chat, and favorited
 * meetings. This test asserts the correct collection/field names are used.
 *
 * Refs: .audit/doc-code-discrepancies.md D-8
 */

export {};

// ---- Mocks must come before any imports ----

const eudCollectionCalls: string[] = [];
const eudFieldQueryCalls: Array<{ collection: string; field: string }> = [];

// Build a chainable query mock that records its calls so the test can assert
// "we queried `direct_message_threads`, not `directMessages`".
function makeQueryMock(collectionName: string) {
  const queryObj: Record<string, jest.Mock> = {};
  queryObj.where = jest.fn((field: string) => {
    eudFieldQueryCalls.push({ collection: collectionName, field });
    return queryObj;
  });
  queryObj.get = jest.fn().mockResolvedValue({ docs: [], empty: true });
  queryObj.count = jest.fn().mockReturnValue({
    get: jest.fn().mockResolvedValue({ data: () => ({ count: 0 }) }),
  });
  return queryObj;
}

function makeDocMock(collectionName: string) {
  return {
    get: jest.fn().mockResolvedValue({
      exists: false,
      data: () => null,
    }),
    collection: jest.fn((subName: string) =>
      makeQueryMock(`${collectionName}/<id>/${subName}`),
    ),
  };
}

const eudMockCollection = jest.fn((name: string) => {
  eudCollectionCalls.push(name);
  const queryMock = makeQueryMock(name);
  // Augment with .doc() for paths that use it
  (queryMock as unknown as { doc: jest.Mock }).doc = jest.fn(() =>
    makeDocMock(name),
  );
  return queryMock;
});

jest.mock("firebase-admin", () => ({
  apps: [],
  initializeApp: jest.fn(),
  firestore: Object.assign(
    jest.fn().mockReturnValue({ collection: eudMockCollection }),
    { FieldValue: {} },
  ),
  app: jest.fn().mockReturnValue({}),
  auth: jest.fn().mockReturnValue({}),
}));

jest.mock("firebase-functions", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  https: {
    onCall: jest.fn().mockImplementation((handler: Function) => handler),
  },
}));

jest.mock("firebase-functions/v1/https", () => ({
  HttpsError: class HttpsError extends Error {
    constructor(
      public code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));

// v2/https + logger mocks come from functions/jest.setup.ts (shared)

jest.mock("../utils/firebase", () => ({
  db: { collection: eudMockCollection },
}));

// ---- Test ----

import { exportUserData } from "../callable/exportUserData";

describe("exportUserData — collection-name regression", () => {
  beforeEach(() => {
    eudCollectionCalls.length = 0;
    eudFieldQueryCalls.length = 0;
  });

  it("throws unauthenticated when no auth context", async () => {
    await expect(
      (exportUserData as unknown as Function)({ auth: undefined, data: {} }),
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("queries direct_message_threads (not directMessages) with the participants field", async () => {
    await (exportUserData as unknown as Function)({
      auth: { uid: "user-1", token: { email: "u@example.com" } },
      data: {},
    });

    expect(eudCollectionCalls).toContain("direct_message_threads");
    expect(eudCollectionCalls).not.toContain("directMessages");

    const dmFieldQueries = eudFieldQueryCalls.filter(
      (c) => c.collection === "direct_message_threads",
    );
    const fields = dmFieldQueries.map((q) => q.field);
    expect(fields).toContain("participants");
    expect(fields).not.toContain("participantIds");
  });

  it("queries the top-level transactions collection (not a group subcollection)", async () => {
    await (exportUserData as unknown as Function)({
      auth: { uid: "user-1", token: { email: "u@example.com" } },
      data: {},
    });

    expect(eudCollectionCalls).toContain("transactions");
    const txFieldQueries = eudFieldQueryCalls.filter(
      (c) => c.collection === "transactions",
    );
    expect(txFieldQueries.map((q) => q.field)).toContain("createdBy");
  });
});
