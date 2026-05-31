/* eslint-disable */
// @ts-nocheck
/**
 * V4.1 Advanced Governance Cloud Functions Tests
 *
 * Tests for:
 *   - saveBylawDraft
 *   - ratifyBylaws
 *   - openElection
 *   - nominateForElection
 *   - castElectionVote
 *   - closeElection
 *   - saveMeetingMinutes
 *   - approveMeetingMinutes
 *   - generateIntergroupReport
 *
 * Run with:
 *   cd functions && npx jest src/tests/v4.1-governance.test.ts --no-coverage
 */

// ---------------------------------------------------------------------------
// Firebase Admin mock
// ---------------------------------------------------------------------------
const mockServerTimestamp = jest.fn(() => "SERVER_TIMESTAMP");

const mockDocGet = jest.fn();
const mockDocSet = jest.fn();
const mockDocUpdate = jest.fn();
const mockDocRef = {
  id: "doc123",
  set: mockDocSet,
  update: mockDocUpdate,
  get: mockDocGet,
};

function makeCollectionChain(docs: any[] = []) {
  const chain: any = {
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue({
      docs: docs.map((d) => ({
        data: () => d,
        id: d.id || "id",
        ref: { id: d.id || "id", update: mockDocUpdate },
        exists: true,
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
    arrayUnion: jest.fn((...args: any[]) => ({ _type: "arrayUnion", args })),
    arrayRemove: jest.fn((...args: any[]) => ({ _type: "arrayRemove", args })),
    increment: jest.fn((n: number) => ({ _type: "increment", n })),
  },
  Timestamp: {
    now: jest.fn(() => ({
      toMillis: () => Date.now(),
      toDate: () => new Date(),
    })),
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
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
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
// Helpers
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

function makeAdminMemberDoc(userId: string = "admin_user_1") {
  return {
    exists: true,
    id: `group123_${userId}`,
    data: () => ({
      userId,
      groupId: "group123",
      displayName: `Admin ${userId}`,
      roles: ["admin"],
      isAdmin: true,
    }),
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

function makeGroupDoc(overrides: any = {}) {
  return {
    exists: true,
    data: () => ({
      name: "Test Group",
      admins: ["admin_user_1"],
      type: "AA",
      subscriptionStatus: "active",
      ...overrides,
    }),
    ref: { id: "group123" },
    id: "group123",
  };
}

function setupAdminMembersCollection(
  userId = "admin_user_1",
  roles = ["admin"],
) {
  const memberDoc = makeMemberDoc(userId, roles);
  const col = makeCollectionChain([memberDoc.data()]);
  col.doc = jest.fn().mockReturnValue({
    get: jest.fn().mockResolvedValue(memberDoc),
    set: mockDocSet,
    update: mockDocUpdate,
  });
  col.where = jest.fn().mockReturnThis();
  col.get = jest.fn().mockResolvedValue({
    docs: [
      {
        data: () => memberDoc.data(),
        id: memberDoc.id,
        ref: { id: memberDoc.id },
      },
    ],
    empty: false,
  });
  firestoreCollections["members"] = col;
}

function setupUsersCollection() {
  const col = makeCollectionChain();
  col.where = jest.fn().mockReturnThis();
  col.get = jest.fn().mockResolvedValue({
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
  firestoreCollections["users"] = col;
}

function setupGroupsCollection(groupOverrides: any = {}) {
  const groupDoc = makeGroupDoc(groupOverrides);
  const col = makeCollectionChain();
  col.doc = jest.fn().mockReturnValue({
    get: jest.fn().mockResolvedValue(groupDoc),
    id: "group123",
  });
  firestoreCollections["groups"] = col;
}

// ---------------------------------------------------------------------------
// Import CFs after mocks
// ---------------------------------------------------------------------------
import { saveBylawDraft } from "../callable/saveBylawDraft";
import { ratifyBylaws } from "../callable/ratifyBylaws";
import { openElection } from "../callable/openElection";
import { openElectionVoting } from "../callable/openElectionVoting";
import { nominateForElection } from "../callable/nominateForElection";
import { castElectionVote } from "../callable/castElectionVote";
import { closeElection } from "../callable/closeElection";
import { saveMeetingMinutes } from "../callable/saveMeetingMinutes";
import { approveMeetingMinutes } from "../callable/approveMeetingMinutes";
import { generateIntergroupReport } from "../callable/generateIntergroupReport";

// ===========================================================================
// saveBylawDraft
// ===========================================================================
describe("saveBylawDraft", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    firestoreCollections = {};
    setupAdminMembersCollection();
    setupGroupsCollection();

    // group_bylaws collection — no existing doc
    const bylawCol = makeCollectionChain();
    bylawCol.doc = jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue({ exists: false }),
      set: mockDocSet,
      update: mockDocUpdate,
    });
    firestoreCollections["group_bylaws"] = bylawCol;
  });

  test("throws unauthenticated if no auth", async () => {
    const req = makeRequest(
      { groupId: "group123", title: "T", content: "C" },
      null,
    );
    await expect(saveBylawDraft(req as any)).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  test("throws invalid-argument if groupId missing", async () => {
    const req = makeRequest({ title: "T", content: "C" });
    await expect(saveBylawDraft(req as any)).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  test("throws invalid-argument if title missing", async () => {
    const req = makeRequest({ groupId: "group123", content: "C" });
    await expect(saveBylawDraft(req as any)).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  test("throws invalid-argument if content missing", async () => {
    const req = makeRequest({ groupId: "group123", title: "T" });
    await expect(saveBylawDraft(req as any)).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  test("throws permission-denied if caller is not admin", async () => {
    setupAdminMembersCollection("regular_user", ["member"]);
    const req = makeRequest(
      { groupId: "group123", title: "T", content: "C" },
      "regular_user",
    );
    await expect(saveBylawDraft(req as any)).rejects.toMatchObject({
      code: "permission-denied",
    });
  });

  test("creates new bylaw draft document", async () => {
    const req = makeRequest({
      groupId: "group123",
      title: "Home Group Guidelines",
      content: "1. We meet weekly.",
    });
    const result = await saveBylawDraft(req as any);

    expect(result).toHaveProperty("bylawId");
    expect(mockDocSet).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: "group123",
        title: "Home Group Guidelines",
        content: "1. We meet weekly.",
        status: "draft",
        version: 0,
      }),
    );
  });

  test("updates existing bylaw draft (idempotent)", async () => {
    setupGroupsCollection();
    const bylawCol = makeCollectionChain();
    bylawCol.doc = jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue({
        exists: true,
        data: () => ({
          groupId: "group123",
          version: 1,
          status: "ratified",
          createdAt: "TS",
          createdBy: "admin_user_1",
        }),
      }),
      set: mockDocSet,
      update: mockDocUpdate,
    });
    firestoreCollections["group_bylaws"] = bylawCol;

    const req = makeRequest({
      groupId: "group123",
      title: "Updated Title",
      content: "Updated content",
    });
    const result = await saveBylawDraft(req as any);

    expect(result).toHaveProperty("bylawId");
    // When doc exists, saveBylawDraft uses .update() to preserve version/createdAt
    expect(mockDocUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "draft",
      }),
    );
  });
});

// ===========================================================================
// ratifyBylaws
// ===========================================================================
describe("ratifyBylaws", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    firestoreCollections = {};

    // Members — admin doc lookup + where query for FCM
    firestoreCollections["members"] = {
      ...makeCollectionChain([{ userId: "admin_user_1" }]),
      where: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({
        docs: [
          {
            data: () => ({ userId: "admin_user_1" }),
            id: "group123_admin_user_1",
          },
        ],
      }),
      doc: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue(makeAdminMemberDoc()),
      }),
    };

    setupUsersCollection();
    setupGroupsCollection();

    // Existing bylaw doc at version 1
    const bylawRef = {
      get: jest.fn().mockResolvedValue({
        exists: true,
        data: () => ({
          groupId: "group123",
          groupName: "Test Group",
          title: "Guidelines",
          content: "v1 content",
          version: 1,
          status: "draft",
          createdBy: "admin_user_1",
          createdAt: "TS",
        }),
      }),
      set: mockDocSet,
      update: mockDocUpdate,
      collection: jest.fn().mockReturnValue({
        doc: jest.fn().mockReturnValue({ set: mockDocSet }),
      }),
    };
    const bylawCol = makeCollectionChain();
    bylawCol.doc = jest.fn().mockReturnValue(bylawRef);
    firestoreCollections["group_bylaws"] = bylawCol;

    // Passing conscience vote
    const voteCol = makeCollectionChain();
    voteCol.doc = jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue({
        exists: true,
        data: () => ({
          groupId: "group123",
          status: "closed",
          result: { winner: "Yes" },
        }),
      }),
    });
    firestoreCollections["group_conscience_votes"] = voteCol;
  });

  test("throws unauthenticated if no auth", async () => {
    const req = makeRequest({ groupId: "group123", voteId: "vote123" }, null);
    await expect(ratifyBylaws(req as any)).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  test("throws invalid-argument if voteId missing", async () => {
    const req = makeRequest({ groupId: "group123" });
    await expect(ratifyBylaws(req as any)).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  test("throws permission-denied if non-admin tries to ratify", async () => {
    setupAdminMembersCollection("regular_user", ["member"]);
    const req = makeRequest(
      { groupId: "group123", voteId: "vote123" },
      "regular_user",
    );
    await expect(ratifyBylaws(req as any)).rejects.toMatchObject({
      code: "permission-denied",
    });
  });

  test("throws failed-precondition if vote did not pass", async () => {
    const voteCol = makeCollectionChain();
    voteCol.doc = jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue({
        exists: true,
        data: () => ({
          groupId: "group123",
          status: "closed",
          result: { winner: "No" },
        }),
      }),
    });
    firestoreCollections["group_conscience_votes"] = voteCol;

    const req = makeRequest({ groupId: "group123", voteId: "vote123" });
    await expect(ratifyBylaws(req as any)).rejects.toMatchObject({
      code: "failed-precondition",
    });
  });

  test("throws already-exists when same voteId is used twice (legacy ratifyingVoteId check)", async () => {
    // Set up bylaw doc that already has ratifyingVoteId = "vote123" (legacy field)
    const bylawRef = {
      get: jest.fn().mockResolvedValue({
        exists: true,
        data: () => ({
          groupId: "group123",
          groupName: "Test Group",
          title: "Guidelines",
          content: "v1 content",
          version: 1,
          status: "ratified",
          ratifyingVoteId: "vote123",
          createdBy: "admin_user_1",
          createdAt: "TS",
        }),
      }),
      set: mockDocSet,
      update: mockDocUpdate,
      collection: jest.fn().mockReturnValue({
        doc: jest.fn().mockReturnValue({ set: mockDocSet }),
      }),
    };
    const bylawCol = makeCollectionChain();
    bylawCol.doc = jest.fn().mockReturnValue(bylawRef);
    firestoreCollections["group_bylaws"] = bylawCol;

    const req = makeRequest({ groupId: "group123", voteId: "vote123" });
    await expect(ratifyBylaws(req as any)).rejects.toMatchObject({
      code: "already-exists",
    });
  });

  test("ratifies bylaws successfully", async () => {
    const req = makeRequest({ groupId: "group123", voteId: "vote123" });
    const result = await ratifyBylaws(req as any);

    expect(result).toHaveProperty("version");
    // ratifyBylaws uses .update() on the bylaw ref
    expect(mockDocUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "ratified",
        ratifyingVoteId: "vote123",
      }),
    );
  });
});

// ===========================================================================
// openElection
// ===========================================================================
describe("openElection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    firestoreCollections = {};
    setupAdminMembersCollection();
    setupUsersCollection();

    // Service position
    const groupsCol = makeCollectionChain();
    groupsCol.doc = jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue(makeGroupDoc()),
      collection: jest.fn().mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({
            exists: true,
            data: () => ({ name: "Secretary", groupId: "group123" }),
          }),
        }),
      }),
    });
    firestoreCollections["groups"] = groupsCol;

    const electionsCol = makeCollectionChain();
    electionsCol.doc = jest.fn().mockReturnValue({
      id: "election123",
      set: mockDocSet,
    });
    firestoreCollections["group_elections"] = electionsCol;

    firestoreCollections["members"] = {
      ...makeCollectionChain([{ userId: "admin_user_1" }]),
      where: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({
        docs: [
          {
            data: () => ({ userId: "admin_user_1" }),
            id: "group123_admin_user_1",
          },
        ],
      }),
      doc: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue(makeAdminMemberDoc()),
      }),
    };
  });

  test("throws unauthenticated if no auth", async () => {
    const req = makeRequest(
      { groupId: "group123", positionId: "pos123" },
      null,
    );
    await expect(openElection(req as any)).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  test("throws invalid-argument if positionId missing", async () => {
    const req = makeRequest({ groupId: "group123" });
    await expect(openElection(req as any)).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  test("throws permission-denied if non-admin", async () => {
    setupAdminMembersCollection("regular_user", ["member"]);
    const req = makeRequest(
      { groupId: "group123", positionId: "pos123" },
      "regular_user",
    );
    await expect(openElection(req as any)).rejects.toMatchObject({
      code: "permission-denied",
    });
  });

  test("creates election with nominations_open status", async () => {
    const req = makeRequest({ groupId: "group123", positionId: "pos123" });
    const result = await openElection(req as any);

    expect(result).toHaveProperty("electionId");
    expect(mockDocSet).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: "group123",
        positionId: "pos123",
        status: "nominations_open",
        nominees: [],
        votes: {},
      }),
    );
  });
});

// ===========================================================================
// openElectionVoting
// ===========================================================================
describe("openElectionVoting", () => {
  function setupOpenElectionVotingCollections(
    electionStatus: string = "nominations_open",
  ) {
    firestoreCollections["members"] = {
      ...makeCollectionChain([{ userId: "admin_user_1" }]),
      where: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({
        docs: [
          {
            data: () => ({ userId: "admin_user_1" }),
            id: "group123_admin_user_1",
          },
        ],
      }),
      doc: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue(makeAdminMemberDoc()),
      }),
    };

    const electionsCol = makeCollectionChain();
    electionsCol.doc = jest.fn().mockReturnValue({
      id: "election123",
      get: jest.fn().mockResolvedValue({
        exists: true,
        data: () => ({
          id: "election123",
          groupId: "group123",
          positionName: "Secretary",
          groupName: "Test Group",
          status: electionStatus,
          nominees: [],
          votes: {},
        }),
      }),
      update: mockDocUpdate,
    });
    firestoreCollections["group_elections"] = electionsCol;

    setupUsersCollection();
    setupGroupsCollection();
  }

  beforeEach(() => {
    jest.clearAllMocks();
    firestoreCollections = {};
    setupOpenElectionVotingCollections();
  });

  test("throws unauthenticated if no auth", async () => {
    const req = makeRequest(
      { electionId: "election123", groupId: "group123" },
      null,
    );
    await expect(openElectionVoting(req as any)).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  test("throws permission-denied if caller is not a group admin", async () => {
    firestoreCollections["members"] = {
      ...makeCollectionChain([{ userId: "regular_user" }]),
      where: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({
        docs: [
          {
            data: () => ({ userId: "regular_user" }),
            id: "group123_regular_user",
          },
        ],
      }),
      doc: jest.fn().mockReturnValue({
        get: jest
          .fn()
          .mockResolvedValue(makeMemberDoc("regular_user", ["member"])),
      }),
    };
    const req = makeRequest(
      { electionId: "election123", groupId: "group123" },
      "regular_user",
    );
    await expect(openElectionVoting(req as any)).rejects.toMatchObject({
      code: "permission-denied",
    });
  });

  test("throws failed-precondition when election status is voting_open", async () => {
    setupOpenElectionVotingCollections("voting_open");
    const req = makeRequest({ electionId: "election123", groupId: "group123" });
    await expect(openElectionVoting(req as any)).rejects.toMatchObject({
      code: "failed-precondition",
    });
  });

  test("throws failed-precondition when election status is closed", async () => {
    setupOpenElectionVotingCollections("closed");
    const req = makeRequest({ electionId: "election123", groupId: "group123" });
    await expect(openElectionVoting(req as any)).rejects.toMatchObject({
      code: "failed-precondition",
    });
  });

  test("successfully transitions nominations_open election to voting_open", async () => {
    const req = makeRequest({ electionId: "election123", groupId: "group123" });
    const result = await openElectionVoting(req as any);

    expect(result).toEqual({ success: true });
    expect(mockDocUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "voting_open",
        votingOpenAt: "SERVER_TIMESTAMP",
      }),
    );
  });
});

// ===========================================================================
// nominateForElection
// ===========================================================================
describe("nominateForElection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    firestoreCollections = {};

    // Election doc — nominations open, no nominees yet
    const electionsCol = makeCollectionChain();
    electionsCol.doc = jest.fn().mockReturnValue({
      id: "election123",
      get: jest.fn().mockResolvedValue({
        exists: true,
        data: () => ({
          id: "election123",
          groupId: "group123",
          positionName: "Secretary",
          status: "nominations_open",
          nominees: [],
          votes: {},
        }),
      }),
      update: mockDocUpdate,
    });
    firestoreCollections["group_elections"] = electionsCol;

    // Both caller and nominee are members
    const membersCol = makeCollectionChain();
    membersCol.doc = jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue(makeMemberDoc("admin_user_1")),
    });
    firestoreCollections["members"] = membersCol;

    setupUsersCollection();
  });

  test("throws unauthenticated if no auth", async () => {
    const req = makeRequest(
      { electionId: "election123", nomineeUserId: "admin_user_1" },
      null,
    );
    await expect(nominateForElection(req as any)).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  test("throws invalid-argument if electionId missing", async () => {
    const req = makeRequest({ nomineeUserId: "admin_user_1" });
    await expect(nominateForElection(req as any)).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  test("throws failed-precondition if nominations are not open", async () => {
    const electionsCol = makeCollectionChain();
    electionsCol.doc = jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue({
        exists: true,
        data: () => ({
          id: "election123",
          groupId: "group123",
          positionName: "Secretary",
          status: "voting_open",
          nominees: [],
        }),
      }),
    });
    firestoreCollections["group_elections"] = electionsCol;

    const req = makeRequest({
      electionId: "election123",
      nomineeUserId: "admin_user_1",
    });
    await expect(nominateForElection(req as any)).rejects.toMatchObject({
      code: "failed-precondition",
    });
  });

  test("nominates successfully and appends nominee", async () => {
    const req = makeRequest({
      electionId: "election123",
      nomineeUserId: "admin_user_1",
    });
    const result = await nominateForElection(req as any);

    expect(result).toEqual({ success: true });
    expect(mockDocUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        nominees: expect.anything(),
      }),
    );
  });
});

// ===========================================================================
// castElectionVote
// ===========================================================================
describe("castElectionVote", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    firestoreCollections = {};

    const electionsCol = makeCollectionChain();
    electionsCol.doc = jest.fn().mockReturnValue({
      id: "election123",
      get: jest.fn().mockResolvedValue({
        exists: true,
        data: () => ({
          id: "election123",
          groupId: "group123",
          positionName: "Secretary",
          status: "voting_open",
          nominees: [
            {
              userId: "nominee_1",
              displayName: "Jane D.",
              withdrawn: false,
            },
          ],
          votes: {},
        }),
      }),
      update: mockDocUpdate,
    });
    firestoreCollections["group_elections"] = electionsCol;

    const membersCol = makeCollectionChain();
    membersCol.doc = jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue(makeMemberDoc("admin_user_1")),
    });
    firestoreCollections["members"] = membersCol;
  });

  test("throws unauthenticated if no auth", async () => {
    const req = makeRequest(
      { electionId: "election123", nomineeUserId: "nominee_1" },
      null,
    );
    await expect(castElectionVote(req as any)).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  test("throws failed-precondition if election is not in voting_open", async () => {
    const electionsCol = makeCollectionChain();
    electionsCol.doc = jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue({
        exists: true,
        data: () => ({
          groupId: "group123",
          status: "nominations_open",
          nominees: [],
          votes: {},
        }),
      }),
    });
    firestoreCollections["group_elections"] = electionsCol;

    const req = makeRequest({
      electionId: "election123",
      nomineeUserId: "nominee_1",
    });
    await expect(castElectionVote(req as any)).rejects.toMatchObject({
      code: "failed-precondition",
    });
  });

  test("throws invalid-argument if nominee is not in election", async () => {
    const req = makeRequest({
      electionId: "election123",
      nomineeUserId: "not_in_election",
    });
    await expect(castElectionVote(req as any)).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  test("records vote successfully", async () => {
    const req = makeRequest(
      { electionId: "election123", nomineeUserId: "nominee_1" },
      "admin_user_1",
    );
    const result = await castElectionVote(req as any);

    expect(result).toEqual({ success: true });
    expect(mockDocUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        "votes.admin_user_1": "nominee_1",
      }),
    );
  });

  test("allows changing vote (idempotent)", async () => {
    const electionsCol = makeCollectionChain();
    electionsCol.doc = jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue({
        exists: true,
        data: () => ({
          groupId: "group123",
          status: "voting_open",
          nominees: [
            { userId: "nominee_1", displayName: "Jane", withdrawn: false },
            { userId: "nominee_2", displayName: "Bob", withdrawn: false },
          ],
          votes: { admin_user_1: "nominee_2" },
        }),
      }),
      update: mockDocUpdate,
    });
    firestoreCollections["group_elections"] = electionsCol;

    const req = makeRequest(
      { electionId: "election123", nomineeUserId: "nominee_1" },
      "admin_user_1",
    );
    const result = await castElectionVote(req as any);
    expect(result).toEqual({ success: true });
    expect(mockDocUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ "votes.admin_user_1": "nominee_1" }),
    );
  });
});

// ===========================================================================
// closeElection
// ===========================================================================
describe("closeElection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    firestoreCollections = {};

    setupAdminMembersCollection();
    setupUsersCollection();

    const electionsCol = makeCollectionChain();
    electionsCol.doc = jest.fn().mockReturnValue({
      id: "election123",
      get: jest.fn().mockResolvedValue({
        exists: true,
        data: () => ({
          id: "election123",
          groupId: "group123",
          positionId: "pos123",
          positionName: "Secretary",
          status: "voting_open",
          nominees: [
            { userId: "nominee_1", displayName: "Jane D.", withdrawn: false },
            { userId: "nominee_2", displayName: "Bob M.", withdrawn: false },
          ],
          votes: {
            user1: "nominee_1",
            user2: "nominee_1",
            user3: "nominee_2",
          },
        }),
      }),
      update: mockDocUpdate,
    });
    firestoreCollections["group_elections"] = electionsCol;

    firestoreCollections["members"] = {
      ...makeCollectionChain([{ userId: "admin_user_1" }]),
      where: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({
        docs: [
          {
            data: () => ({ userId: "admin_user_1" }),
            id: "group123_admin_user_1",
          },
        ],
      }),
      doc: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue(makeAdminMemberDoc()),
      }),
    };

    setupGroupsCollection();
  });

  test("throws unauthenticated if no auth", async () => {
    const req = makeRequest({ electionId: "election123" }, null);
    await expect(closeElection(req as any)).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  test("throws invalid-argument if electionId missing", async () => {
    const req = makeRequest({});
    await expect(closeElection(req as any)).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  test("throws permission-denied if non-admin closes election", async () => {
    setupAdminMembersCollection("regular_user", ["member"]);
    const req = makeRequest({ electionId: "election123" }, "regular_user");
    await expect(closeElection(req as any)).rejects.toMatchObject({
      code: "permission-denied",
    });
  });

  test("throws failed-precondition when election status is nominations_open", async () => {
    const nominationsOpenElectionsCol = makeCollectionChain();
    nominationsOpenElectionsCol.doc = jest.fn().mockReturnValue({
      id: "election123",
      get: jest.fn().mockResolvedValue({
        exists: true,
        data: () => ({
          id: "election123",
          groupId: "group123",
          positionId: "pos123",
          positionName: "Secretary",
          status: "nominations_open",
          nominees: [],
          votes: {},
        }),
      }),
      update: mockDocUpdate,
    });
    firestoreCollections["group_elections"] = nominationsOpenElectionsCol;

    const req = makeRequest({ electionId: "election123" });
    await expect(closeElection(req as any)).rejects.toMatchObject({
      code: "failed-precondition",
    });
  });

  test("tallies votes and determines winner (nominee_1 wins 2-1)", async () => {
    const req = makeRequest({ electionId: "election123" });
    const result = await closeElection(req as any);

    expect(result.winnerId).toBe("nominee_1");
    expect(result.winnerName).toBe("Jane D.");
    expect(result.tied).toBe(false);
    expect(mockDocUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "closed",
        result: expect.objectContaining({
          winnerId: "nominee_1",
          tied: false,
        }),
      }),
    );
  });

  test("detects tie when votes are equal", async () => {
    const tiedElectionsCol = makeCollectionChain();
    tiedElectionsCol.doc = jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue({
        exists: true,
        data: () => ({
          groupId: "group123",
          positionId: "pos123",
          positionName: "Secretary",
          status: "voting_open",
          nominees: [
            { userId: "nominee_1", displayName: "Jane", withdrawn: false },
            { userId: "nominee_2", displayName: "Bob", withdrawn: false },
          ],
          votes: { user1: "nominee_1", user2: "nominee_2" },
        }),
      }),
      update: mockDocUpdate,
    });
    firestoreCollections["group_elections"] = tiedElectionsCol;

    const req = makeRequest({ electionId: "election123" });
    const result = await closeElection(req as any);

    expect(result.tied).toBe(true);
    expect(result.winnerId).toBeNull();
  });
});

// ===========================================================================
// saveMeetingMinutes
// ===========================================================================
describe("saveMeetingMinutes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    firestoreCollections = {};

    setupAdminMembersCollection();
    setupGroupsCollection();

    // business_meetings collection
    const meetingsCol = makeCollectionChain();
    meetingsCol.doc = jest.fn().mockReturnValue({
      id: "meeting123",
      get: jest.fn().mockResolvedValue({
        exists: true,
        data: () => ({
          id: "meeting123",
          groupId: "group123",
          groupName: "Test Group",
          date: { toDate: () => new Date(), toMillis: () => Date.now() },
        }),
      }),
      collection: jest.fn().mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ exists: false }),
          set: mockDocSet,
        }),
      }),
    });
    firestoreCollections["business_meetings"] = meetingsCol;
  });

  test("throws unauthenticated if no auth", async () => {
    const req = makeRequest(
      { businessMeetingId: "meeting123", groupId: "group123", minutes: {} },
      null,
    );
    await expect(saveMeetingMinutes(req as any)).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  test("throws invalid-argument if businessMeetingId missing", async () => {
    const req = makeRequest({ groupId: "group123", minutes: {} });
    await expect(saveMeetingMinutes(req as any)).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  test("throws permission-denied if user is not secretary or admin", async () => {
    setupAdminMembersCollection("regular_user", ["member"]);
    const req = makeRequest(
      {
        businessMeetingId: "meeting123",
        groupId: "group123",
        minutes: { chair: "Jane" },
      },
      "regular_user",
    );
    await expect(saveMeetingMinutes(req as any)).rejects.toMatchObject({
      code: "permission-denied",
    });
  });

  test("saves minutes as draft", async () => {
    const req = makeRequest({
      businessMeetingId: "meeting123",
      groupId: "group123",
      minutes: {
        chair: "Jane D.",
        secretary: "Bob M.",
        attendanceCount: 12,
        memberQuorum: true,
        openingPrayer: true,
        closingPrayer: true,
        agendaItems: [],
        decisions: [],
      },
    });

    const result = await saveMeetingMinutes(req as any);
    expect(result).toEqual({ success: true });
    expect(mockDocSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "draft",
        businessMeetingId: "meeting123",
        groupId: "group123",
      }),
    );
  });

  test("secretary (non-admin) can save minutes", async () => {
    setupAdminMembersCollection("secretary_user", ["secretary"]);
    setupGroupsCollection();
    const req = makeRequest(
      {
        businessMeetingId: "meeting123",
        groupId: "group123",
        minutes: {
          chair: "Jane",
          secretary: "Secretary User",
          attendanceCount: 10,
          memberQuorum: false,
          openingPrayer: false,
          closingPrayer: false,
          agendaItems: [],
          decisions: [],
        },
      },
      "secretary_user",
    );
    const result = await saveMeetingMinutes(req as any);
    expect(result).toEqual({ success: true });
  });
});

// ===========================================================================
// approveMeetingMinutes
// ===========================================================================
describe("approveMeetingMinutes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    firestoreCollections = {};

    setupAdminMembersCollection();
    setupUsersCollection();
    setupGroupsCollection();

    const meetingsCol = makeCollectionChain();
    meetingsCol.doc = jest.fn().mockReturnValue({
      id: "meeting123",
      collection: jest.fn().mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({
            exists: true,
            data: () => ({
              businessMeetingId: "meeting123",
              groupId: "group123",
              groupName: "Test Group",
              status: "draft",
              date: { toDate: () => new Date(), toMillis: () => Date.now() },
            }),
          }),
          update: mockDocUpdate,
        }),
      }),
    });
    firestoreCollections["business_meetings"] = meetingsCol;

    firestoreCollections["members"] = {
      ...makeCollectionChain([{ userId: "admin_user_1" }]),
      where: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({
        docs: [
          {
            data: () => ({ userId: "admin_user_1" }),
            id: "group123_admin_user_1",
          },
        ],
      }),
      doc: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue(makeAdminMemberDoc()),
      }),
    };
  });

  test("throws unauthenticated if no auth", async () => {
    const req = makeRequest(
      { businessMeetingId: "meeting123", groupId: "group123" },
      null,
    );
    await expect(approveMeetingMinutes(req as any)).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  test("throws invalid-argument if businessMeetingId missing", async () => {
    const req = makeRequest({ groupId: "group123" });
    await expect(approveMeetingMinutes(req as any)).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  test("throws permission-denied if non-admin tries to approve", async () => {
    setupAdminMembersCollection("regular_user", ["member"]);
    const req = makeRequest(
      { businessMeetingId: "meeting123", groupId: "group123" },
      "regular_user",
    );
    await expect(approveMeetingMinutes(req as any)).rejects.toMatchObject({
      code: "permission-denied",
    });
  });

  test("approves minutes successfully", async () => {
    const req = makeRequest({
      businessMeetingId: "meeting123",
      groupId: "group123",
    });
    const result = await approveMeetingMinutes(req as any);

    expect(result).toEqual({ success: true });
    expect(mockDocUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "approved",
        approvedBy: "admin_user_1",
      }),
    );
  });

  test("throws permission-denied when businessMeetingId belongs to a different groupId", async () => {
    // Minutes doc has groupId = "group999" (different group)
    const meetingsCol = makeCollectionChain();
    meetingsCol.doc = jest.fn().mockReturnValue({
      id: "meeting123",
      collection: jest.fn().mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({
            exists: true,
            data: () => ({
              businessMeetingId: "meeting123",
              groupId: "group999",
              groupName: "Other Group",
              status: "draft",
              date: { toDate: () => new Date(), toMillis: () => Date.now() },
            }),
          }),
          update: mockDocUpdate,
        }),
      }),
    });
    firestoreCollections["business_meetings"] = meetingsCol;

    const req = makeRequest({
      businessMeetingId: "meeting123",
      groupId: "group123",
    });
    await expect(approveMeetingMinutes(req as any)).rejects.toMatchObject({
      code: "permission-denied",
    });
  });
});

// ===========================================================================
// generateIntergroupReport
// ===========================================================================
describe("generateIntergroupReport", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    firestoreCollections = {};

    setupAdminMembersCollection();

    // Groups collection with subcollections
    const groupsCol = makeCollectionChain();
    groupsCol.doc = jest.fn().mockReturnValue({
      id: "group123",
      get: jest.fn().mockResolvedValue({
        exists: true,
        data: () => ({
          name: "Test Group",
          type: "AA",
          location: "123 Main St",
          admins: ["admin_user_1"],
          subscriptionStatus: "active",
        }),
      }),
      collection: jest.fn().mockImplementation((subcol: string) => {
        if (subcol === "servicePositions") {
          return makeCollectionChain([
            {
              id: "pos1",
              name: "Secretary",
              currentHolderName: "Jane D.",
              currentHolderId: "user1",
            },
            {
              id: "pos2",
              name: "Treasurer",
              currentHolderName: "Bob M.",
              currentHolderId: "user2",
            },
          ]);
        }
        if (subcol === "milestones") {
          return makeCollectionChain([]);
        }
        return makeCollectionChain();
      }),
    });
    firestoreCollections["groups"] = groupsCol;

    // Treasury transactions
    const treasuryCol = makeCollectionChain([]);
    treasuryCol.where = jest.fn().mockReturnThis();
    treasuryCol.get = jest.fn().mockResolvedValue({ docs: [] });
    firestoreCollections["treasury_transactions"] = treasuryCol;

    // Meeting instances
    const instancesCol = makeCollectionChain([]);
    instancesCol.where = jest.fn().mockReturnThis();
    instancesCol.get = jest.fn().mockResolvedValue({ docs: [] });
    firestoreCollections["meeting_instances"] = instancesCol;

    // Intergroup reports
    const reportsCol = makeCollectionChain();
    reportsCol.doc = jest.fn().mockReturnValue({
      id: "group123_2026-01",
      get: jest.fn().mockResolvedValue({ exists: false }),
      set: mockDocSet,
    });
    firestoreCollections["intergroup_reports"] = reportsCol;
  });

  test("throws unauthenticated if no auth", async () => {
    const req = makeRequest(
      { groupId: "group123", reportMonth: "2026-01" },
      null,
    );
    await expect(generateIntergroupReport(req as any)).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  test("throws invalid-argument if groupId missing", async () => {
    const req = makeRequest({ reportMonth: "2026-01" });
    await expect(generateIntergroupReport(req as any)).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  test("throws invalid-argument if reportMonth missing", async () => {
    const req = makeRequest({ groupId: "group123" });
    await expect(generateIntergroupReport(req as any)).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  test("throws permission-denied if non-admin generates report", async () => {
    const req = makeRequest(
      { groupId: "group123", reportMonth: "2026-01" },
      "regular_user",
    );
    await expect(generateIntergroupReport(req as any)).rejects.toMatchObject({
      code: "permission-denied",
    });
  });

  test("generates report with populated officers", async () => {
    const req = makeRequest({ groupId: "group123", reportMonth: "2026-01" });
    const result = await generateIntergroupReport(req as any);

    expect(result).toHaveProperty("reportId");
    expect(result).toHaveProperty("reportData");
    expect(result.reportData.groupId).toBe("group123");
    expect(result.reportData.reportMonth).toBe("2026-01");
    expect(result.reportData.status).toBe("draft");
    expect(result.reportData.officers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          positionName: "Secretary",
          holderName: "Jane D.",
        }),
      ]),
    );

    expect(mockDocSet).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: "group123",
        reportMonth: "2026-01",
        status: "draft",
      }),
      expect.anything(),
    );
  });

  test("generates report ID as groupId_reportMonth", async () => {
    const req = makeRequest({ groupId: "group123", reportMonth: "2026-02" });
    const reportsCol = makeCollectionChain();
    reportsCol.doc = jest.fn().mockReturnValue({
      id: "group123_2026-02",
      get: jest.fn().mockResolvedValue({ exists: false }),
      set: mockDocSet,
    });
    firestoreCollections["intergroup_reports"] = reportsCol;

    const result = await generateIntergroupReport(req as any);
    expect(result.reportId).toBe("group123_2026-02");
  });
});
