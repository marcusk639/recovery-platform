// src/__tests__/scheduled/officerTermReminder.test.ts

// ---------------------------------------------------------------------------
// Shared mock state — defined before jest.mock() factory calls
// ---------------------------------------------------------------------------
const mockSendEachForMulticast = jest.fn().mockResolvedValue({
  successCount: 1,
  failureCount: 0,
  responses: [{ error: null }],
});

const mockCollectionGroupGet = jest.fn().mockResolvedValue({
  docs: [],
  empty: true,
});
const mockWhere = jest.fn().mockReturnThis();
const mockCollectionGroup = jest.fn(() => ({
  where: mockWhere,
  get: mockCollectionGroupGet,
}));

const mockGetAll = jest.fn().mockResolvedValue([]);

jest.mock("firebase-admin", () => ({
  firestore: jest.fn(() => ({
    collectionGroup: mockCollectionGroup,
    getAll: mockGetAll,
  })),
  messaging: jest.fn(() => ({
    sendEachForMulticast: mockSendEachForMulticast,
  })),
  initializeApp: jest.fn(),
}));

// userCollection.doc() is used to build DocumentReferences for db.getAll()
const mockUserDocRef = { id: "user-1" };
const mockUserCollectionDoc = jest.fn().mockReturnValue(mockUserDocRef);
jest.mock("../../api/firestore", () => ({
  app: {},
  userCollection: {
    doc: mockUserCollectionDoc,
    // update is called through userCollection.doc(uid).update(...)
    // but doc() returns a ref that goes to db.getAll(), not .update() directly.
    // The token-cleanup path calls userCollection.doc(userId).update(...)
  },
}));

jest.mock("firebase-functions/v2/scheduler", () => ({
  onSchedule: jest.fn((_opts: unknown, handler: unknown) => handler),
}));

jest.mock("firebase-functions", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

import { sendOfficerTermReminders } from "../../scheduled/officerTermReminder";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns a future ISO date string `daysFromNow` days in the future */
function futureDateStr(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

/** Returns today's ISO date string */
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Builds a minimal Firestore doc snapshot for an officer */
function makeOfficerDoc(overrides: Record<string, unknown> = {}) {
  return {
    id: "officer-doc-1",
    data: () => ({
      userId: "user-1",
      role: "president",
      houseId: "house-1",
      termEndDate: futureDateStr(15),
      isActive: true,
      ...overrides,
    }),
  };
}

/** Builds a getAll() result snapshot for a user */
function makeUserSnap(
  uid: string,
  messagingToken: string[] | undefined = ["token-abc"]
) {
  return {
    id: uid,
    exists: true,
    data: () => ({ messagingToken }),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  // Default: empty snapshot
  mockCollectionGroupGet.mockResolvedValue({ docs: [], empty: true });
  mockGetAll.mockResolvedValue([]);
  mockSendEachForMulticast.mockResolvedValue({
    successCount: 1,
    failureCount: 0,
    responses: [{ error: null }],
  });
  // Reset userCollection.doc to return a plain ref object
  mockUserCollectionDoc.mockReturnValue({ id: "user-1" });
});

// ===========================================================================
// sendOfficerTermReminders
// ===========================================================================
describe("sendOfficerTermReminders", () => {
  // -------------------------------------------------------------------------
  // Basic shape
  // -------------------------------------------------------------------------
  it("is a function", () => {
    expect(typeof sendOfficerTermReminders).toBe("function");
  });

  it("does not throw when there are no officers expiring", async () => {
    await expect(sendOfficerTermReminders()).resolves.not.toThrow();
  });

  it("does not call sendEachForMulticast when snapshot is empty", async () => {
    await sendOfficerTermReminders();
    expect(mockSendEachForMulticast).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------
  it("sends a notification for an officer with valid tokens", async () => {
    const officerDoc = makeOfficerDoc({ termEndDate: futureDateStr(15) });
    mockCollectionGroupGet.mockResolvedValue({
      docs: [officerDoc],
      empty: false,
    });
    mockGetAll.mockResolvedValue([makeUserSnap("user-1", ["token-abc"])]);

    await sendOfficerTermReminders();

    expect(mockSendEachForMulticast).toHaveBeenCalledTimes(1);
    const call = mockSendEachForMulticast.mock.calls[0][0];
    expect(call.tokens).toEqual(["token-abc"]);
    expect(call.notification.title).toBe("Officer Term Expiring");
    expect(call.notification.body).toMatch(/President/);
    expect(call.notification.body).toMatch(/days/);
    expect(call.data).toMatchObject({
      houseId: "house-1",
      role: "president",
      type: "officer_term_reminder",
    });
  });

  it("batches user lookups via db.getAll() instead of individual reads", async () => {
    const doc1 = makeOfficerDoc({
      userId: "user-1",
      termEndDate: futureDateStr(10),
    });
    const doc2 = makeOfficerDoc({
      id: "officer-doc-2",
      userId: "user-2",
      termEndDate: futureDateStr(20),
    });
    mockCollectionGroupGet.mockResolvedValue({
      docs: [doc1, doc2],
      empty: false,
    });
    mockGetAll.mockResolvedValue([
      makeUserSnap("user-1", ["tok-1"]),
      makeUserSnap("user-2", ["tok-2"]),
    ]);
    mockUserCollectionDoc
      .mockReturnValueOnce({ id: "user-1" })
      .mockReturnValueOnce({ id: "user-2" });

    await sendOfficerTermReminders();

    // getAll called exactly once regardless of officer count
    expect(mockGetAll).toHaveBeenCalledTimes(1);
    expect(mockSendEachForMulticast).toHaveBeenCalledTimes(2);
  });

  // -------------------------------------------------------------------------
  // User without tokens
  // -------------------------------------------------------------------------
  it("skips sending when user has no messagingToken", async () => {
    const officerDoc = makeOfficerDoc();
    mockCollectionGroupGet.mockResolvedValue({
      docs: [officerDoc],
      empty: false,
    });
    mockGetAll.mockResolvedValue([makeUserSnap("user-1", [])]);

    await sendOfficerTermReminders();

    expect(mockSendEachForMulticast).not.toHaveBeenCalled();
  });

  it("skips sending when user has non-array messagingToken (unsafe data)", async () => {
    const officerDoc = makeOfficerDoc();
    mockCollectionGroupGet.mockResolvedValue({
      docs: [officerDoc],
      empty: false,
    });
    // Malformed Firestore data — messagingToken is a string, not an array
    mockGetAll.mockResolvedValue([
      {
        id: "user-1",
        exists: true,
        data: () => ({ messagingToken: "bad-token" }),
      },
    ]);

    await sendOfficerTermReminders();

    expect(mockSendEachForMulticast).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // daysLeft = 0 boundary
  // -------------------------------------------------------------------------
  it("does not send when termEndDate is today (daysLeft rounds to 0 or less)", async () => {
    const officerDoc = makeOfficerDoc({ termEndDate: todayStr() });
    mockCollectionGroupGet.mockResolvedValue({
      docs: [officerDoc],
      empty: false,
    });
    mockGetAll.mockResolvedValue([makeUserSnap("user-1", ["token-abc"])]);

    await sendOfficerTermReminders();

    expect(mockSendEachForMulticast).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Missing required fields
  // -------------------------------------------------------------------------
  it("skips officer doc missing required fields", async () => {
    const incompleteDoc = {
      id: "bad-officer",
      data: () => ({ userId: "user-1" }), // missing role, houseId, termEndDate
    };
    mockCollectionGroupGet.mockResolvedValue({
      docs: [incompleteDoc],
      empty: false,
    });
    mockGetAll.mockResolvedValue([makeUserSnap("user-1", ["token-abc"])]);

    await sendOfficerTermReminders();

    expect(mockSendEachForMulticast).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Stale token cleanup
  // -------------------------------------------------------------------------
  it("removes stale tokens after sendEachForMulticast reports invalid token", async () => {
    const officerDoc = makeOfficerDoc();
    mockCollectionGroupGet.mockResolvedValue({
      docs: [officerDoc],
      empty: false,
    });
    mockGetAll.mockResolvedValue([makeUserSnap("user-1", ["stale-token"])]);

    // Simulate FCM rejecting the token as unregistered
    mockSendEachForMulticast.mockResolvedValue({
      successCount: 0,
      failureCount: 1,
      responses: [
        {
          error: {
            code: "messaging/registration-token-not-registered",
            message: "Token not registered",
          },
        },
      ],
    });

    // userCollection.doc(userId).update(...) — wire up the mock chain
    const mockUpdate = jest.fn().mockResolvedValue(undefined);
    mockUserCollectionDoc.mockReturnValue({ update: mockUpdate });

    await sendOfficerTermReminders();

    expect(mockUpdate).toHaveBeenCalledWith({ messagingToken: [] });
  });

  it("does not call update when all tokens are valid", async () => {
    const officerDoc = makeOfficerDoc();
    mockCollectionGroupGet.mockResolvedValue({
      docs: [officerDoc],
      empty: false,
    });
    mockGetAll.mockResolvedValue([makeUserSnap("user-1", ["good-token"])]);

    mockSendEachForMulticast.mockResolvedValue({
      successCount: 1,
      failureCount: 0,
      responses: [{ error: null }],
    });

    const mockUpdate = jest.fn().mockResolvedValue(undefined);
    mockUserCollectionDoc.mockReturnValue({ update: mockUpdate });

    await sendOfficerTermReminders();

    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
