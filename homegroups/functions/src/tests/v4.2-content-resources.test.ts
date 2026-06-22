/* eslint-disable */
// @ts-nocheck
/**
 * V4.2 Content & Resources Cloud Functions Tests
 *
 * Tests for:
 *   - postGroupDailyThought
 *   - contributeLiterature
 *   - saveLiteratureItem
 *   - bookmarkLiteratureForGroup
 *   - contributeMeetingTopic
 *   - favoriteGroupTopic
 *   - deleteGroupResource
 *
 * Run with: cd functions && npx jest src/tests/v4.2-content-resources.test.ts --no-coverage
 */

// ---------------------------------------------------------------------------
// Firebase Admin mock
// ---------------------------------------------------------------------------
const mockServerTimestamp = jest.fn(() => "SERVER_TIMESTAMP");
const mockArrayUnion = jest.fn((...args: any[]) => ({ __arrayUnion: args }));
const mockArrayRemove = jest.fn((...args: any[]) => ({ __arrayRemove: args }));
const mockIncrement = jest.fn((n: number) => ({ __increment: n }));

const mockDocGet = jest.fn();
const mockDocSet = jest.fn().mockResolvedValue(undefined);
const mockDocUpdate = jest.fn().mockResolvedValue(undefined);
const mockDocDelete = jest.fn().mockResolvedValue(undefined);
const mockDocAdd = jest.fn().mockResolvedValue({ id: "newDocId" });

const mockDocRef = {
  id: "doc123",
  set: mockDocSet,
  update: mockDocUpdate,
  get: mockDocGet,
  delete: mockDocDelete,
};

function makeCollectionChain(docs: any[] = []) {
  return {
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue({
      docs: docs.map((d) => ({
        data: () => d,
        id: d.id || "id",
        ref: { id: d.id || "id", delete: mockDocDelete },
      })),
      empty: docs.length === 0,
    }),
    doc: jest.fn().mockReturnValue(mockDocRef),
    add: mockDocAdd,
  };
}

let firestoreCollections: Record<string, any> = {};

const mockBatch = {
  set: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  commit: jest.fn().mockResolvedValue(undefined),
};

const mockFirestore = {
  collection: jest.fn((path: string) => {
    if (firestoreCollections[path]) {
      return firestoreCollections[path];
    }
    return makeCollectionChain();
  }),
  doc: jest.fn().mockReturnValue(mockDocRef),
  batch: jest.fn(() => mockBatch),
  FieldValue: {
    serverTimestamp: mockServerTimestamp,
    arrayUnion: mockArrayUnion,
    arrayRemove: mockArrayRemove,
    increment: mockIncrement,
    delete: jest.fn(() => "DELETE_SENTINEL"),
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

const mockStorageBucket = {
  file: jest.fn().mockReturnValue({
    delete: jest.fn().mockResolvedValue(undefined),
    exists: jest.fn().mockResolvedValue([true]),
  }),
};

const mockStorage = jest.fn(() => ({
  bucket: jest.fn(() => mockStorageBucket),
}));

jest.mock("firebase-admin", () => ({
  firestore: Object.assign(() => mockFirestore, {
    FieldValue: mockFirestore.FieldValue,
    Timestamp: mockFirestore.Timestamp,
  }),
  storage: mockStorage,
  apps: [true],
  initializeApp: jest.fn(),
  credential: { applicationDefault: jest.fn() },
}));

jest.mock("../utils/firebase", () => ({
  db: mockFirestore,
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
// Helper to build a fake CallableRequest
// ---------------------------------------------------------------------------
function makeRequest(
  data: any,
  uid: string | null = "user_1",
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
import { postGroupDailyThought } from "../callable/postGroupDailyThought";
import { contributeLiterature } from "../callable/contributeLiterature";
import { saveLiteratureItem } from "../callable/saveLiteratureItem";
import { bookmarkLiteratureForGroup } from "../callable/bookmarkLiteratureForGroup";
import { contributeMeetingTopic } from "../callable/contributeMeetingTopic";
import { favoriteGroupTopic } from "../callable/favoriteGroupTopic";
import { deleteGroupResource } from "../callable/deleteGroupResource";
import { seedDailyReflections } from "../callable/seedDailyReflections";

// ---------------------------------------------------------------------------
// Helper data factories
// ---------------------------------------------------------------------------
function makeAdminMemberDoc() {
  return {
    exists: true,
    data: () => ({ isAdmin: true, userId: "admin_1", groupId: "group_1" }),
  };
}

function makeAdminUserDoc() {
  return {
    exists: true,
    data: () => ({ uid: "admin_1", role: "admin" }),
  };
}

function makeNonAdminMemberDoc() {
  return {
    exists: true,
    data: () => ({ isAdmin: false, userId: "user_1", groupId: "group_1" }),
  };
}

function makeMissingDoc() {
  return { exists: false, data: () => null };
}

function makeLiteratureDoc(overrides: any = {}) {
  return {
    exists: true,
    id: "lit_1",
    data: () => ({
      id: "lit_1",
      title: "How It Works",
      isApproved: true,
      saveCount: 5,
      source: "contributed",
      ...overrides,
    }),
  };
}

function makeResourceDoc(overrides: any = {}) {
  return {
    exists: true,
    id: "res_1",
    data: () => ({
      id: "res_1",
      groupId: "group_1",
      title: "Meeting Handout",
      source: "upload",
      storageRef: "groups/group_1/resources/handout.pdf",
      isActive: true,
      uploadedBy: "admin_1",
      ...overrides,
    }),
    ref: { update: mockDocUpdate },
  };
}

// ---------------------------------------------------------------------------
// Reset mocks between tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  jest.clearAllMocks();
  firestoreCollections = {};

  // Default: doc references resolve to mockDocRef
  mockFirestore.collection.mockImplementation((path: string) => {
    if (firestoreCollections[path]) return firestoreCollections[path];
    return makeCollectionChain();
  });

  mockDocGet.mockResolvedValue(makeMissingDoc());
  mockDocSet.mockResolvedValue(undefined);
  mockDocUpdate.mockResolvedValue(undefined);
  mockDocDelete.mockResolvedValue(undefined);
  mockDocAdd.mockResolvedValue({ id: "newDocId" });
});

// ===========================================================================
// postGroupDailyThought
// ===========================================================================
describe("postGroupDailyThought", () => {
  it("throws unauthenticated if no auth", async () => {
    const req = makeRequest({ groupId: "group_1", content: "Hello" }, null);
    await expect(postGroupDailyThought(req)).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  it("throws permission-denied if not an admin", async () => {
    mockDocGet.mockResolvedValue(makeNonAdminMemberDoc());
    const req = makeRequest({ groupId: "group_1", content: "Hello" }, "user_1");
    await expect(postGroupDailyThought(req)).rejects.toMatchObject({
      code: "permission-denied",
    });
  });

  it("throws invalid-argument if content is empty", async () => {
    mockDocGet.mockResolvedValue(makeAdminMemberDoc());
    const req = makeRequest({ groupId: "group_1", content: "  " }, "admin_1");
    await expect(postGroupDailyThought(req)).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  it("throws invalid-argument if content exceeds 500 chars", async () => {
    mockDocGet.mockResolvedValue(makeAdminMemberDoc());
    const req = makeRequest(
      { groupId: "group_1", content: "x".repeat(501) },
      "admin_1",
    );
    await expect(postGroupDailyThought(req)).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  it("upserts the daily thought and returns thoughtId", async () => {
    const thoughtDocRef = { ...mockDocRef, id: "2026-02-23", set: mockDocSet };
    const memberRef = {
      ...mockDocRef,
      get: jest.fn().mockResolvedValue(makeAdminMemberDoc()),
    };

    firestoreCollections["members"] = {
      ...makeCollectionChain(),
      doc: jest.fn().mockReturnValue(memberRef),
    };

    // groups/{groupId}/dailyThoughts/{date} requires subcollection support
    firestoreCollections["groups"] = {
      doc: jest.fn().mockReturnValue({
        collection: jest.fn().mockReturnValue({
          doc: jest.fn().mockReturnValue(thoughtDocRef),
        }),
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => ({ subscriptionStatus: "active" }),
        }),
      }),
    };

    const req = makeRequest(
      { groupId: "group_1", content: "Keep coming back" },
      "admin_1",
    );
    const result = await postGroupDailyThought(req);
    expect(result).toHaveProperty("thoughtId");
  });
});

// ===========================================================================
// contributeLiterature
// ===========================================================================
describe("contributeLiterature", () => {
  it("throws unauthenticated if no auth", async () => {
    const req = makeRequest(
      { title: "My Article", summary: "Great piece" },
      null,
    );
    await expect(contributeLiterature(req)).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  it("throws invalid-argument if title missing", async () => {
    const req = makeRequest({ summary: "Some text" });
    await expect(contributeLiterature(req)).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  it("throws invalid-argument if summary missing", async () => {
    const req = makeRequest({ title: "My Article" });
    await expect(contributeLiterature(req)).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  it("creates a literature document with isApproved false", async () => {
    const req = makeRequest(
      {
        title: "The Promises",
        summary: "A reflection on promises in recovery",
        type: "article",
        tags: ["promises", "hope"],
      },
      "user_1",
    );
    const result = await contributeLiterature(req);
    expect(result).toHaveProperty("itemId");
    expect(mockDocSet).toHaveBeenCalledWith(
      expect.objectContaining({ isApproved: false, saveCount: 0 }),
    );
  });
});

// ===========================================================================
// saveLiteratureItem
// ===========================================================================
describe("saveLiteratureItem", () => {
  it("throws unauthenticated if no auth", async () => {
    const req = makeRequest({ literatureId: "lit_1", save: true }, null);
    await expect(saveLiteratureItem(req)).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  it("throws invalid-argument if literatureId missing", async () => {
    const req = makeRequest({ save: true });
    await expect(saveLiteratureItem(req)).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  it("saves a literature item using arrayUnion and increment", async () => {
    const litRef = {
      ...mockDocRef,
      id: "lit_1",
      get: jest.fn().mockResolvedValue(makeLiteratureDoc()),
    };
    const userRef = { ...mockDocRef, id: "user_1", update: mockDocUpdate };

    firestoreCollections["literature_index"] = {
      ...makeCollectionChain(),
      doc: jest.fn().mockReturnValue(litRef),
    };
    firestoreCollections["users"] = {
      ...makeCollectionChain(),
      doc: jest.fn().mockReturnValue(userRef),
    };

    const req = makeRequest({ literatureId: "lit_1", save: true }, "user_1");
    const result = await saveLiteratureItem(req);
    expect(result).toHaveProperty("saved", true);
    expect(mockArrayUnion).toHaveBeenCalledWith("lit_1");
    expect(mockIncrement).toHaveBeenCalledWith(1);
  });

  it("unsaves a literature item using arrayRemove and decrement", async () => {
    const litRef = {
      ...mockDocRef,
      id: "lit_1",
      get: jest.fn().mockResolvedValue(makeLiteratureDoc()),
    };
    const userRef = { ...mockDocRef, id: "user_1", update: mockDocUpdate };

    firestoreCollections["literature_index"] = {
      ...makeCollectionChain(),
      doc: jest.fn().mockReturnValue(litRef),
    };
    firestoreCollections["users"] = {
      ...makeCollectionChain(),
      doc: jest.fn().mockReturnValue(userRef),
    };

    const req = makeRequest({ literatureId: "lit_1", save: false }, "user_1");
    const result = await saveLiteratureItem(req);
    expect(result).toHaveProperty("saved", false);
    expect(mockArrayRemove).toHaveBeenCalledWith("lit_1");
    expect(mockIncrement).toHaveBeenCalledWith(-1);
  });
});

// ===========================================================================
// bookmarkLiteratureForGroup
// ===========================================================================
describe("bookmarkLiteratureForGroup", () => {
  it("throws unauthenticated if no auth", async () => {
    const req = makeRequest(
      { groupId: "group_1", literatureId: "lit_1" },
      null,
    );
    await expect(bookmarkLiteratureForGroup(req)).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  it("throws permission-denied if not an admin", async () => {
    const memberRef = {
      ...mockDocRef,
      get: jest.fn().mockResolvedValue(makeNonAdminMemberDoc()),
    };
    firestoreCollections["members"] = {
      ...makeCollectionChain(),
      doc: jest.fn().mockReturnValue(memberRef),
    };
    firestoreCollections["groups"] = {
      doc: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => ({ subscriptionStatus: "active" }),
        }),
        collection: jest.fn().mockReturnValue(makeCollectionChain()),
      }),
    };

    const req = makeRequest(
      { groupId: "group_1", literatureId: "lit_1", bookmark: true },
      "user_1",
    );
    await expect(bookmarkLiteratureForGroup(req)).rejects.toMatchObject({
      code: "permission-denied",
    });
  });

  it("creates a bookmark for the group", async () => {
    const memberRef = {
      ...mockDocRef,
      get: jest.fn().mockResolvedValue(makeAdminMemberDoc()),
    };
    const litRef = {
      ...mockDocRef,
      id: "lit_1",
      get: jest.fn().mockResolvedValue(makeLiteratureDoc()),
    };
    const bookmarkRef = { ...mockDocRef, id: "lit_1", set: mockDocSet };

    firestoreCollections["members"] = {
      ...makeCollectionChain(),
      doc: jest.fn().mockReturnValue(memberRef),
    };
    firestoreCollections["literature_index"] = {
      ...makeCollectionChain(),
      doc: jest.fn().mockReturnValue(litRef),
    };

    // groups/{groupId}/literatureBookmarks/{literatureId}
    const groupsCollection = {
      doc: jest.fn().mockReturnValue({
        collection: jest.fn().mockReturnValue({
          doc: jest.fn().mockReturnValue(bookmarkRef),
        }),
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => ({ subscriptionStatus: "active" }),
        }),
      }),
    };
    firestoreCollections["groups"] = groupsCollection;

    const req = makeRequest(
      { groupId: "group_1", literatureId: "lit_1", bookmark: true },
      "admin_1",
    );
    const result = await bookmarkLiteratureForGroup(req);
    expect(result).toHaveProperty("bookmarked", true);
  });
});

// ===========================================================================
// contributeMeetingTopic
// ===========================================================================
describe("contributeMeetingTopic", () => {
  it("throws unauthenticated if no auth", async () => {
    const req = makeRequest(
      {
        title: "Gratitude",
        description: "Talk about gratitude",
        category: "discussion",
      },
      null,
    );
    await expect(contributeMeetingTopic(req)).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  it("throws invalid-argument if title missing", async () => {
    const req = makeRequest({ description: "Talk", category: "discussion" });
    await expect(contributeMeetingTopic(req)).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  it("throws invalid-argument if category is invalid", async () => {
    const req = makeRequest({
      title: "My Topic",
      description: "Some text",
      category: "unknown_category",
    });
    await expect(contributeMeetingTopic(req)).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  it("throws invalid-argument for step_study without stepNumber", async () => {
    const req = makeRequest({
      title: "Step Work",
      description: "Discussing the steps",
      category: "step_study",
    });
    await expect(contributeMeetingTopic(req)).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  it("creates a topic with isApproved false", async () => {
    const req = makeRequest(
      {
        title: "Gratitude in Recovery",
        description: "Discussing the importance of gratitude",
        category: "discussion",
        tags: ["gratitude", "step11"],
      },
      "user_1",
    );
    const result = await contributeMeetingTopic(req);
    expect(result).toHaveProperty("topicId");
    expect(mockDocSet).toHaveBeenCalledWith(
      expect.objectContaining({ isApproved: false, useCount: 0 }),
    );
  });

  it("creates a step_study topic when stepNumber is provided", async () => {
    const req = makeRequest(
      {
        title: "Working Step Four",
        description: "A searching and fearless moral inventory",
        category: "step_study",
        stepNumber: 4,
      },
      "user_1",
    );
    const result = await contributeMeetingTopic(req);
    expect(result).toHaveProperty("topicId");
    expect(mockDocSet).toHaveBeenCalledWith(
      expect.objectContaining({ stepNumber: 4, category: "step_study" }),
    );
  });
});

// ===========================================================================
// favoriteGroupTopic
// ===========================================================================
describe("favoriteGroupTopic", () => {
  it("throws unauthenticated if no auth", async () => {
    const req = makeRequest({ groupId: "group_1", topicId: "topic_1" }, null);
    await expect(favoriteGroupTopic(req)).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  it("throws permission-denied if not admin or secretary", async () => {
    const memberRef = {
      ...mockDocRef,
      get: jest.fn().mockResolvedValue({
        exists: true,
        data: () => ({
          isAdmin: false,
          roles: [],
          userId: "user_1",
          groupId: "group_1",
        }),
      }),
    };
    firestoreCollections["members"] = {
      ...makeCollectionChain(),
      doc: jest.fn().mockReturnValue(memberRef),
    };

    const req = makeRequest(
      { groupId: "group_1", topicId: "topic_1", remove: false },
      "user_1",
    );
    await expect(favoriteGroupTopic(req)).rejects.toMatchObject({
      code: "permission-denied",
    });
  });

  it("favorites a topic for admin user", async () => {
    const memberRef = {
      ...mockDocRef,
      get: jest.fn().mockResolvedValue({
        exists: true,
        data: () => ({
          isAdmin: true,
          roles: ["admin"],
          userId: "admin_1",
          groupId: "group_1",
        }),
      }),
    };
    const topicRef = {
      ...mockDocRef,
      get: jest.fn().mockResolvedValue({
        exists: true,
        data: () => ({
          id: "topic_1",
          title: "Gratitude",
          isApproved: true,
          useCount: 2,
        }),
      }),
    };
    const favoriteRef = { ...mockDocRef, set: mockDocSet };

    firestoreCollections["members"] = {
      ...makeCollectionChain(),
      doc: jest.fn().mockReturnValue(memberRef),
    };
    firestoreCollections["meeting_topics"] = {
      ...makeCollectionChain(),
      doc: jest.fn().mockReturnValue(topicRef),
    };

    const groupsCollection = {
      doc: jest.fn().mockReturnValue({
        collection: jest.fn().mockReturnValue({
          doc: jest.fn().mockReturnValue(favoriteRef),
        }),
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => ({ subscriptionStatus: "active" }),
        }),
      }),
    };
    firestoreCollections["groups"] = groupsCollection;

    const req = makeRequest(
      { groupId: "group_1", topicId: "topic_1", remove: false },
      "admin_1",
    );
    const result = await favoriteGroupTopic(req);
    expect(result).toHaveProperty("favorited", true);
  });

  it("increments useCount when markUsed is true", async () => {
    const memberRef = {
      ...mockDocRef,
      get: jest.fn().mockResolvedValue({
        exists: true,
        data: () => ({
          isAdmin: true,
          roles: ["admin"],
          userId: "admin_1",
          groupId: "group_1",
        }),
      }),
    };
    const topicRef = {
      ...mockDocRef,
      id: "topic_1",
      get: jest.fn().mockResolvedValue({
        exists: true,
        data: () => ({
          id: "topic_1",
          title: "Step One",
          isApproved: true,
          useCount: 0,
        }),
      }),
    };
    const favoriteRef = { ...mockDocRef, set: mockDocSet };

    firestoreCollections["members"] = {
      ...makeCollectionChain(),
      doc: jest.fn().mockReturnValue(memberRef),
    };
    firestoreCollections["meeting_topics"] = {
      ...makeCollectionChain(),
      doc: jest.fn().mockReturnValue(topicRef),
    };

    const groupsCollection = {
      doc: jest.fn().mockReturnValue({
        collection: jest.fn().mockReturnValue({
          doc: jest.fn().mockReturnValue(favoriteRef),
        }),
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => ({ subscriptionStatus: "active" }),
        }),
      }),
    };
    firestoreCollections["groups"] = groupsCollection;

    const req = makeRequest(
      { groupId: "group_1", topicId: "topic_1", markUsed: true },
      "admin_1",
    );
    await favoriteGroupTopic(req);
    expect(mockIncrement).toHaveBeenCalledWith(1);
  });
});

// ===========================================================================
// deleteGroupResource
// ===========================================================================
describe("deleteGroupResource", () => {
  it("throws unauthenticated if no auth", async () => {
    const req = makeRequest({ groupId: "group_1", resourceId: "res_1" }, null);
    await expect(deleteGroupResource(req)).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  it("throws invalid-argument if resourceId missing", async () => {
    const req = makeRequest({ groupId: "group_1" });
    await expect(deleteGroupResource(req)).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  it("throws permission-denied if not an admin", async () => {
    const memberRef = {
      ...mockDocRef,
      get: jest.fn().mockResolvedValue(makeNonAdminMemberDoc()),
    };
    firestoreCollections["members"] = {
      ...makeCollectionChain(),
      doc: jest.fn().mockReturnValue(memberRef),
    };
    firestoreCollections["groups"] = {
      doc: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => ({ subscriptionStatus: "active" }),
        }),
        collection: jest.fn().mockReturnValue(makeCollectionChain()),
      }),
    };

    const req = makeRequest(
      { groupId: "group_1", resourceId: "res_1" },
      "user_1",
    );
    await expect(deleteGroupResource(req)).rejects.toMatchObject({
      code: "permission-denied",
    });
  });

  it("throws not-found if resource does not exist", async () => {
    const memberRef = {
      ...mockDocRef,
      get: jest.fn().mockResolvedValue(makeAdminMemberDoc()),
    };
    const resourceRef = {
      ...mockDocRef,
      get: jest.fn().mockResolvedValue(makeMissingDoc()),
      update: mockDocUpdate,
    };

    firestoreCollections["members"] = {
      ...makeCollectionChain(),
      doc: jest.fn().mockReturnValue(memberRef),
    };

    const groupsCollection = {
      doc: jest.fn().mockReturnValue({
        collection: jest.fn().mockReturnValue({
          doc: jest.fn().mockReturnValue(resourceRef),
        }),
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => ({ subscriptionStatus: "active" }),
        }),
      }),
    };
    firestoreCollections["groups"] = groupsCollection;

    const req = makeRequest(
      { groupId: "group_1", resourceId: "res_1" },
      "admin_1",
    );
    await expect(deleteGroupResource(req)).rejects.toMatchObject({
      code: "not-found",
    });
  });

  it("soft-deletes resource and removes storage file for uploads", async () => {
    const memberRef = {
      ...mockDocRef,
      get: jest.fn().mockResolvedValue(makeAdminMemberDoc()),
    };
    const resourceRef = {
      ...mockDocRef,
      id: "res_1",
      get: jest.fn().mockResolvedValue(makeResourceDoc()),
      update: mockDocUpdate,
    };

    firestoreCollections["members"] = {
      ...makeCollectionChain(),
      doc: jest.fn().mockReturnValue(memberRef),
    };

    const groupsCollection = {
      doc: jest.fn().mockReturnValue({
        collection: jest.fn().mockReturnValue({
          doc: jest.fn().mockReturnValue(resourceRef),
        }),
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => ({ subscriptionStatus: "active" }),
        }),
      }),
    };
    firestoreCollections["groups"] = groupsCollection;

    const mockFileDelete = jest.fn().mockResolvedValue(undefined);
    mockStorageBucket.file.mockReturnValue({
      delete: mockFileDelete,
      exists: jest.fn().mockResolvedValue([true]),
    });

    const req = makeRequest(
      { groupId: "group_1", resourceId: "res_1" },
      "admin_1",
    );
    const result = await deleteGroupResource(req);

    expect(result).toHaveProperty("deleted", true);
    expect(mockDocUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: false }),
    );
    expect(mockFileDelete).toHaveBeenCalled();
  });

  it("soft-deletes external_link resource without touching storage", async () => {
    const memberRef = {
      ...mockDocRef,
      get: jest.fn().mockResolvedValue(makeAdminMemberDoc()),
    };
    const resourceRef = {
      ...mockDocRef,
      id: "res_2",
      get: jest
        .fn()
        .mockResolvedValue(
          makeResourceDoc({ source: "external_link", storageRef: undefined }),
        ),
      update: mockDocUpdate,
    };

    firestoreCollections["members"] = {
      ...makeCollectionChain(),
      doc: jest.fn().mockReturnValue(memberRef),
    };

    const groupsCollection = {
      doc: jest.fn().mockReturnValue({
        collection: jest.fn().mockReturnValue({
          doc: jest.fn().mockReturnValue(resourceRef),
        }),
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => ({ subscriptionStatus: "active" }),
        }),
      }),
    };
    firestoreCollections["groups"] = groupsCollection;

    const req = makeRequest(
      { groupId: "group_1", resourceId: "res_2" },
      "admin_1",
    );
    const result = await deleteGroupResource(req);

    expect(result).toHaveProperty("deleted", true);
    expect(mockDocUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: false }),
    );
    // Storage should not be touched for external links
    expect(mockStorageBucket.file).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// bookmarkLiteratureForGroup — isApproved guard (C fix)
// ===========================================================================
describe("bookmarkLiteratureForGroup — isApproved guard", () => {
  it("throws failed-precondition when literature item is not approved", async () => {
    const memberRef = {
      ...mockDocRef,
      get: jest.fn().mockResolvedValue(makeAdminMemberDoc()),
    };
    const unapprovedLitRef = {
      ...mockDocRef,
      id: "lit_unapproved",
      get: jest
        .fn()
        .mockResolvedValue(makeLiteratureDoc({ isApproved: false })),
    };
    const bookmarkDocRef = {
      ...mockDocRef,
      set: mockDocSet,
      delete: mockDocDelete,
    };
    const groupDocRef = {
      get: jest.fn().mockResolvedValue({
        exists: true,
        data: () => ({ subscriptionStatus: "active" }),
      }),
      collection: jest
        .fn()
        .mockReturnValue({ doc: jest.fn().mockReturnValue(bookmarkDocRef) }),
    };

    firestoreCollections["members"] = {
      ...makeCollectionChain(),
      doc: jest.fn().mockReturnValue(memberRef),
    };
    firestoreCollections["literature_index"] = {
      ...makeCollectionChain(),
      doc: jest.fn().mockReturnValue(unapprovedLitRef),
    };
    firestoreCollections["groups"] = {
      ...makeCollectionChain(),
      doc: jest.fn().mockReturnValue(groupDocRef),
    };

    const req = makeRequest(
      { groupId: "group_1", literatureId: "lit_unapproved", bookmark: true },
      "admin_1",
    );
    await expect(bookmarkLiteratureForGroup(req)).rejects.toMatchObject({
      code: "failed-precondition",
    });
  });
});

// ===========================================================================
// seedDailyReflections — idempotency guard (C4 fix)
// ===========================================================================
describe("seedDailyReflections — idempotency", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns skipped count without writing when doc 001 exists and force is false", async () => {
    const adminUserRef = {
      ...mockDocRef,
      get: jest.fn().mockResolvedValue(makeAdminUserDoc()),
    };
    const existingDoc001 = {
      exists: true,
      data: () => ({ subscriptionStatus: "active" }),
    };
    const reflectionsDoc = jest.fn().mockImplementation((id: string) => {
      if (id === "001")
        return {
          ...mockDocRef,
          get: jest.fn().mockResolvedValue(existingDoc001),
        };
      return { ...mockDocRef, get: jest.fn() };
    });

    firestoreCollections["users"] = {
      ...makeCollectionChain(),
      doc: jest.fn().mockReturnValue(adminUserRef),
    };
    firestoreCollections["daily_reflections"] = {
      ...makeCollectionChain(),
      doc: reflectionsDoc,
    };

    const req = makeRequest({ force: false }, "admin_1", { superAdmin: true });
    const result = await seedDailyReflections(req);

    expect(result).toHaveProperty("seeded", 0);
    expect(result).toHaveProperty("skipped", 365);
    // batch.commit should never be called — no writes performed
    expect(mockBatch.commit).not.toHaveBeenCalled();
  });

  it("throws permission-denied if user is not a platform admin", async () => {
    const nonAdminUserRef = {
      ...mockDocRef,
      get: jest
        .fn()
        .mockResolvedValue({ exists: true, data: () => ({ role: "user" }) }),
    };
    firestoreCollections["users"] = {
      ...makeCollectionChain(),
      doc: jest.fn().mockReturnValue(nonAdminUserRef),
    };

    const req = makeRequest({ force: false }, "user_1");
    await expect(seedDailyReflections(req)).rejects.toMatchObject({
      code: "permission-denied",
    });
  });
});
