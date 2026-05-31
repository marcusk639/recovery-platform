/**
 * Unit tests for Admin Removal Voting Cloud Functions.
 *
 * Mocks:
 * - firebase-admin (Firestore, Timestamp, FieldValue)
 * - ../utils/firebase (db, messaging)
 * - firebase-functions (logger, https.onCall wrapper)
 */

// ============================================================
// MOCKS — must come before any imports that load the modules
// ============================================================

// Mock firebase-admin
const mockTimestampNow = jest.fn(() => ({ toMillis: () => Date.now() }));
const mockTimestampFromDate = jest.fn((date: Date) => ({
  toMillis: () => date.getTime(),
}));

jest.mock("firebase-admin", () => ({
  firestore: {
    Timestamp: {
      now: () => mockTimestampNow(),
      fromDate: (date: Date) => mockTimestampFromDate(date),
    },
    FieldValue: {
      serverTimestamp: () => "__SERVER_TIMESTAMP__",
      arrayRemove: (...args: any[]) => ({ __arrayRemove: args }),
      increment: (n: number) => ({ __increment: n }),
    },
  },
  apps: ["mock-app"],
  initializeApp: jest.fn(),
}));

// Mock firebase-functions
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// The callable handler will be captured from the onCall mock
let capturedInitiateHandler: ((req: any) => Promise<any>) | null = null;
let capturedVoteHandler: ((req: any) => Promise<any>) | null = null;
let capturedResponseHandler: ((req: any) => Promise<any>) | null = null;
let capturedExpiryHandler: (() => Promise<any>) | null = null;

jest.mock("firebase-functions", () => ({
  https: {
    onCall: (handler: (req: any) => Promise<any>) => handler, // just return the handler
  },
  logger: mockLogger,
}));

jest.mock("firebase-functions/v1", () => ({
  pubsub: {
    schedule: () => ({
      timeZone: () => ({
        onRun: (handler: () => Promise<any>) => {
          capturedExpiryHandler = handler;
          return handler;
        },
      }),
    }),
  },
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

// Helper to build Firestore document mocks
function makeMockDoc(data: any | null, exists = true) {
  return {
    exists: exists && data !== null,
    data: () => (exists && data !== null ? data : undefined),
    ref: {
      update: jest.fn().mockResolvedValue(undefined),
    },
    id: "mockDocId",
  };
}

// Firestore mock state — configured per test
let firestoreMockState: {
  collections: Record<string, Record<string, any>>;
  queryResults: Record<string, any[]>;
  batchUpdates: Array<{ ref: any; data: any }>;
};

function resetFirestoreState() {
  firestoreMockState = {
    collections: {},
    queryResults: {},
    batchUpdates: [],
  };
}

// Build a chainable Firestore mock
function buildFirestoreMock() {
  const mockBatch = {
    update: jest.fn().mockImplementation((ref, data) => {
      firestoreMockState.batchUpdates.push({ ref, data });
      return mockBatch;
    }),
    commit: jest.fn().mockResolvedValue(undefined),
  };

  function buildCollectionRef(collectionPath: string) {
    return {
      doc: (docId?: string) => buildDocRef(collectionPath, docId || "auto-id"),
      where: (_field: string, _op: string, _value: any) =>
        buildQueryRef(collectionPath),
      add: jest.fn().mockResolvedValue({ id: "new-doc-id" }),
      // Allow direct .get() on a collection (fetches all docs from queryResults)
      get: jest.fn().mockImplementation(async () => {
        const results = firestoreMockState.queryResults[collectionPath] || [];
        return {
          empty: results.length === 0,
          size: results.length,
          docs: results.map((r) => ({
            ...makeMockDoc(r.data),
            id: r.id || "doc-id",
            ref: {
              update: jest.fn().mockResolvedValue(undefined),
            },
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
            ref: {
              update: jest.fn().mockResolvedValue(undefined),
            },
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
          ref: {
            update: jest.fn().mockResolvedValue(undefined),
          },
        };
      }),
      set: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };
  }

  return {
    collection: (collectionPath: string) => buildCollectionRef(collectionPath),
    batch: () => mockBatch,
    _mockBatch: mockBatch,
    runTransaction: jest.fn().mockImplementation(async (fn: Function) => {
      const mockTx = {
        get: jest.fn().mockImplementation(async (ref: any) => ref.get()),
        set: jest.fn().mockResolvedValue(undefined),
        update: jest.fn().mockResolvedValue(undefined),
      };
      return fn(mockTx);
    }),
  };
}

// db mock singleton
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
import { HttpsError } from "firebase-functions/v1/https";

// We import the exported handlers directly (they're plain functions since
// our mock of firebase-functions.https.onCall just passes through the handler)
import { initiateAdminRemoval } from "../callable/initiateAdminRemoval";
import { voteOnAdminRemoval } from "../callable/voteOnAdminRemoval";
import { scheduledAdminRemovalExpiry } from "../triggers/pubsub/scheduledAdminRemovalExpiry";

// ============================================================
// HELPERS
// ============================================================

function makeCallableRequest(data: any, uid: string | null = "caller-uid") {
  return {
    data,
    auth: uid ? { uid, token: {} } : null,
  };
}

// Pre-populate a Firestore document
function setDoc(path: string, data: any) {
  firestoreMockState.collections[path] = data;
}

// Pre-populate query results for a collection
function setQueryResults(
  collectionPath: string,
  results: Array<{ id: string; data: any }>,
) {
  firestoreMockState.queryResults[collectionPath] = results;
}

// ============================================================
// TEST SUITES
// ============================================================

beforeEach(() => {
  jest.clearAllMocks();
  resetFirestoreState();
  mockDb = buildFirestoreMock();
});

// -------------------------------------------------------
// initiateAdminRemoval
// -------------------------------------------------------
describe("initiateAdminRemoval", () => {
  const GROUP_ID = "group-1";
  const TARGET_ADMIN_ID = "admin-user";
  const CALLER_ID = "member-user";

  function setupValidState() {
    // Caller is a group member
    setDoc(`members/${GROUP_ID}_${CALLER_ID}`, {
      userId: CALLER_ID,
      displayName: "Test Member",
      groupId: GROUP_ID,
    });

    // Group exists with target as admin
    setDoc(`groups/${GROUP_ID}`, {
      admins: [TARGET_ADMIN_ID],
      name: "Test Group",
      memberCount: 10,
      subscriptionStatus: "active",
    });

    // No existing pending request
    setQueryResults("admin_removal_requests", []);
  }

  test("positive: creates a removal request when caller is member and target is admin", async () => {
    setupValidState();

    const req = makeCallableRequest(
      {
        groupId: GROUP_ID,
        targetAdminId: TARGET_ADMIN_ID,
        targetAdminName: "Admin User",
        reason: "Inactive for 3 months",
      },
      CALLER_ID,
    );

    const result = await (initiateAdminRemoval as any)(req);

    expect(result).toHaveProperty("requestId");
    expect(typeof result.requestId).toBe("string");
    expect(mockLogger.info).toHaveBeenCalled();
  });

  test("negative: throws permission-denied when caller is not a group member", async () => {
    // Group exists
    setDoc(`groups/${GROUP_ID}`, {
      admins: [TARGET_ADMIN_ID],
      name: "Test Group",
      memberCount: 10,
    });
    // No member doc for caller
    // (not set → will be null → doc.exists = false)

    const req = makeCallableRequest(
      {
        groupId: GROUP_ID,
        targetAdminId: TARGET_ADMIN_ID,
        targetAdminName: "Admin User",
        reason: "Inactive",
      },
      CALLER_ID,
    );

    await expect((initiateAdminRemoval as any)(req)).rejects.toMatchObject({
      code: "permission-denied",
    });
  });

  test("negative: throws already-exists when a pending request already exists for this admin", async () => {
    setupValidState();

    // Override: pending request already exists
    setQueryResults("admin_removal_requests", [
      {
        id: "existing-request",
        data: {
          groupId: GROUP_ID,
          targetAdminId: TARGET_ADMIN_ID,
          status: "pending",
        },
      },
    ]);

    const req = makeCallableRequest(
      {
        groupId: GROUP_ID,
        targetAdminId: TARGET_ADMIN_ID,
        targetAdminName: "Admin User",
        reason: "Inactive",
      },
      CALLER_ID,
    );

    await expect((initiateAdminRemoval as any)(req)).rejects.toMatchObject({
      code: "already-exists",
    });
  });

  test("negative: throws unauthenticated when no auth context", async () => {
    const req = makeCallableRequest(
      {
        groupId: GROUP_ID,
        targetAdminId: TARGET_ADMIN_ID,
        targetAdminName: "Admin User",
        reason: "Inactive",
      },
      null, // no auth
    );

    await expect((initiateAdminRemoval as any)(req)).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });
});

// -------------------------------------------------------
// voteOnAdminRemoval
// -------------------------------------------------------
describe("voteOnAdminRemoval", () => {
  const REQUEST_ID = "request-1";
  const GROUP_ID = "group-1";
  const TARGET_ADMIN_ID = "admin-user";
  const VOTER_ID = "voter-user";

  const futureTimestamp = {
    toMillis: () => Date.now() + 7 * 24 * 60 * 60 * 1000,
  };

  function setupPendingRequest(overrides: Partial<any> = {}) {
    setDoc(`admin_removal_requests/${REQUEST_ID}`, {
      groupId: GROUP_ID,
      targetAdminId: TARGET_ADMIN_ID,
      status: "pending",
      expiresAt: futureTimestamp,
      totalEligibleVoters: 9,
      votesFor: 0,
      votesAgainst: 0,
      votesAbstain: 0,
      ...overrides,
    });

    // Voter is a group member
    setDoc(`members/${GROUP_ID}_${VOTER_ID}`, {
      userId: VOTER_ID,
      displayName: "Voter User",
      groupId: GROUP_ID,
    });

    // No existing vote by voter — voteRef.get() returns doc with exists=false
    // (path not set → null → exists=false — handled by buildDocRef)

    // Votes collection: zero existing votes for tally recalculation
    setQueryResults(`admin_removal_requests/${REQUEST_ID}/votes`, []);
  }

  test("positive: records a vote and updates tallies correctly", async () => {
    setupPendingRequest();

    const req = makeCallableRequest(
      { requestId: REQUEST_ID, vote: "yes" },
      VOTER_ID,
    );

    const result = await (voteOnAdminRemoval as any)(req);

    expect(result.success).toBe(true);
    expect(result.message).toBe("Vote recorded successfully.");
    expect(mockLogger.info).toHaveBeenCalled();
  });

  test("positive: marks request approved when votesFor >= 2/3 threshold and removes admin", async () => {
    // totalEligibleVoters = 3, threshold = ceil(3 * 2/3) = 2
    // We'll simulate that after this vote, there are already 2 yes votes
    setupPendingRequest({ totalEligibleVoters: 3 });

    // Simulate 2 existing "yes" votes in votes subcollection
    setQueryResults(`admin_removal_requests/${REQUEST_ID}/votes`, [
      { id: "user-a", data: { vote: "yes" } },
      { id: "user-b", data: { vote: "yes" } },
    ]);

    // Group doc needed for removeAdmin batch
    setDoc(`groups/${GROUP_ID}`, {
      admins: [TARGET_ADMIN_ID],
      adminUids: [TARGET_ADMIN_ID],
    });
    setDoc(`members/${GROUP_ID}_${TARGET_ADMIN_ID}`, {
      isAdmin: true,
      userId: TARGET_ADMIN_ID,
    });

    const req = makeCallableRequest(
      { requestId: REQUEST_ID, vote: "yes" },
      VOTER_ID,
    );

    const result = await (voteOnAdminRemoval as any)(req);

    expect(result.success).toBe(true);
    // Should have logged admin removal
    const logCalls = mockLogger.info.mock.calls.map((c: any[]) => c[0]);
    const removalLogged = logCalls.some(
      (msg: string) => msg && msg.includes("removed from group"),
    );
    expect(removalLogged).toBe(true);
  });

  test("negative: throws permission-denied when target admin tries to vote on their own removal", async () => {
    setupPendingRequest();

    // The target admin tries to vote
    const req = makeCallableRequest(
      { requestId: REQUEST_ID, vote: "no" },
      TARGET_ADMIN_ID, // same as targetAdminId in request
    );

    await expect((voteOnAdminRemoval as any)(req)).rejects.toMatchObject({
      code: "permission-denied",
    });
  });

  test("negative: throws failed-precondition when vote is already closed (status != pending)", async () => {
    setupPendingRequest({ status: "approved" }); // already closed

    const req = makeCallableRequest(
      { requestId: REQUEST_ID, vote: "yes" },
      VOTER_ID,
    );

    await expect((voteOnAdminRemoval as any)(req)).rejects.toMatchObject({
      code: "failed-precondition",
    });
  });

  test("negative: throws unauthenticated when no auth", async () => {
    const req = makeCallableRequest(
      { requestId: REQUEST_ID, vote: "yes" },
      null,
    );

    await expect((voteOnAdminRemoval as any)(req)).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  test("negative: throws not-found when request does not exist", async () => {
    // Don't set any doc → will be null → exists=false
    const req = makeCallableRequest(
      { requestId: "nonexistent", vote: "yes" },
      VOTER_ID,
    );

    await expect((voteOnAdminRemoval as any)(req)).rejects.toMatchObject({
      code: "not-found",
    });
  });
});

// -------------------------------------------------------
// scheduledAdminRemovalExpiry
// -------------------------------------------------------
describe("scheduledAdminRemovalExpiry", () => {
  test("positive: marks expired pending requests as expired", async () => {
    // Simulate 2 expired requests returned by query
    setQueryResults("admin_removal_requests", [
      {
        id: "expired-req-1",
        data: {
          status: "pending",
          expiresAt: { toMillis: () => Date.now() - 1000 },
        },
      },
      {
        id: "expired-req-2",
        data: {
          status: "pending",
          expiresAt: { toMillis: () => Date.now() - 2000 },
        },
      },
    ]);

    await (scheduledAdminRemovalExpiry as any)();

    // The batch should have been used to update docs
    const batchMock = (mockDb as any)._mockBatch;
    expect(batchMock.update).toHaveBeenCalledTimes(2);
    expect(batchMock.commit).toHaveBeenCalledTimes(1);

    // Check that the updates set status to 'expired'
    const updateCalls = batchMock.update.mock.calls;
    updateCalls.forEach(([_ref, data]: [any, any]) => {
      expect(data.status).toBe("expired");
      expect(data.resolvedAt).toBe("__SERVER_TIMESTAMP__");
    });

    const logCalls = mockLogger.info.mock.calls.map((c: any[]) => c[0]);
    const markedLogged = logCalls.some(
      (msg: string) =>
        msg && msg.includes("2 admin removal request(s) as expired"),
    );
    expect(markedLogged).toBe(true);
  });

  test("negative: does not affect requests that have not expired", async () => {
    // No expired requests
    setQueryResults("admin_removal_requests", []);

    await (scheduledAdminRemovalExpiry as any)();

    const batchMock = (mockDb as any)._mockBatch;
    expect(batchMock.update).not.toHaveBeenCalled();
    expect(batchMock.commit).not.toHaveBeenCalled();

    const logCalls = mockLogger.info.mock.calls.map((c: any[]) => c[0]);
    const noneLogged = logCalls.some(
      (msg: string) =>
        msg && msg.includes("No expired admin removal requests found"),
    );
    expect(noneLogged).toBe(true);
  });
});
