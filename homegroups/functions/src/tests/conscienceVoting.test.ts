/* eslint-disable */
// @ts-nocheck
/**
 * Group Conscience Voting Cloud Functions Tests
 *
 * Tests for createConscienceVote, castConscienceVote, closeConscienceVote
 *
 * Run with: cd functions && npx jest src/tests/conscienceVoting.test.ts --no-coverage
 */

// ---------------------------------------------------------------------------
// Firebase Admin mock
// ---------------------------------------------------------------------------
const mockTimestampNow = jest.fn(() => ({
  toMillis: () => Date.now(),
  toDate: () => new Date(),
}));
const mockServerTimestamp = jest.fn(() => "SERVER_TIMESTAMP");

const mockDocGet = jest.fn();
const mockDocSet = jest.fn();
const mockDocUpdate = jest.fn();
const mockDocRef = {
  id: "vote123",
  set: mockDocSet,
  update: mockDocUpdate,
  get: mockDocGet,
};

const mockCollectionGet = jest.fn();
const mockWhere = jest.fn();
const mockLimit = jest.fn();
const mockOrderBy = jest.fn();

// Build a chainable Firestore mock
function makeCollectionChain(docs: any[] = []) {
  const chain: any = {
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue({
      docs: docs.map((d) => ({
        data: () => d,
        id: d.id || "id",
        ref: { id: d.id || "id" },
      })),
      empty: docs.length === 0,
    }),
    doc: jest.fn().mockReturnValue(mockDocRef),
    add: jest.fn().mockResolvedValue({ id: "newDocId" }),
  };
  return chain;
}

let firestoreCollections: Record<string, any> = {};

const mockFirestore = {
  collection: jest.fn((path: string) => {
    if (firestoreCollections[path]) {
      return firestoreCollections[path];
    }
    return makeCollectionChain();
  }),
  FieldValue: {
    serverTimestamp: mockServerTimestamp,
    arrayUnion: jest.fn((...args: any[]) => args),
    arrayRemove: jest.fn((...args: any[]) => args),
  },
  Timestamp: {
    now: mockTimestampNow,
    fromDate: jest.fn((d: Date) => ({
      toMillis: () => d.getTime(),
      toDate: () => d,
    })),
  },
};

const mockMessaging = {
  sendEachForMulticast: jest
    .fn()
    .mockResolvedValue({ successCount: 1, failureCount: 0 }),
};

jest.mock("firebase-admin", () => ({
  firestore: Object.assign(() => mockFirestore, {
    FieldValue: mockFirestore.FieldValue,
    Timestamp: mockFirestore.Timestamp,
  }),
  messaging: jest.fn(() => mockMessaging),
  apps: [true],
  initializeApp: jest.fn(),
  credential: { applicationDefault: jest.fn() },
}));

jest.mock("../utils/firebase", () => ({
  db: mockFirestore,
  messaging: mockMessaging,
}));

// Firebase Functions mock
jest.mock("firebase-functions", () => ({
  https: {
    onCall: jest.fn((handler: Function) => handler),
    HttpsError: class HttpsError extends Error {
      constructor(
        public code: string,
        message: string,
      ) {
        super(message);
        this.name = "HttpsError";
      }
    },
  },
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock("firebase-functions/v1/https", () => ({
  HttpsError: class HttpsError extends Error {
    constructor(
      public code: string,
      message: string,
    ) {
      super(message);
      this.name = "HttpsError";
    }
  },
}));

// v2/https + logger mocks come from functions/jest.setup.ts (shared)

// ---------------------------------------------------------------------------
// Helper to build a fake CallableRequest
// ---------------------------------------------------------------------------
function makeRequest(
  data: any,
  uid: string | null = "admin_user_1",
  claims: any = {},
) {
  return {
    data,
    auth: uid
      ? {
          uid,
          token: { name: "Test User", email: "test@example.com", ...claims },
        }
      : null,
  };
}

// ---------------------------------------------------------------------------
// Import functions AFTER mocks
// ---------------------------------------------------------------------------
import { createConscienceVote } from "../callable/createConscienceVote";
import { castConscienceVote } from "../callable/castConscienceVote";
import { closeConscienceVote } from "../callable/closeConscienceVote";

// ---------------------------------------------------------------------------
// Test data helpers
// ---------------------------------------------------------------------------
function makeGroupDoc(overrides: any = {}) {
  return {
    exists: true,
    data: () => ({
      name: "Test Group",
      admins: ["admin_user_1"],
      adminUids: ["admin_user_1"],
      memberCount: 5,
      subscriptionStatus: "active",
      ...overrides,
    }),
    ref: { id: "group123" },
  };
}

function makeVoteDoc(overrides: any = {}) {
  return {
    exists: true,
    id: "vote123",
    data: () => ({
      id: "vote123",
      groupId: "group123",
      groupName: "Test Group",
      createdBy: "admin_user_1",
      title: "Should we change meeting day?",
      description: "Motion to move meeting from Tuesday to Wednesday",
      options: ["Yes", "No", "Abstain"],
      votes: {},
      status: "open",
      openedAt: { toMillis: () => Date.now() },
      ...overrides,
    }),
    ref: {
      id: "vote123",
      update: mockDocUpdate,
    },
  };
}

function makeMemberDoc(userId: string, roles: string[] = ["member"]) {
  return {
    exists: true,
    id: `group123_${userId}`,
    data: () => ({
      userId,
      groupId: "group123",
      displayName: `User ${userId}`,
      roles,
      isAdmin: roles.includes("admin"),
    }),
  };
}

// ---------------------------------------------------------------------------
// Describe blocks
// ---------------------------------------------------------------------------

describe("createConscienceVote", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    firestoreCollections = {};

    // Default: admin member check passes
    const memberDoc = makeMemberDoc("admin_user_1", ["admin"]);
    const groupDoc = makeGroupDoc();

    const membersCollection = makeCollectionChain([memberDoc.data()]);
    membersCollection.doc = jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue(memberDoc),
      set: mockDocSet,
      update: mockDocUpdate,
    });
    firestoreCollections["members"] = membersCollection;

    const groupCollection = makeCollectionChain();
    groupCollection.doc = jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue(groupDoc),
      id: "group123",
    });
    firestoreCollections["groups"] = groupCollection;

    const voteCollection = makeCollectionChain();
    const newVoteRef = {
      id: "vote123",
      set: mockDocSet,
    };
    voteCollection.doc = jest.fn().mockReturnValue(newVoteRef);
    firestoreCollections["group_conscience_votes"] = voteCollection;

    // Users for FCM
    const usersCollection = makeCollectionChain([
      {
        uid: "admin_user_1",
        fcmTokens: ["token1"],
        notificationSettings: { allowPushNotifications: true },
      },
      {
        uid: "member_user_2",
        fcmTokens: ["token2"],
        notificationSettings: { allowPushNotifications: true },
      },
    ]);
    usersCollection.where = jest.fn().mockReturnThis();
    usersCollection.get = jest.fn().mockResolvedValue({
      docs: [
        {
          data: () => ({
            fcmTokens: ["token1"],
            notificationSettings: { allowPushNotifications: true },
          }),
          id: "admin_user_1",
        },
      ],
    });
    firestoreCollections["users"] = usersCollection;
  });

  test("throws unauthenticated if no auth", async () => {
    const req = makeRequest({ groupId: "group123", title: "Test" }, null);
    await expect(createConscienceVote(req as any)).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  test("throws invalid-argument if groupId missing", async () => {
    const req = makeRequest({ title: "Test" });
    await expect(createConscienceVote(req as any)).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  test("throws invalid-argument if title missing", async () => {
    const req = makeRequest({ groupId: "group123" });
    await expect(createConscienceVote(req as any)).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  test("throws permission-denied if caller is not admin", async () => {
    const nonAdminMemberDoc = makeMemberDoc("regular_user", ["member"]);
    const membersCollection = makeCollectionChain();
    membersCollection.doc = jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue(nonAdminMemberDoc),
    });
    firestoreCollections["members"] = membersCollection;

    const req = makeRequest(
      { groupId: "group123", title: "Test vote" },
      "regular_user",
    );
    await expect(createConscienceVote(req as any)).rejects.toMatchObject({
      code: "permission-denied",
    });
  });

  test("creates vote document with default options when no options provided", async () => {
    const req = makeRequest({
      groupId: "group123",
      title: "Should we change meeting day?",
    });

    const result = await createConscienceVote(req as any);

    expect(result).toHaveProperty("voteId");
    expect(mockDocSet).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: "group123",
        title: "Should we change meeting day?",
        options: ["Yes", "No", "Abstain"],
        status: "open",
        votes: {},
      }),
    );
  });

  test("creates vote with custom options", async () => {
    const req = makeRequest({
      groupId: "group123",
      title: "Budget vote",
      options: ["Approve", "Reject", "Table"],
    });

    const result = await createConscienceVote(req as any);
    expect(result).toHaveProperty("voteId");
    expect(mockDocSet).toHaveBeenCalledWith(
      expect.objectContaining({
        options: ["Approve", "Reject", "Table"],
      }),
    );
  });

  test("creates vote with description and quorum", async () => {
    const req = makeRequest({
      groupId: "group123",
      title: "Important motion",
      description: "Full description here",
      quorumRequired: 3,
    });

    const result = await createConscienceVote(req as any);
    expect(result).toHaveProperty("voteId");
    expect(mockDocSet).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "Full description here",
        quorumRequired: 3,
      }),
    );
  });
});

// ---------------------------------------------------------------------------

describe("castConscienceVote", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    firestoreCollections = {};

    const voteDoc = makeVoteDoc();
    const voteCollection = makeCollectionChain();
    voteCollection.doc = jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue(voteDoc),
      update: mockDocUpdate,
      id: "vote123",
      ref: voteDoc.ref,
    });
    firestoreCollections["group_conscience_votes"] = voteCollection;

    const memberDoc = makeMemberDoc("member_user_1", ["member"]);
    const membersCollection = makeCollectionChain();
    membersCollection.doc = jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue(memberDoc),
    });
    firestoreCollections["members"] = membersCollection;
  });

  test("throws unauthenticated if no auth", async () => {
    const req = makeRequest({ voteId: "vote123", option: "Yes" }, null);
    await expect(castConscienceVote(req as any)).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  test("throws invalid-argument if voteId missing", async () => {
    const req = makeRequest({ option: "Yes" }, "member_user_1");
    await expect(castConscienceVote(req as any)).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  test("throws invalid-argument if option missing", async () => {
    const req = makeRequest({ voteId: "vote123" }, "member_user_1");
    await expect(castConscienceVote(req as any)).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  test("throws not-found if vote does not exist", async () => {
    const voteCollection = makeCollectionChain();
    voteCollection.doc = jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue({ exists: false }),
    });
    firestoreCollections["group_conscience_votes"] = voteCollection;

    const req = makeRequest(
      { voteId: "notexist", option: "Yes" },
      "member_user_1",
    );
    await expect(castConscienceVote(req as any)).rejects.toMatchObject({
      code: "not-found",
    });
  });

  test("throws failed-precondition if vote is closed", async () => {
    const closedVoteDoc = makeVoteDoc({ status: "closed" });
    const voteCollection = makeCollectionChain();
    voteCollection.doc = jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue(closedVoteDoc),
    });
    firestoreCollections["group_conscience_votes"] = voteCollection;

    const req = makeRequest(
      { voteId: "vote123", option: "Yes" },
      "member_user_1",
    );
    await expect(castConscienceVote(req as any)).rejects.toMatchObject({
      code: "failed-precondition",
    });
  });

  test("throws permission-denied if user is not a group member", async () => {
    const membersCollection = makeCollectionChain();
    membersCollection.doc = jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue({ exists: false }),
    });
    firestoreCollections["members"] = membersCollection;

    const req = makeRequest(
      { voteId: "vote123", option: "Yes" },
      "outsider_user",
    );
    await expect(castConscienceVote(req as any)).rejects.toMatchObject({
      code: "permission-denied",
    });
  });

  test("throws invalid-argument if option is not in vote options", async () => {
    const req = makeRequest(
      { voteId: "vote123", option: "Maybe" },
      "member_user_1",
    );
    await expect(castConscienceVote(req as any)).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  test("records vote successfully", async () => {
    const req = makeRequest(
      { voteId: "vote123", option: "Yes" },
      "member_user_1",
    );
    const result = await castConscienceVote(req as any);

    expect(result).toEqual({ success: true });
    expect(mockDocUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        "votes.member_user_1": "Yes",
      }),
    );
  });

  test("allows changing vote (idempotent)", async () => {
    // User already voted
    const voteDocWithExistingVote = makeVoteDoc({
      votes: { member_user_1: "No" },
    });
    const voteCollection = makeCollectionChain();
    voteCollection.doc = jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue(voteDocWithExistingVote),
      update: mockDocUpdate,
    });
    firestoreCollections["group_conscience_votes"] = voteCollection;

    const req = makeRequest(
      { voteId: "vote123", option: "Yes" },
      "member_user_1",
    );
    const result = await castConscienceVote(req as any);

    expect(result).toEqual({ success: true });
    expect(mockDocUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        "votes.member_user_1": "Yes",
      }),
    );
  });
});

// ---------------------------------------------------------------------------

describe("closeConscienceVote", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    firestoreCollections = {};

    const voteDoc = makeVoteDoc({
      votes: {
        user1: "Yes",
        user2: "Yes",
        user3: "No",
        user4: "Abstain",
      },
    });
    const voteCollection = makeCollectionChain();
    voteCollection.doc = jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue(voteDoc),
      update: mockDocUpdate,
      id: "vote123",
    });
    firestoreCollections["group_conscience_votes"] = voteCollection;

    const memberDoc = makeMemberDoc("admin_user_1", ["admin"]);
    const membersCollection = makeCollectionChain([memberDoc.data()]);
    membersCollection.doc = jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue(memberDoc),
    });
    membersCollection.where = jest.fn().mockReturnThis();
    membersCollection.get = jest.fn().mockResolvedValue({
      docs: [
        { data: () => ({ userId: "user1" }), id: "group123_user1" },
        { data: () => ({ userId: "user2" }), id: "group123_user2" },
        { data: () => ({ userId: "user3" }), id: "group123_user3" },
        { data: () => ({ userId: "user4" }), id: "group123_user4" },
      ],
    });
    firestoreCollections["members"] = membersCollection;

    const usersCollection = makeCollectionChain();
    usersCollection.where = jest.fn().mockReturnThis();
    usersCollection.get = jest.fn().mockResolvedValue({
      docs: [
        {
          data: () => ({
            fcmTokens: ["token1"],
            notificationSettings: { allowPushNotifications: true },
          }),
          id: "admin_user_1",
        },
      ],
    });
    firestoreCollections["users"] = usersCollection;

    // Group for admin check
    const groupCollection = makeCollectionChain();
    groupCollection.doc = jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue(makeGroupDoc()),
    });
    firestoreCollections["groups"] = groupCollection;
  });

  test("throws unauthenticated if no auth", async () => {
    const req = makeRequest({ voteId: "vote123" }, null);
    await expect(closeConscienceVote(req as any)).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  test("throws invalid-argument if voteId missing", async () => {
    const req = makeRequest({}, "admin_user_1");
    await expect(closeConscienceVote(req as any)).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  test("throws not-found if vote does not exist", async () => {
    const voteCollection = makeCollectionChain();
    voteCollection.doc = jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue({ exists: false }),
    });
    firestoreCollections["group_conscience_votes"] = voteCollection;

    const req = makeRequest({ voteId: "notexist" }, "admin_user_1");
    await expect(closeConscienceVote(req as any)).rejects.toMatchObject({
      code: "not-found",
    });
  });

  test("throws failed-precondition if vote is already closed", async () => {
    const closedVote = makeVoteDoc({ status: "closed" });
    const voteCollection = makeCollectionChain();
    voteCollection.doc = jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue(closedVote),
    });
    firestoreCollections["group_conscience_votes"] = voteCollection;

    const req = makeRequest({ voteId: "vote123" }, "admin_user_1");
    await expect(closeConscienceVote(req as any)).rejects.toMatchObject({
      code: "failed-precondition",
    });
  });

  test("throws permission-denied if caller is not admin", async () => {
    const nonAdminMemberDoc = makeMemberDoc("regular_user", ["member"]);
    const membersCollection = makeCollectionChain();
    membersCollection.doc = jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue(nonAdminMemberDoc),
    });
    membersCollection.where = jest.fn().mockReturnThis();
    membersCollection.get = jest.fn().mockResolvedValue({ docs: [] });
    firestoreCollections["members"] = membersCollection;

    const req = makeRequest({ voteId: "vote123" }, "regular_user");
    await expect(closeConscienceVote(req as any)).rejects.toMatchObject({
      code: "permission-denied",
    });
  });

  test("tallies votes correctly and determines winner", async () => {
    const req = makeRequest({ voteId: "vote123" }, "admin_user_1");
    const result = await closeConscienceVote(req as any);

    expect(result).toEqual({ success: true });
    expect(mockDocUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "closed",
        result: expect.objectContaining({
          counts: expect.objectContaining({ Yes: 2, No: 1, Abstain: 1 }),
          winner: "Yes",
          totalVotes: 4,
        }),
      }),
    );
  });

  test("handles quorum check when quorumRequired is set", async () => {
    const voteWithQuorum = makeVoteDoc({
      quorumRequired: 5,
      votes: { user1: "Yes", user2: "No" },
    });
    const voteCollection = makeCollectionChain();
    voteCollection.doc = jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue(voteWithQuorum),
      update: mockDocUpdate,
    });
    firestoreCollections["group_conscience_votes"] = voteCollection;

    const req = makeRequest({ voteId: "vote123" }, "admin_user_1");
    const result = await closeConscienceVote(req as any);

    expect(result).toEqual({ success: true });
    expect(mockDocUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        result: expect.objectContaining({
          quorumMet: false,
        }),
      }),
    );
  });

  test("handles tie (no winner)", async () => {
    const tiedVoteDoc = makeVoteDoc({
      votes: { user1: "Yes", user2: "No" },
    });
    const voteCollection = makeCollectionChain();
    voteCollection.doc = jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue(tiedVoteDoc),
      update: mockDocUpdate,
    });
    firestoreCollections["group_conscience_votes"] = voteCollection;

    const req = makeRequest({ voteId: "vote123" }, "admin_user_1");
    const result = await closeConscienceVote(req as any);

    expect(result).toEqual({ success: true });
    // In a tie, no clear winner
    const updateCall = mockDocUpdate.mock.calls[0][0];
    // closeConscienceVote initializes all options from voteData.options = ["Yes", "No", "Abstain"]
    expect(updateCall.result.counts).toMatchObject({ Yes: 1, No: 1 });
    expect(updateCall.result.winner).toBeFalsy();
  });
});
