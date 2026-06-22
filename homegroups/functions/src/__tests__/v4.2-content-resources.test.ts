/**
 * Unit tests for V4.2 Content & Resources Cloud Functions:
 *   1. contributeLiterature  — user contribution with pending approval
 *   2. bookmarkLiteratureForGroup — admin bookmark with isApproved guard
 *   3. seedDailyReflections  — idempotency guard (force flag)
 *
 * Mock pattern mirrors memberDrivenGrowth.test.ts exactly.
 */

// ============================================================
// MOCKS — must come before any imports that load the modules
// ============================================================

const mockFieldValueServerTimestamp = jest.fn(() => "__SERVER_TIMESTAMP__");
const mockFieldValueIncrement = jest.fn((n: number) => ({ __increment: n }));

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
  },
  apps: ["mock-app"],
  initializeApp: jest.fn(),
}));

jest.mock("firebase-admin/messaging", () => ({
  getMessaging: jest.fn(() => ({
    sendEachForMulticast: jest.fn(),
  })),
}));

// onCall can be called as:
//   onCall(handler)           — single-arg form (v1 style)
//   onCall(config, handler)   — two-arg form (v2 style with options)
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

// v2/https + logger mocks come from functions/jest.setup.ts (shared)

// ============================================================
// FIRESTORE MOCK INFRASTRUCTURE
// ============================================================

interface FirestoreState {
  collections: Record<string, Record<string, unknown> | null>;
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

// Track the last doc().set() call for assertions
let mockDocSet: jest.Mock;

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
    set: mockDocSet,
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
}));

// ============================================================
// IMPORTS — after mocks
// ============================================================

import { HttpsError } from "firebase-functions/v1/https";
import { contributeLiterature } from "../callable/contributeLiterature";
import { bookmarkLiteratureForGroup } from "../callable/bookmarkLiteratureForGroup";
import { seedDailyReflections } from "../callable/seedDailyReflections";

// ============================================================
// HELPERS
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeRequest(
  data: Record<string, unknown>,
  uid: string | null = "user-1",
  tokenExtra: Record<string, unknown> = {},
) {
  return {
    data,
    auth: uid
      ? {
          uid,
          token: {
            name: "Test User",
            email: "test@example.com",
            ...tokenExtra,
          },
        }
      : null,
  };
}

// ============================================================
// contributeLiterature tests
// ============================================================

describe("contributeLiterature", () => {
  beforeEach(() => {
    resetState();
    mockDocSet = jest.fn().mockResolvedValue(undefined);
    mockDb = buildFirestoreMock();
  });

  it("throws unauthenticated when no auth", async () => {
    const req = makeRequest(
      { title: "Test", summary: "A summary", type: "article" },
      null,
    );
    await expect((contributeLiterature as Function)(req)).rejects.toThrow(
      expect.objectContaining({ code: "unauthenticated" }),
    );
  });

  it("throws invalid-argument when title is missing", async () => {
    const req = makeRequest({
      title: "",
      summary: "A summary",
      type: "article",
    });
    await expect((contributeLiterature as Function)(req)).rejects.toThrow(
      expect.objectContaining({ code: "invalid-argument" }),
    );
  });

  it("throws invalid-argument when summary is missing", async () => {
    const req = makeRequest({
      title: "Good Title",
      summary: "",
      type: "article",
    });
    await expect((contributeLiterature as Function)(req)).rejects.toThrow(
      expect.objectContaining({ code: "invalid-argument" }),
    );
  });

  it("throws invalid-argument when summary exceeds 500 chars", async () => {
    const req = makeRequest({
      title: "Good Title",
      summary: "x".repeat(501),
      type: "article",
    });
    await expect((contributeLiterature as Function)(req)).rejects.toThrow(
      expect.objectContaining({ code: "invalid-argument" }),
    );
  });

  it("throws invalid-argument when type is missing", async () => {
    const req = makeRequest({
      title: "Good Title",
      summary: "A summary",
      type: "",
    });
    await expect((contributeLiterature as Function)(req)).rejects.toThrow(
      expect.objectContaining({ code: "invalid-argument" }),
    );
  });

  it("throws invalid-argument when external_link type has no externalUrl", async () => {
    const req = makeRequest({
      title: "Good Title",
      summary: "A summary",
      type: "external_link",
    });
    await expect((contributeLiterature as Function)(req)).rejects.toThrow(
      expect.objectContaining({ code: "invalid-argument" }),
    );
  });

  it("creates a literature item with isApproved: false and returns itemId", async () => {
    const req = makeRequest({
      title: "My Article",
      summary: "A helpful summary",
      type: "article",
      tags: ["step-work"],
    });

    const result = await (contributeLiterature as Function)(req);

    // CF returns { itemId } — not literatureId
    expect(result).toHaveProperty("itemId");
    expect(typeof result.itemId).toBe("string");

    // doc().set() is called, not collection().add()
    expect(mockDocSet).toHaveBeenCalled();
    const setArg = mockDocSet.mock.calls[0][0];
    expect(setArg.isApproved).toBe(false);
    expect(setArg.title).toBe("My Article");
    expect(setArg.contributedBy).toBe("user-1");
  });

  it("accepts external_link type when externalUrl is provided", async () => {
    const req = makeRequest({
      title: "External Resource",
      summary: "A link to a resource",
      type: "external_link",
      externalUrl: "https://example.com",
    });

    const result = await (contributeLiterature as Function)(req);
    expect(result).toHaveProperty("itemId");
    expect(mockDocSet).toHaveBeenCalled();
    const setArg = mockDocSet.mock.calls[0][0];
    expect(setArg.externalUrl).toBe("https://example.com");
  });
});

// ============================================================
// bookmarkLiteratureForGroup tests
// ============================================================

describe("bookmarkLiteratureForGroup", () => {
  beforeEach(() => {
    resetState();
    mockDocSet = jest.fn().mockResolvedValue(undefined);
    mockDb = buildFirestoreMock();
  });

  it("throws unauthenticated when no auth", async () => {
    const req = makeRequest({ groupId: "g1", literatureId: "lit1" }, null);
    await expect((bookmarkLiteratureForGroup as Function)(req)).rejects.toThrow(
      expect.objectContaining({ code: "unauthenticated" }),
    );
  });

  it("throws permission-denied when user is not a member", async () => {
    setDoc("groups/g1", { subscriptionStatus: "active", name: "Test Group" });
    // members/g1_user-1 does not exist
    const req = makeRequest({ groupId: "g1", literatureId: "lit1" });
    await expect((bookmarkLiteratureForGroup as Function)(req)).rejects.toThrow(
      expect.objectContaining({ code: "permission-denied" }),
    );
  });

  it("throws permission-denied when user is a member but not admin", async () => {
    setDoc("groups/g1", { subscriptionStatus: "active", name: "Test Group" });
    setDoc("members/g1_user-1", { isAdmin: false });
    const req = makeRequest({ groupId: "g1", literatureId: "lit1" });
    await expect((bookmarkLiteratureForGroup as Function)(req)).rejects.toThrow(
      expect.objectContaining({ code: "permission-denied" }),
    );
  });

  it("throws not-found when literature item does not exist", async () => {
    setDoc("groups/g1", { subscriptionStatus: "active", name: "Test Group" });
    setDoc("members/g1_user-1", { isAdmin: true });
    // literature_index/lit1 not set → returns null
    const req = makeRequest({ groupId: "g1", literatureId: "lit1" });
    await expect((bookmarkLiteratureForGroup as Function)(req)).rejects.toThrow(
      expect.objectContaining({ code: "not-found" }),
    );
  });

  it("throws failed-precondition when literature item is not approved", async () => {
    setDoc("groups/g1", { subscriptionStatus: "active", name: "Test Group" });
    setDoc("members/g1_user-1", { isAdmin: true });
    setDoc("literature_index/lit1", {
      title: "Pending Item",
      isApproved: false,
    });
    const req = makeRequest({ groupId: "g1", literatureId: "lit1" });
    await expect((bookmarkLiteratureForGroup as Function)(req)).rejects.toThrow(
      expect.objectContaining({ code: "failed-precondition" }),
    );
  });

  it("bookmarks approved literature for group and returns { bookmarked: true }", async () => {
    setDoc("groups/g1", { subscriptionStatus: "active", name: "Test Group" });
    setDoc("members/g1_user-1", { isAdmin: true });
    setDoc("literature_index/lit1", {
      title: "Approved Item",
      isApproved: true,
    });
    const req = makeRequest({ groupId: "g1", literatureId: "lit1" });

    const result = await (bookmarkLiteratureForGroup as Function)(req);
    expect(result).toEqual({ bookmarked: true });
    expect(mockDocSet).toHaveBeenCalled();
  });
});

// ============================================================
// seedDailyReflections tests
// ============================================================

describe("seedDailyReflections", () => {
  beforeEach(() => {
    resetState();
    mockDocSet = jest.fn().mockResolvedValue(undefined);
    mockDb = buildFirestoreMock();
    // Reset batch mock
    mockBatch.set.mockReset();
    mockBatch.commit.mockReset();
    mockBatch.commit.mockResolvedValue(undefined);
  });

  it("throws unauthenticated when no auth", async () => {
    const req = makeRequest({}, null);
    await expect((seedDailyReflections as Function)(req)).rejects.toThrow(
      expect.objectContaining({ code: "unauthenticated" }),
    );
  });

  it("throws permission-denied when user is not platform admin", async () => {
    setDoc("users/user-1", { role: "user" });
    const req = makeRequest({});
    await expect((seedDailyReflections as Function)(req)).rejects.toThrow(
      expect.objectContaining({ code: "permission-denied" }),
    );
  });

  it('returns skipped count early when doc "001" exists and force is false', async () => {
    // Simulate doc "001" existing
    setDoc("daily_reflections/001", { dayOfYear: 1, title: "Already seeded" });
    const req = makeRequest({ force: false }, "user-1", { superAdmin: true });

    const result = await (seedDailyReflections as Function)(req);

    expect(result.seeded).toBe(0);
    expect(result.skipped).toBeGreaterThan(0);
    // Batch should NOT have been used since we returned early
    expect(mockBatch.commit).not.toHaveBeenCalled();
  });

  it('seeds all reflections when force is true even if doc "001" exists', async () => {
    setDoc("daily_reflections/001", { dayOfYear: 1, title: "Already seeded" });
    const req = makeRequest({ force: true }, "user-1", { superAdmin: true });

    const result = await (seedDailyReflections as Function)(req);

    expect(result.seeded).toBeGreaterThan(0);
    expect(mockBatch.commit).toHaveBeenCalled();
  });

  it("seeds all reflections when collection is empty (no force needed)", async () => {
    // doc "001" does NOT exist — omit from collections so get() returns null
    const req = makeRequest({}, "user-1", { superAdmin: true });

    const result = await (seedDailyReflections as Function)(req);

    expect(result.seeded).toBe(365); // REFLECTIONS_365 now has 365 entries
    expect(mockBatch.commit).toHaveBeenCalled();
  });
});
