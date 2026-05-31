/**
 * Unit tests for ratifyBylaws Cloud Function.
 *
 * Covers:
 * - Positive: ratifies bylaws and increments version
 * - Negative: duplicate voteId in usedVoteIds array throws already-exists
 * - Negative: voteId matches legacy ratifyingVoteId throws already-exists
 * - Negative: unauthenticated call throws unauthenticated
 * - Negative: non-admin throws permission-denied
 * - Negative: conscience vote not closed throws failed-precondition
 * - Negative: conscience vote result is not 'Yes' throws failed-precondition
 */

// ============================================================
// MOCKS — must come before any imports that load the modules
// ============================================================

jest.mock("firebase-admin", () => ({
  firestore: {
    Timestamp: {
      now: () => ({ toMillis: () => Date.now() }),
      fromDate: (date: Date) => ({ toMillis: () => date.getTime() }),
    },
    FieldValue: {
      serverTimestamp: () => "__SERVER_TIMESTAMP__",
      arrayUnion: (...args: any[]) => ({ __arrayUnion: args }),
      arrayRemove: (...args: any[]) => ({ __arrayRemove: args }),
      increment: (n: number) => ({ __increment: n }),
    },
  },
  apps: ["mock-app"],
  initializeApp: jest.fn(),
}));

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

jest.mock("firebase-functions", () => ({
  https: {
    onCall: (handler: (req: any) => Promise<any>) => handler,
  },
  logger: mockLogger,
}));

jest.mock("firebase-functions/v1/https", () => ({
  HttpsError: class HttpsError extends Error {
    code: string;
    details?: any;
    constructor(code: string, message: string, details?: any) {
      super(message);
      this.code = code;
      this.details = details;
    }
  },
}));

jest.mock("firebase-functions/v2/https", () => ({
  onCall: jest
    .fn()
    .mockImplementation((arg1: unknown, arg2?: unknown) =>
      typeof arg1 === "function" ? arg1 : arg2,
    ),
  HttpsError: class HttpsError extends Error {
    code: string;
    details?: unknown;
    constructor(code: string, message: string, details?: unknown) {
      super(message);
      this.code = code;
      this.details = details;
    }
  },
}));

jest.mock("firebase-functions/logger", () => mockLogger);

// Firestore mock state
let firestoreMockState: {
  collections: Record<string, any>;
  queryResults: Record<string, any[]>;
};

function resetFirestoreState() {
  firestoreMockState = { collections: {}, queryResults: {} };
}

function makeMockDoc(data: any | null, exists = true) {
  return {
    exists: exists && data !== null,
    data: () => (exists && data !== null ? data : undefined),
    id: "mockDocId",
  };
}

function buildFirestoreMock() {
  function buildCollectionRef(collectionPath: string) {
    return {
      doc: (docId?: string) => buildDocRef(collectionPath, docId || "auto-id"),
      where: (_field: string, _op: string, _value: any) =>
        buildQueryRef(collectionPath),
      get: jest.fn().mockImplementation(async () => {
        const results = firestoreMockState.queryResults[collectionPath] || [];
        return {
          empty: results.length === 0,
          size: results.length,
          docs: results.map((r) => ({
            ...makeMockDoc(r.data),
            id: r.id || "doc-id",
            ref: { update: jest.fn().mockResolvedValue(undefined) },
          })),
        };
      }),
    };
  }

  function buildQueryRef(collectionPath: string) {
    return {
      where: (_field: string, _op: string, _value: any) =>
        buildQueryRef(collectionPath),
      limit: (_n: number) => buildQueryRef(collectionPath),
      orderBy: (_field: string, _dir?: string) => buildQueryRef(collectionPath),
      get: jest.fn().mockImplementation(async () => {
        const results = firestoreMockState.queryResults[collectionPath] || [];
        return {
          empty: results.length === 0,
          size: results.length,
          docs: results.map((r) => ({
            ...makeMockDoc(r.data),
            id: r.id || "doc-id",
            ref: { update: jest.fn().mockResolvedValue(undefined) },
          })),
        };
      }),
    };
  }

  function buildDocRef(collectionPath: string, docId: string) {
    const fullPath = `${collectionPath}/${docId}`;
    return {
      id: docId,
      collection: (subCollectionPath: string) =>
        buildCollectionRef(`${collectionPath}/${docId}/${subCollectionPath}`),
      get: jest.fn().mockImplementation(async () => {
        const data =
          firestoreMockState.collections[fullPath] !== undefined
            ? firestoreMockState.collections[fullPath]
            : null;
        return {
          ...makeMockDoc(data, data !== null),
          ref: { update: jest.fn().mockResolvedValue(undefined) },
        };
      }),
      set: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };
  }

  return {
    collection: (collectionPath: string) => buildCollectionRef(collectionPath),
  };
}

let mockDb: ReturnType<typeof buildFirestoreMock>;

jest.mock("../utils/firebase", () => ({
  get db() {
    return mockDb;
  },
  messaging: {
    sendEachForMulticast: jest.fn().mockResolvedValue({ responses: [] }),
  },
}));

// ============================================================
// IMPORTS — after mocks
// ============================================================
import { ratifyBylaws } from "../callable/ratifyBylaws";

// ============================================================
// HELPERS
// ============================================================

function makeCallableRequest(data: any, uid: string | null = "caller-uid") {
  return {
    data,
    auth: uid ? { uid, token: {} } : null,
  };
}

function setDoc(path: string, data: any) {
  firestoreMockState.collections[path] = data;
}

function setQueryResults(
  collectionPath: string,
  results: Array<{ id: string; data: any }>,
) {
  firestoreMockState.queryResults[collectionPath] = results;
}

// ============================================================
// TEST SUITE
// ============================================================

const GROUP_ID = "group-1";
const CALLER_ID = "admin-user";
const VOTE_ID = "vote-abc";

function setupValidState(bylawOverrides: Record<string, any> = {}) {
  // Caller is a group admin
  setDoc(`members/${GROUP_ID}_${CALLER_ID}`, {
    userId: CALLER_ID,
    isAdmin: true,
    roles: ["admin"],
    groupId: GROUP_ID,
  });

  // Group document (needed for subscription guard)
  setDoc(`groups/${GROUP_ID}`, {
    name: "Test Group",
    subscriptionStatus: "active",
  });

  // Conscience vote: closed, result = 'Yes'
  setDoc(`group_conscience_votes/${VOTE_ID}`, {
    groupId: GROUP_ID,
    status: "closed",
    result: { winner: "Yes", counts: { Yes: 5 }, totalVotes: 5 },
  });

  // Bylaw document: draft, version 0, no usedVoteIds
  setDoc(`group_bylaws/${GROUP_ID}`, {
    groupId: GROUP_ID,
    groupName: "Test Group",
    title: "Our Bylaws",
    content: "...",
    version: 0,
    status: "draft",
    usedVoteIds: [],
    ...bylawOverrides,
  });

  // No group members needing FCM (empty query)
  setQueryResults("members", []);
}

beforeEach(() => {
  jest.clearAllMocks();
  resetFirestoreState();
  mockDb = buildFirestoreMock();
});

describe("ratifyBylaws", () => {
  test("positive: ratifies bylaws and returns incremented version", async () => {
    setupValidState();

    const req = makeCallableRequest(
      { groupId: GROUP_ID, voteId: VOTE_ID },
      CALLER_ID,
    );
    const result = await (ratifyBylaws as any)(req);

    expect(result).toEqual({ version: 1 });
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining("Bylaws ratified"),
    );
  });

  test("negative: throws already-exists when voteId is in usedVoteIds array", async () => {
    // usedVoteIds already contains this voteId — simulates the bug fix
    setupValidState({ usedVoteIds: [VOTE_ID] });

    const req = makeCallableRequest(
      { groupId: GROUP_ID, voteId: VOTE_ID },
      CALLER_ID,
    );

    await expect((ratifyBylaws as any)(req)).rejects.toMatchObject({
      code: "already-exists",
    });
  });

  test("negative: throws already-exists when voteId matches legacy ratifyingVoteId", async () => {
    // Legacy documents have ratifyingVoteId but no usedVoteIds array
    setupValidState({ usedVoteIds: undefined, ratifyingVoteId: VOTE_ID });

    const req = makeCallableRequest(
      { groupId: GROUP_ID, voteId: VOTE_ID },
      CALLER_ID,
    );

    await expect((ratifyBylaws as any)(req)).rejects.toMatchObject({
      code: "already-exists",
    });
  });

  test("negative: throws unauthenticated when caller is not authenticated", async () => {
    const req = makeCallableRequest(
      { groupId: GROUP_ID, voteId: VOTE_ID },
      null,
    );

    await expect((ratifyBylaws as any)(req)).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  test("negative: throws permission-denied when caller is not a group member", async () => {
    // Set up conscience vote and bylaws but no member doc for caller
    setDoc(`groups/${GROUP_ID}`, {
      name: "Test Group",
      subscriptionStatus: "active",
    });
    setDoc(`group_conscience_votes/${VOTE_ID}`, {
      groupId: GROUP_ID,
      status: "closed",
      result: { winner: "Yes" },
    });
    setDoc(`group_bylaws/${GROUP_ID}`, {
      groupId: GROUP_ID,
      title: "Our Bylaws",
      version: 0,
      status: "draft",
      usedVoteIds: [],
    });
    // No member doc — caller is not a member

    const req = makeCallableRequest(
      { groupId: GROUP_ID, voteId: VOTE_ID },
      CALLER_ID,
    );

    await expect((ratifyBylaws as any)(req)).rejects.toMatchObject({
      code: "permission-denied",
    });
  });

  test("negative: throws permission-denied when caller is a member but not admin", async () => {
    setDoc(`groups/${GROUP_ID}`, {
      name: "Test Group",
      subscriptionStatus: "active",
    });
    setDoc(`members/${GROUP_ID}_${CALLER_ID}`, {
      userId: CALLER_ID,
      isAdmin: false,
      roles: ["member"],
      groupId: GROUP_ID,
    });
    setDoc(`group_conscience_votes/${VOTE_ID}`, {
      groupId: GROUP_ID,
      status: "closed",
      result: { winner: "Yes" },
    });
    setDoc(`group_bylaws/${GROUP_ID}`, {
      groupId: GROUP_ID,
      title: "Our Bylaws",
      version: 0,
      status: "draft",
      usedVoteIds: [],
    });

    const req = makeCallableRequest(
      { groupId: GROUP_ID, voteId: VOTE_ID },
      CALLER_ID,
    );

    await expect((ratifyBylaws as any)(req)).rejects.toMatchObject({
      code: "permission-denied",
    });
  });

  test("negative: throws failed-precondition when conscience vote is not closed", async () => {
    setDoc(`groups/${GROUP_ID}`, {
      name: "Test Group",
      subscriptionStatus: "active",
    });
    setDoc(`members/${GROUP_ID}_${CALLER_ID}`, {
      userId: CALLER_ID,
      isAdmin: true,
      roles: ["admin"],
    });
    setDoc(`group_conscience_votes/${VOTE_ID}`, {
      groupId: GROUP_ID,
      status: "open", // Not closed
      result: { winner: "Yes" },
    });
    setDoc(`group_bylaws/${GROUP_ID}`, {
      groupId: GROUP_ID,
      title: "Our Bylaws",
      version: 0,
      status: "draft",
      usedVoteIds: [],
    });

    const req = makeCallableRequest(
      { groupId: GROUP_ID, voteId: VOTE_ID },
      CALLER_ID,
    );

    await expect((ratifyBylaws as any)(req)).rejects.toMatchObject({
      code: "failed-precondition",
    });
  });

  test("negative: throws failed-precondition when vote result is not 'Yes'", async () => {
    setDoc(`groups/${GROUP_ID}`, {
      name: "Test Group",
      subscriptionStatus: "active",
    });
    setDoc(`members/${GROUP_ID}_${CALLER_ID}`, {
      userId: CALLER_ID,
      isAdmin: true,
      roles: ["admin"],
    });
    setDoc(`group_conscience_votes/${VOTE_ID}`, {
      groupId: GROUP_ID,
      status: "closed",
      result: { winner: "No" }, // Vote failed
    });
    setDoc(`group_bylaws/${GROUP_ID}`, {
      groupId: GROUP_ID,
      title: "Our Bylaws",
      version: 0,
      status: "draft",
      usedVoteIds: [],
    });

    const req = makeCallableRequest(
      { groupId: GROUP_ID, voteId: VOTE_ID },
      CALLER_ID,
    );

    await expect((ratifyBylaws as any)(req)).rejects.toMatchObject({
      code: "failed-precondition",
    });
  });
});
