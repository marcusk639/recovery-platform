/**
 * Unit tests for V3.2 Member-Driven Growth Cloud Functions:
 *   1. notifyAdminUpgradeRequest  — FCM notification + rate limit
 *   2. joinGroupByInviteCode      — invite analytics (joinCount increment)
 *
 * Mocks follow the same pattern as adminRemoval.test.ts.
 */

// ============================================================
// MOCKS — must come before any imports that load the modules
// ============================================================

const mockSendEachForMulticast = jest.fn();
const mockFieldValueServerTimestamp = jest.fn(() => "__SERVER_TIMESTAMP__");
const mockFieldValueIncrement = jest.fn((n: number) => ({ __increment: n }));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFieldPathDocumentId = jest.fn(() => "__DOCUMENT_ID__");

jest.mock("firebase-admin", () => ({
  firestore: {
    Timestamp: {
      now: () => ({ toMillis: () => Date.now(), toDate: () => new Date() }),
      fromDate: (d: Date) => ({
        toDate: () => d,
        toMillis: () => d.getTime(),
      }),
    },
    FieldValue: {
      serverTimestamp: () => mockFieldValueServerTimestamp(),
      increment: (n: number) => mockFieldValueIncrement(n),
      arrayUnion: (...args: unknown[]) => ({ __arrayUnion: args }),
      arrayRemove: (...args: unknown[]) => ({ __arrayRemove: args }),
    },
    FieldPath: {
      documentId: () => mockFieldPathDocumentId(),
    },
  },
  apps: ["mock-app"],
  initializeApp: jest.fn(),
}));

jest.mock("firebase-admin/messaging", () => ({
  getMessaging: jest.fn(() => ({
    sendEachForMulticast: mockSendEachForMulticast,
  })),
}));

// onCall can be called as:
//   onCall(handler)           — single-arg form (v1 style)
//   onCall(config, handler)   — two-arg form (v2 style with options)
// Our mock returns the handler in both cases.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockOnCall(...args: any[]) {
  if (typeof args[0] === "function") return args[0];
  if (typeof args[1] === "function") return args[1];
  return args[0];
}

jest.mock("firebase-functions", () => ({
  https: {
    onCall: mockOnCall,
  },
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("firebase-functions/v1", () => ({
  https: {
    onCall: mockOnCall,
  },
}));

jest.mock("firebase-functions/v1/https", () => ({
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

jest.mock("firebase-functions/v2/https", () => ({
  onCall: mockOnCall,
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

jest.mock("firebase-functions/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

// ============================================================
// FIRESTORE MOCK INFRASTRUCTURE
// ============================================================

interface FirestoreState {
  // path → document data (null = missing)
  collections: Record<string, Record<string, unknown> | null>;
  // collection path → array of {id, data}
  queryResults: Record<
    string,
    Array<{ id: string; data: Record<string, unknown> }>
  >;
}

let firestoreState: FirestoreState;

function resetState() {
  firestoreState = { collections: {}, queryResults: {} };
}

function setDoc(path: string, data: Record<string, unknown> | null) {
  firestoreState.collections[path] = data;
}

function setQueryResults(
  collectionPath: string,
  results: Array<{ id: string; data: Record<string, unknown> }>,
) {
  firestoreState.queryResults[collectionPath] = results;
}

function makeMockDoc(data: Record<string, unknown> | null) {
  return {
    exists: data !== null,
    data: () => data,
    id: "mock-id",
    ref: {
      update: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
    },
  };
}

function buildCollectionRef(collPath: string) {
  return {
    doc: (docId = "auto-id") => buildDocRef(collPath, docId),
    where: () => buildQueryRef(collPath),
    limit: () => buildQueryRef(collPath),
    add: jest.fn().mockResolvedValue({ id: "new-id" }),
    get: jest.fn().mockImplementation(async () => {
      const docs = firestoreState.queryResults[collPath] || [];
      return {
        empty: docs.length === 0,
        size: docs.length,
        docs: docs.map((d) => ({ ...makeMockDoc(d.data), id: d.id })),
      };
    }),
  };
}

function buildQueryRef(collPath: string) {
  const qr = {
    where: () => qr,
    limit: () => qr,
    in: () => qr,
    get: jest.fn().mockImplementation(async () => {
      const docs = firestoreState.queryResults[collPath] || [];
      return {
        empty: docs.length === 0,
        size: docs.length,
        docs: docs.map((d) => ({ ...makeMockDoc(d.data), id: d.id })),
      };
    }),
  };
  return qr;
}

function buildDocRef(collPath: string, docId: string) {
  const fullPath = `${collPath}/${docId}`;
  const docRef = {
    id: docId,
    collection: (subColl: string) =>
      buildCollectionRef(`${collPath}/${docId}/${subColl}`),
    get: jest.fn().mockImplementation(async () => {
      const data = Object.prototype.hasOwnProperty.call(
        firestoreState.collections,
        fullPath,
      )
        ? firestoreState.collections[fullPath]
        : null;
      return { ...makeMockDoc(data) };
    }),
    set: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  return docRef;
}

const mockBatch = {
  set: jest.fn(),
  update: jest.fn(),
  commit: jest.fn().mockResolvedValue(undefined),
};

function buildFirestoreMock() {
  return {
    collection: (collPath: string) => buildCollectionRef(collPath),
    batch: () => mockBatch,
  };
}

let mockDb: ReturnType<typeof buildFirestoreMock>;

jest.mock("../utils/firebase", () => ({
  get db() {
    return mockDb;
  },
  messaging: {
    sendEachForMulticast: mockSendEachForMulticast,
  },
}));

// ============================================================
// IMPORTS — after mocks
// ============================================================

import { HttpsError } from "firebase-functions/v1/https";
import { notifyAdminUpgradeRequest } from "../callable/notifyAdminUpgradeRequest";
import { joinGroupByInviteCode } from "../callable/joinGroupByInviteCode";

// ============================================================
// HELPERS
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeRequest(
  data: Record<string, unknown>,
  uid: string | null = "user-1",
) {
  return { data, auth: uid ? { uid, token: {} } : null };
}

// ============================================================
// TESTS — notifyAdminUpgradeRequest
// ============================================================

describe("notifyAdminUpgradeRequest", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetState();
    mockDb = buildFirestoreMock();

    mockSendEachForMulticast.mockResolvedValue({
      successCount: 1,
      failureCount: 0,
      responses: [{ success: true }],
    });
  });

  it("sends FCM notification to group admin(s) when member makes a request", async () => {
    const groupId = "group-1";
    const userId = "member-uid";
    const adminUid = "admin-uid";

    // Member doc exists
    setDoc(`members/${groupId}_${userId}`, {
      userId,
      displayName: "Test Member",
      groupId,
    });

    // No existing upgrade request (rate-limit doc missing)
    setDoc(`groups/${groupId}/upgradeRequests/${userId}`, null);

    // Group doc with admin
    setDoc(`groups/${groupId}`, {
      name: "Recovery Group",
      admins: [adminUid],
    });

    // Admin user with FCM token
    setQueryResults("users", [
      {
        id: adminUid,
        data: {
          fcmTokens: ["admin-token-123"],
          notificationSettings: { allowPushNotifications: true },
        },
      },
    ]);

    const handler = notifyAdminUpgradeRequest as unknown as (
      req: ReturnType<typeof makeRequest>,
    ) => Promise<{ success: boolean; adminCount: number }>;

    const result = await handler(
      makeRequest({ groupId, featureName: "Treasury Management" }, userId),
    );

    expect(result.success).toBe(true);
    expect(result.adminCount).toBe(1);

    // FCM should have been called
    expect(mockSendEachForMulticast).toHaveBeenCalledWith(
      expect.objectContaining({
        tokens: ["admin-token-123"],
        notification: expect.objectContaining({
          title: expect.stringContaining("Recovery Group"),
          body: expect.stringContaining("Treasury Management"),
        }),
      }),
    );
  });

  it("rate-limits: same user cannot request again within 24 hours", async () => {
    const groupId = "group-2";
    const userId = "member-uid";

    // Member doc exists
    setDoc(`members/${groupId}_${userId}`, { userId, displayName: "Member" });

    // Rate-limit doc exists with a recent timestamp (1 hour ago)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    setDoc(`groups/${groupId}/upgradeRequests/${userId}`, {
      requestedAt: {
        toDate: () => oneHourAgo,
      },
      featureName: "Treasury Management",
      userId,
    });

    const handler = notifyAdminUpgradeRequest as unknown as (
      req: ReturnType<typeof makeRequest>,
    ) => Promise<unknown>;

    await expect(
      handler(
        makeRequest({ groupId, featureName: "Treasury Management" }, userId),
      ),
    ).rejects.toMatchObject({
      code: "resource-exhausted",
    });

    // FCM should NOT have been called
    expect(mockSendEachForMulticast).not.toHaveBeenCalled();
  });

  it("rejects non-members with permission-denied", async () => {
    const groupId = "group-3";
    const userId = "non-member-uid";

    // Member doc does NOT exist
    setDoc(`members/${groupId}_${userId}`, null);

    const handler = notifyAdminUpgradeRequest as unknown as (
      req: ReturnType<typeof makeRequest>,
    ) => Promise<unknown>;

    await expect(
      handler(makeRequest({ groupId, featureName: "Announcements" }, userId)),
    ).rejects.toMatchObject({
      code: "permission-denied",
    });

    expect(mockSendEachForMulticast).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated callers", async () => {
    const handler = notifyAdminUpgradeRequest as unknown as (
      req: ReturnType<typeof makeRequest>,
    ) => Promise<unknown>;

    await expect(
      handler(makeRequest({ groupId: "g", featureName: "f" }, null)),
    ).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  it("handles group with no admins gracefully", async () => {
    const groupId = "group-no-admins";
    const userId = "member-uid";

    setDoc(`members/${groupId}_${userId}`, { userId, displayName: "Member" });
    setDoc(`groups/${groupId}/upgradeRequests/${userId}`, null);
    setDoc(`groups/${groupId}`, { name: "Empty Group", admins: [] });

    const handler = notifyAdminUpgradeRequest as unknown as (
      req: ReturnType<typeof makeRequest>,
    ) => Promise<{ success: boolean; adminCount: number; message: string }>;

    const result = await handler(
      makeRequest({ groupId, featureName: "Treasury" }, userId),
    );

    expect(result.success).toBe(true);
    expect(result.adminCount).toBe(0);
    expect(result.message).toMatch(/no admins/i);
    expect(mockSendEachForMulticast).not.toHaveBeenCalled();
  });
});

// ============================================================
// TESTS — joinGroupByInviteCode invite analytics
// ============================================================

describe("joinGroupByInviteCode — invite analytics", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetState();
    mockDb = buildFirestoreMock();
    mockBatch.set.mockClear();
    mockBatch.update.mockClear();
    mockBatch.commit.mockClear();
  });

  it("increments joinCount on the invite document after a successful join", async () => {
    const userId = "new-user";
    const groupId = "group-invite-test";
    const inviteCode = "ABC123";

    // Invite doc
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const inviteDoc = {
      id: "invite-doc-id",
      data: {
        code: inviteCode,
        groupId,
        groupName: "Test Group",
        status: "pending",
        expiresAt: { toDate: () => futureDate },
        joinCount: 0,
      },
    };
    setQueryResults("groupInvites", [inviteDoc]);

    // User is NOT a member yet
    setDoc(`members/${groupId}_${userId}`, null);

    // Group doc
    setDoc(`groups/${groupId}`, {
      name: "Test Group",
      memberCount: 5,
      admins: ["admin-1"],
    });

    // User doc
    setDoc(`users/${userId}`, {
      displayName: "New User",
      email: "new@user.com",
      homeGroups: [],
    });

    const handler = joinGroupByInviteCode as unknown as (
      req: ReturnType<typeof makeRequest>,
    ) => Promise<{ success: boolean; groupId: string }>;

    const result = await handler(makeRequest({ code: inviteCode }, userId));

    expect(result.success).toBe(true);
    expect(result.groupId).toBe(groupId);

    // Verify batch.update was called with joinCount increment
    const batchUpdateCalls = mockBatch.update.mock.calls;
    const inviteUpdateCall = batchUpdateCalls.find((call: unknown[]) => {
      const updateData = call[1] as Record<string, unknown>;
      return Object.prototype.hasOwnProperty.call(updateData, "joinCount");
    });

    expect(inviteUpdateCall).toBeDefined();
    const updateData = inviteUpdateCall![1] as Record<string, unknown>;
    expect(updateData.joinCount).toEqual({ __increment: 1 });
  });

  it("sets isTreasurer: false on the new member document (H-2)", async () => {
    const userId = "new-user-treasurer";
    const groupId = "group-treasurer-test";
    const inviteCode = "TRS001";

    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const inviteDoc = {
      id: "invite-treasurer-test",
      data: {
        code: inviteCode,
        groupId,
        groupName: "Treasurer Test Group",
        status: "pending",
        expiresAt: { toDate: () => futureDate },
        joinCount: 0,
      },
    };
    setQueryResults("groupInvites", [inviteDoc]);

    // User is NOT a member yet
    setDoc(`members/${groupId}_${userId}`, null);

    // Group doc
    setDoc(`groups/${groupId}`, {
      name: "Treasurer Test Group",
      memberCount: 2,
      admins: ["admin-1"],
    });

    // User doc
    setDoc(`users/${userId}`, {
      displayName: "New User",
      email: "treasurer@test.com",
      homeGroups: [],
    });

    const handler = joinGroupByInviteCode as unknown as (
      req: ReturnType<typeof makeRequest>,
    ) => Promise<{ success: boolean; groupId: string }>;

    const result = await handler(makeRequest({ code: inviteCode }, userId));

    expect(result.success).toBe(true);

    // Verify batch.set was called with isTreasurer: false in the member document
    const batchSetCalls = mockBatch.set.mock.calls;
    expect(batchSetCalls.length).toBeGreaterThan(0);

    // Find the member document set call (the one with userId and isAdmin)
    const memberSetCall = batchSetCalls.find((call: unknown[]) => {
      const data = call[1] as Record<string, unknown>;
      return Object.prototype.hasOwnProperty.call(data, "isAdmin");
    });

    expect(memberSetCall).toBeDefined();
    const memberData = memberSetCall![1] as Record<string, unknown>;
    expect(memberData.isTreasurer).toBe(false);
  });

  it("does not increment joinCount when user is already a member", async () => {
    const userId = "existing-user";
    const groupId = "group-already-member";
    const inviteCode = "XYZ789";

    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const inviteDoc = {
      id: "invite-doc-2",
      data: {
        code: inviteCode,
        groupId,
        groupName: "Test Group",
        status: "pending",
        expiresAt: { toDate: () => futureDate },
        joinCount: 3,
      },
    };
    setQueryResults("groupInvites", [inviteDoc]);

    // User IS already a member
    setDoc(`members/${groupId}_${userId}`, {
      userId,
      groupId,
      isAdmin: false,
    });

    const handler = joinGroupByInviteCode as unknown as (
      req: ReturnType<typeof makeRequest>,
    ) => Promise<{ success: boolean; message: string }>;

    const result = await handler(makeRequest({ code: inviteCode }, userId));

    expect(result.success).toBe(true);
    expect(result.message).toMatch(/already a member/i);

    // Verify joinCount was NOT incremented (batch was not used for existing member path)
    const batchUpdateCalls = mockBatch.update.mock.calls;
    const incrementCall = batchUpdateCalls.find((call: unknown[]) => {
      const updateData = call[1] as Record<string, unknown>;
      return Object.prototype.hasOwnProperty.call(updateData, "joinCount");
    });
    expect(incrementCall).toBeUndefined();
  });
});
