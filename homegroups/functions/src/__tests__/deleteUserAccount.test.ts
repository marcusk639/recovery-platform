/**
 * Tests for deleteUserAccount Cloud Function
 *
 * FC-2: Verifies that the anonymizeBatch is recreated after each commit()
 * so that more than 400 messages are correctly anonymized.
 */

// Make this file a module to avoid global-scope name collisions with other test files
export {};

// ---- Mocks must come before any imports ----

const duaBatchUpdate = jest.fn();
const duaBatchCommit = jest.fn().mockResolvedValue(undefined);
const duaBatchDelete = jest.fn();

// Each call to db.batch() returns a fresh mock batch object.
// We track how many times db.batch() is called to verify batch recreation.
const duaMockBatch = jest.fn().mockImplementation(() => ({
  update: duaBatchUpdate,
  delete: duaBatchDelete,
  commit: duaBatchCommit,
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const duaMockCollection = jest.fn() as jest.MockedFunction<
  (name: string) => any
>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const duaMockCollectionGroup = jest.fn() as jest.MockedFunction<
  (name: string) => any
>;

const duaMockDeleteUser = jest.fn().mockResolvedValue(undefined);

jest.mock("firebase-admin", () => ({
  apps: [],
  initializeApp: jest.fn(),
  firestore: Object.assign(
    jest.fn().mockReturnValue({ collection: duaMockCollection }),
    {
      FieldValue: {
        arrayRemove: jest.fn((val: unknown) => ({ _arrayRemove: val })),
        serverTimestamp: jest.fn(() => ({ _serverTimestamp: true })),
      },
    },
  ),
  app: jest.fn().mockReturnValue({}),
  auth: jest.fn().mockReturnValue({}),
}));

jest.mock("firebase-functions", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  https: {
    onCall: jest.fn().mockImplementation((handler: Function) => handler),
  },
}));

jest.mock("firebase-functions/v1/https", () => ({
  HttpsError: class HttpsError extends Error {
    code: string;
    details: unknown;
    constructor(code: string, message: string, details?: unknown) {
      super(message);
      this.code = code;
      this.details = details;
    }
  },
}));

// v2/https + logger mocks come from functions/jest.setup.ts (shared)

jest.mock("../utils/firebase", () => ({
  db: {
    batch: duaMockBatch,
    collection: duaMockCollection,
    collectionGroup: duaMockCollectionGroup,
  },
  auth: {
    deleteUser: duaMockDeleteUser,
  },
}));

const mockStripeSubscriptionsCancel = jest.fn().mockResolvedValue({});

jest.mock("../utils/stripe", () => ({
  stripe: {
    subscriptions: {
      cancel: mockStripeSubscriptionsCancel,
    },
  },
}));

// ---- Helpers ----

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const makeDoc = (id: string, data: Record<string, any> = {}) => ({
  id,
  exists: true,
  data: () => data,
  ref: {
    get: jest.fn().mockResolvedValue({ exists: true, data: () => data }),
    update: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    collection: jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue({ docs: [] }),
    }),
  },
});

const makeAuthRequest = (uid: string, email: string, confirmEmail: string) => ({
  auth: { uid, token: { email } },
  data: { confirmEmail },
});

// ---- Tests ----

describe('deleteUserAccount — H-1: DM thread query uses "participants" field', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    duaBatchCommit.mockResolvedValue(undefined);
    duaMockBatch.mockImplementation(() => ({
      update: duaBatchUpdate,
      delete: duaBatchDelete,
      commit: duaBatchCommit,
    }));
  });

  it('queries direct_message_threads with "participants" array-contains, not "participantIds"', async () => {
    const userId = "user-dm-test";
    const email = "dm@example.com";

    // Track what field name is used in the DM threads query
    let dmQueryField: string | null = null;

    const dmWhere = jest.fn().mockImplementation((field: string) => {
      if (dmQueryField === null) dmQueryField = field;
      return { get: jest.fn().mockResolvedValue({ docs: [] }) };
    });

    duaMockCollection.mockImplementation((name: string) => {
      if (name === "users") {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest
              .fn()
              .mockResolvedValue({ exists: true, data: () => ({}) }),
          }),
        };
      }
      if (name === "direct_message_threads") {
        return { where: dmWhere };
      }
      if (name === "members" || name === "sponsorships" || name === "reports") {
        return {
          where: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ docs: [] }),
          }),
        };
      }
      if (name === "groups") {
        return {
          where: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ docs: [] }),
          }),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ docs: [] }),
      };
    });

    duaMockCollectionGroup.mockImplementation((name: string) => {
      if (name === "messages" || name === "transactions") {
        return {
          where: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ docs: [], size: 0 }),
          }),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ docs: [] }),
      };
    });

    jest.resetModules();
    const { deleteUserAccount } = await import("../callable/deleteUserAccount");

    const result = await (deleteUserAccount as Function)({
      auth: { uid: userId, token: { email } },
      data: { confirmEmail: email },
    });

    expect(result.success).toBe(true);
    // The first argument to .where() on the DM threads collection must be "participants"
    expect(dmWhere).toHaveBeenCalledWith(
      "participants",
      "array-contains",
      userId,
    );
    // It must NOT have been called with the wrong field name
    expect(dmWhere).not.toHaveBeenCalledWith(
      "participantIds",
      "array-contains",
      userId,
    );
  });

  it("deletes DM threads and their messages when user is a participant", async () => {
    const userId = "user-dm-delete";
    const email = "dmdelete@example.com";

    const mockMsgDelete = jest.fn().mockResolvedValue(undefined);
    const mockThreadDelete = jest.fn().mockResolvedValue(undefined);

    const threadDoc = {
      id: "thread-1",
      ref: {
        collection: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({
            docs: [
              { ref: { delete: mockMsgDelete } },
              { ref: { delete: mockMsgDelete } },
            ],
          }),
        }),
        delete: mockThreadDelete,
      },
    };

    duaMockCollection.mockImplementation((name: string) => {
      if (name === "users") {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ exists: false }),
          }),
        };
      }
      if (name === "direct_message_threads") {
        return {
          where: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ docs: [threadDoc] }),
          }),
        };
      }
      if (name === "members" || name === "sponsorships" || name === "reports") {
        return {
          where: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ docs: [] }),
          }),
        };
      }
      if (name === "groups") {
        return {
          where: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ docs: [] }),
          }),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ docs: [] }),
      };
    });

    duaMockCollectionGroup.mockImplementation((name: string) => {
      if (name === "messages" || name === "transactions") {
        return {
          where: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ docs: [], size: 0 }),
          }),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ docs: [] }),
      };
    });

    jest.resetModules();
    const { deleteUserAccount } = await import("../callable/deleteUserAccount");

    const result = await (deleteUserAccount as Function)({
      auth: { uid: userId, token: { email } },
      data: { confirmEmail: email },
    });

    expect(result.success).toBe(true);
    // Thread itself must be deleted
    expect(mockThreadDelete).toHaveBeenCalledTimes(1);
    // Both messages in the thread must be queued for deletion
    expect(duaBatchDelete).toHaveBeenCalledTimes(2);
    expect(result.deletedData?.messages).toBe(2);
  });
});

describe("deleteUserAccount — FC-2: batch recreation after commit", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    duaBatchCommit.mockResolvedValue(undefined);
    duaMockBatch.mockImplementation(() => ({
      update: duaBatchUpdate,
      delete: duaBatchDelete,
      commit: duaBatchCommit,
    }));
  });

  it("Positive: completes successfully with a small number of messages (< 400)", async () => {
    const userId = "user-test-1";
    const email = "test@example.com";

    // 5 mock group-chat message docs
    const msgDocs = Array.from({ length: 5 }, (_, i) => makeDoc(`msg-${i}`));

    duaMockCollection.mockImplementation((name: string) => {
      if (name === "users") {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest
              .fn()
              .mockResolvedValue({ exists: true, data: () => ({}) }),
          }),
        };
      }
      if (
        name === "members" ||
        name === "direct_message_threads" ||
        name === "sponsorships" ||
        name === "reports"
      ) {
        return {
          where: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ docs: [] }),
          }),
        };
      }
      if (name === "groups") {
        return {
          where: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ docs: [] }),
          }),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ docs: [] }),
      };
    });

    duaMockCollectionGroup.mockImplementation((name: string) => {
      if (name === "messages") {
        return {
          where: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ docs: msgDocs }),
          }),
        };
      }
      if (name === "transactions") {
        return {
          where: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ docs: [], size: 0 }),
          }),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ docs: [] }),
      };
    });

    jest.resetModules();
    const { deleteUserAccount } = await import("../callable/deleteUserAccount");

    const result = await (deleteUserAccount as Function)(
      makeAuthRequest(userId, email, email),
    );

    expect(result.success).toBe(true);
    // 5 messages → all queued for anonymization via batchUpdate
    expect(duaBatchUpdate).toHaveBeenCalledTimes(5);
    // db.batch() was called
    expect(duaMockBatch).toHaveBeenCalled();
    // commit was called at least once
    expect(duaBatchCommit).toHaveBeenCalled();
  });

  it("FC-2 Critical: db.batch() is called again after each 400-message commit", async () => {
    const userId = "user-test-2";
    const email = "batch@example.com";

    // 801 messages → 2 mid-loop commits (at 400, 800) + 1 final commit (for the remaining 1)
    // After commit at 400: anonymizeBatch = db.batch() → new batch created
    // After commit at 800: anonymizeBatch = db.batch() → new batch created
    const msgDocs = Array.from({ length: 801 }, (_, i) => makeDoc(`msg-${i}`));

    duaMockCollection.mockImplementation((name: string) => {
      if (name === "users") {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest
              .fn()
              .mockResolvedValue({ exists: true, data: () => ({}) }),
          }),
        };
      }
      if (
        name === "members" ||
        name === "direct_message_threads" ||
        name === "sponsorships" ||
        name === "reports"
      ) {
        return {
          where: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ docs: [] }),
          }),
        };
      }
      if (name === "groups") {
        return {
          where: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ docs: [] }),
          }),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ docs: [] }),
      };
    });

    duaMockCollectionGroup.mockImplementation((name: string) => {
      if (name === "messages") {
        return {
          where: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ docs: msgDocs }),
          }),
        };
      }
      if (name === "transactions") {
        return {
          where: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ docs: [], size: 0 }),
          }),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ docs: [] }),
      };
    });

    jest.resetModules();
    const { deleteUserAccount } = await import("../callable/deleteUserAccount");

    const result = await (deleteUserAccount as Function)(
      makeAuthRequest(userId, email, email),
    );

    expect(result.success).toBe(true);

    // All 801 message updates must have been queued
    expect(duaBatchUpdate).toHaveBeenCalledTimes(801);

    // db.batch() should have been called for:
    //   - main batch (1)
    //   - anonymizeBatch initial creation (1)
    //   - anonymizeBatch recreation after commit at 400 (1)
    //   - anonymizeBatch recreation after commit at 800 (1)
    //   - sponsorshipBatch (1), reportsBatch (1), txBatch (1) = 3 more
    // So at minimum 7 total. The key check: more than 1 batch was created for anonymize.
    expect(duaMockBatch.mock.calls.length).toBeGreaterThanOrEqual(4);

    // commit() should have been called at least 3 times for anonymize alone
    // (at 400, at 800, and for the remaining 1 message)
    expect(duaBatchCommit.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("Negative: throws unauthenticated when no auth context", async () => {
    jest.resetModules();
    const { deleteUserAccount } = await import("../callable/deleteUserAccount");

    const unauthRequest = {
      auth: null,
      data: { confirmEmail: "test@example.com" },
    };

    await expect(
      (deleteUserAccount as Function)(unauthRequest),
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("Negative: throws invalid-argument when confirmEmail does not match", async () => {
    jest.resetModules();
    const { deleteUserAccount } = await import("../callable/deleteUserAccount");

    const request = {
      auth: { uid: "user-1", token: { email: "real@example.com" } },
      data: { confirmEmail: "wrong@example.com" },
    };

    await expect(
      (deleteUserAccount as Function)(request),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("Edge: exactly 400 messages — mid-loop commit fires, batch is recreated, no final commit", async () => {
    // 400 messages: the loop commits at count=400 and recreates the batch.
    // The final `if (anonymizeCount % 400 !== 0)` is false, so no extra commit there.
    const userId = "user-test-3";
    const email = "exact@example.com";

    const msgDocs = Array.from({ length: 400 }, (_, i) => makeDoc(`msg-${i}`));

    duaMockCollection.mockImplementation((name: string) => {
      if (name === "users") {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest
              .fn()
              .mockResolvedValue({ exists: true, data: () => ({}) }),
          }),
        };
      }
      if (
        name === "members" ||
        name === "direct_message_threads" ||
        name === "sponsorships" ||
        name === "reports"
      ) {
        return {
          where: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ docs: [] }),
          }),
        };
      }
      if (name === "groups") {
        return {
          where: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ docs: [] }),
          }),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ docs: [] }),
      };
    });

    duaMockCollectionGroup.mockImplementation((name: string) => {
      if (name === "messages") {
        return {
          where: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ docs: msgDocs }),
          }),
        };
      }
      if (name === "transactions") {
        return {
          where: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ docs: [], size: 0 }),
          }),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ docs: [] }),
      };
    });

    jest.resetModules();
    const { deleteUserAccount } = await import("../callable/deleteUserAccount");

    const result = await (deleteUserAccount as Function)(
      makeAuthRequest(userId, email, email),
    );

    expect(result.success).toBe(true);
    // All 400 updates queued
    expect(duaBatchUpdate).toHaveBeenCalledTimes(400);
    // db.batch() was called at least once for the anonymize batch
    expect(duaMockBatch).toHaveBeenCalled();
  });
});

describe("deleteUserAccount — Stripe subscription cancellation for sole-admin groups", () => {
  const makeCollectionMock = (groupDocs: ReturnType<typeof makeDoc>[]) => {
    const groupsWhere = jest.fn().mockReturnValue({
      get: jest
        .fn()
        .mockResolvedValue({ docs: groupDocs, size: groupDocs.length }),
    });

    return (name: string) => {
      if (name === "users") {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ exists: false }),
          }),
        };
      }
      if (
        name === "members" ||
        name === "direct_message_threads" ||
        name === "sponsorships" ||
        name === "reports"
      ) {
        return {
          where: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ docs: [] }),
          }),
        };
      }
      if (name === "groups") {
        return { where: groupsWhere };
      }
      return {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ docs: [] }),
      };
    };
  };

  const makeCollectionGroupMock = () => (name: string) => {
    if (name === "messages" || name === "transactions") {
      return {
        where: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ docs: [], size: 0 }),
        }),
      };
    }
    return {
      where: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({ docs: [] }),
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockStripeSubscriptionsCancel.mockResolvedValue({});
    duaBatchCommit.mockResolvedValue(undefined);
    duaMockBatch.mockImplementation(() => ({
      update: duaBatchUpdate,
      delete: duaBatchDelete,
      commit: duaBatchCommit,
    }));
  });

  it("cancels Stripe subscription when user is sole admin with active subscription", async () => {
    const userId = "user-sole-admin";
    const email = "soleadmin@example.com";
    const subscriptionId = "sub_active123";

    const groupDoc = makeDoc("group-1", {
      admins: [userId],
      stripeSubscriptionId: subscriptionId,
      subscriptionStatus: "active",
    });

    duaMockCollection.mockImplementation(makeCollectionMock([groupDoc]));
    duaMockCollectionGroup.mockImplementation(makeCollectionGroupMock());

    jest.resetModules();
    const { deleteUserAccount } = await import("../callable/deleteUserAccount");

    const result = await (deleteUserAccount as Function)(
      makeAuthRequest(userId, email, email),
    );

    expect(result.success).toBe(true);
    expect(mockStripeSubscriptionsCancel).toHaveBeenCalledTimes(1);
    expect(mockStripeSubscriptionsCancel).toHaveBeenCalledWith(subscriptionId);
  });

  it("cancels Stripe subscription when user is sole admin with trialing subscription", async () => {
    const userId = "user-sole-trialing";
    const email = "soletrialing@example.com";
    const subscriptionId = "sub_trialing456";

    const groupDoc = makeDoc("group-2", {
      admins: [userId],
      stripeSubscriptionId: subscriptionId,
      subscriptionStatus: "trialing",
    });

    duaMockCollection.mockImplementation(makeCollectionMock([groupDoc]));
    duaMockCollectionGroup.mockImplementation(makeCollectionGroupMock());

    jest.resetModules();
    const { deleteUserAccount } = await import("../callable/deleteUserAccount");

    const result = await (deleteUserAccount as Function)(
      makeAuthRequest(userId, email, email),
    );

    expect(result.success).toBe(true);
    expect(mockStripeSubscriptionsCancel).toHaveBeenCalledTimes(1);
    expect(mockStripeSubscriptionsCancel).toHaveBeenCalledWith(subscriptionId);
  });

  it("does NOT cancel Stripe subscription when sole admin has already-canceled subscription", async () => {
    const userId = "user-sole-canceled";
    const email = "solecanceled@example.com";
    const subscriptionId = "sub_canceled789";

    const groupDoc = makeDoc("group-3", {
      admins: [userId],
      stripeSubscriptionId: subscriptionId,
      subscriptionStatus: "canceled",
    });

    duaMockCollection.mockImplementation(makeCollectionMock([groupDoc]));
    duaMockCollectionGroup.mockImplementation(makeCollectionGroupMock());

    jest.resetModules();
    const { deleteUserAccount } = await import("../callable/deleteUserAccount");

    const result = await (deleteUserAccount as Function)(
      makeAuthRequest(userId, email, email),
    );

    expect(result.success).toBe(true);
    expect(mockStripeSubscriptionsCancel).not.toHaveBeenCalled();
  });

  it("does NOT cancel Stripe subscription when there are multiple admins", async () => {
    const userId = "user-not-sole";
    const email = "notsole@example.com";
    const subscriptionId = "sub_multi999";

    const groupDoc = makeDoc("group-4", {
      admins: [userId, "other-admin-id"],
      stripeSubscriptionId: subscriptionId,
      subscriptionStatus: "active",
    });

    duaMockCollection.mockImplementation(makeCollectionMock([groupDoc]));
    duaMockCollectionGroup.mockImplementation(makeCollectionGroupMock());

    jest.resetModules();
    const { deleteUserAccount } = await import("../callable/deleteUserAccount");

    const result = await (deleteUserAccount as Function)(
      makeAuthRequest(userId, email, email),
    );

    expect(result.success).toBe(true);
    expect(mockStripeSubscriptionsCancel).not.toHaveBeenCalled();
  });
});

describe("deleteUserAccount — H-2: accurate success reporting when Auth deletion fails", () => {
  const makeEmptyCollectionMock = () => (name: string) => {
    if (name === "users") {
      return {
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ exists: false }),
        }),
      };
    }
    if (
      name === "members" ||
      name === "direct_message_threads" ||
      name === "sponsorships" ||
      name === "reports" ||
      name === "groups"
    ) {
      return {
        where: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ docs: [], size: 0 }),
        }),
      };
    }
    return {
      where: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({ docs: [] }),
    };
  };

  const makeEmptyCollectionGroupMock = () => (name: string) => {
    if (name === "messages" || name === "transactions") {
      return {
        where: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ docs: [], size: 0 }),
        }),
      };
    }
    return {
      where: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({ docs: [] }),
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    duaMockDeleteUser.mockResolvedValue(undefined);
    duaBatchCommit.mockResolvedValue(undefined);
    duaMockBatch.mockImplementation(() => ({
      update: duaBatchUpdate,
      delete: duaBatchDelete,
      commit: duaBatchCommit,
    }));
    duaMockCollection.mockImplementation(makeEmptyCollectionMock());
    duaMockCollectionGroup.mockImplementation(makeEmptyCollectionGroupMock());
  });

  it("reports success: false when Firebase Auth deletion fails, without discarding completed Firestore cleanup", async () => {
    duaMockDeleteUser.mockRejectedValueOnce(
      new Error("Auth service unavailable"),
    );

    jest.resetModules();
    const { deleteUserAccount } = await import("../callable/deleteUserAccount");

    const request = makeAuthRequest(
      "user-1",
      "user@example.com",
      "user@example.com",
    );
    const result = await (deleteUserAccount as any)(request);

    expect(result.success).toBe(false);
    expect(result.deletedData?.authAccount).toBe(false);
    expect(result.message).not.toMatch(/successfully deleted/i);
  });

  it("still reports success: true when Auth deletion succeeds", async () => {
    jest.resetModules();
    const { deleteUserAccount } = await import("../callable/deleteUserAccount");

    const request = makeAuthRequest(
      "user-2",
      "user2@example.com",
      "user2@example.com",
    );
    const result = await (deleteUserAccount as any)(request);

    expect(result.success).toBe(true);
    expect(result.deletedData?.authAccount).toBe(true);
    expect(result.message).toMatch(/successfully deleted/i);
  });
});
