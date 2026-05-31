/**
 * Unit tests for createGroupSubscription Cloud Function.
 *
 * Covers:
 *   - Unauthenticated callers are rejected
 *   - Missing groupId throws invalid-argument
 *   - Non-admin callers are rejected with permission-denied
 *   - Group not found throws not-found
 *   - Already-active subscription throws failed-precondition
 *   - New Stripe customer is created with email from auth token
 *   - New Stripe customer creation includes the group name and groupId metadata
 *   - Existing Stripe customer is reused (no new customer created)
 *   - Subscription is created and Firestore group doc is updated
 *   - Returns subscriptionId, customerId, and status on success
 */

export {};

// ============================================================
// MOCKS — must come before any imports that load the modules
// ============================================================

// userTrialHistory doc — always allows trials by default (exists: false)
const mockTrialHistoryGet = jest.fn().mockResolvedValue({ exists: false });
const mockTrialHistorySet = jest.fn().mockResolvedValue(undefined);
const mockTrialHistoryDoc = jest
  .fn()
  .mockReturnValue({ get: mockTrialHistoryGet, set: mockTrialHistorySet });
const mockTrialHistoryCollection = jest
  .fn()
  .mockReturnValue({ doc: mockTrialHistoryDoc });

// Transaction mock — checkAndRecordTrial uses tx.get / tx.set inside runTransaction
const mockTxGet = jest.fn().mockResolvedValue({ exists: false });
const mockTxSet = jest.fn().mockResolvedValue(undefined);
const mockTx = { get: mockTxGet, set: mockTxSet };
const mockRunTransaction = jest.fn((fn: (tx: any) => Promise<void>) =>
  fn(mockTx),
);

const mockFirestoreInstance = {
  collection: mockTrialHistoryCollection,
  runTransaction: mockRunTransaction,
};
const mockFirestoreFunc = Object.assign(
  jest.fn(() => mockFirestoreInstance),
  {
    FieldValue: {
      serverTimestamp: () => "__SERVER_TIMESTAMP__",
      arrayRemove: (...args: any[]) => ({ __arrayRemove: args }),
      arrayUnion: (...args: any[]) => ({ __arrayUnion: args }),
    },
  },
);

jest.mock("firebase-admin", () => ({
  apps: ["mock-app"],
  initializeApp: jest.fn(),
  firestore: mockFirestoreFunc,
}));

jest.mock("firebase-functions", () => ({
  https: {
    onCall: (optsOrHandler: any, maybeHandler?: (req: any) => Promise<any>) => {
      if (
        typeof optsOrHandler === "object" &&
        typeof maybeHandler === "function"
      ) {
        return maybeHandler;
      }
      return optsOrHandler;
    },
  },
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("firebase-functions/v1/https", () => ({
  HttpsError: class HttpsError extends Error {
    code: string;
    details?: any;
    constructor(code: string, message: string, details?: any) {
      super(message);
      this.code = code;
      this.details = details;
      this.name = "HttpsError";
    }
  },
}));

jest.mock("firebase-functions/v2/https", () => ({
  onCall: (opts: any, handler: (req: any) => Promise<any>) => handler,
  HttpsError: class HttpsError extends Error {
    code: string;
    details?: any;
    constructor(code: string, message: string, details?: any) {
      super(message);
      this.code = code;
      this.details = details;
      this.name = "HttpsError";
    }
  },
}));

// logger mock comes from functions/jest.setup.ts (shared)

// ---- Stripe mock ----
const mockCustomersCreate = jest.fn();
const mockSubscriptionsCreate = jest.fn();
const mockPricesRetrieve = jest.fn().mockResolvedValue({
  id: "price_group_test_12",
  recurring: { interval: "year" },
});
const mockGetDefaultPriceForProduct = jest
  .fn()
  .mockResolvedValue("price_group_test_12");
const mockGetMultiGroupPriceId = jest.fn().mockReturnValue(null);

jest.mock("../utils/stripe", () => ({
  stripe: {
    customers: { create: mockCustomersCreate },
    subscriptions: { create: mockSubscriptionsCreate },
    prices: { retrieve: mockPricesRetrieve },
  },
  productIdGroup: "prod_test_group",
  getDefaultPriceForProduct: mockGetDefaultPriceForProduct,
  assertGroupPriceIsAnnual: jest.fn(), // logic tested in assertGroupPriceIsAnnual.test.ts
  TRIAL_PERIOD_DAYS: 14,
}));

jest.mock("../callable/getMultiGroupPricing", () => ({
  getMultiGroupPriceId: mockGetMultiGroupPriceId,
}));

// ---- Firestore mock ----
const mockDocUpdate = jest.fn().mockResolvedValue(undefined);

let docStore: Record<string, Record<string, any> | null> = {};

function buildDocRef(collectionName: string, docId: string): any {
  const key = `${collectionName}/${docId}`;
  return {
    id: docId,
    get: jest.fn().mockImplementation(async () => {
      const data = docStore[key];
      if (data === undefined || data === null)
        return { exists: false, data: () => null };
      return { exists: true, data: () => data };
    }),
    update: mockDocUpdate,
    set: jest.fn().mockResolvedValue(undefined),
  };
}

const mockDb = {
  collection: jest.fn().mockImplementation((name: string) => ({
    doc: (id?: string) => buildDocRef(name, id || "auto-id"),
  })),
};

jest.mock("../utils/firebase", () => ({
  db: mockDb,
}));

// ============================================================
// Helpers
// ============================================================

function setDoc(
  collection: string,
  id: string,
  data: Record<string, any> | null,
) {
  docStore[`${collection}/${id}`] = data;
}

function makeRequest(
  uid: string | null,
  email: string | null,
  data: Record<string, any> = {},
): any {
  return {
    auth: uid ? { uid, token: { email } } : null,
    data,
  };
}

const mockSubscription = {
  id: "sub_test_123",
  status: "trialing",
  trial_end: 1700000000,
  items: { data: [{ id: "si_test_item" }] },
};

// ============================================================
// Tests
// ============================================================

describe("createGroupSubscription", () => {
  const groupId = "group-test-xyz";
  const userId = "admin-uid";
  const userEmail = "admin@example.com";

  const baseGroupData = {
    name: "Recovery Group",
    admins: [userId],
    // no stripeCustomerId — new customer path
  };

  beforeEach(() => {
    jest.clearAllMocks();
    docStore = {};

    mockDb.collection.mockImplementation((name: string) => ({
      doc: (id?: string) => buildDocRef(name, id || "auto-id"),
    }));

    setDoc("groups", groupId, baseGroupData);
    mockSubscriptionsCreate.mockResolvedValue(mockSubscription);
    mockCustomersCreate.mockResolvedValue({ id: "cus_new_test" });
    mockGetDefaultPriceForProduct.mockResolvedValue("price_group_test_12");
    mockGetMultiGroupPriceId.mockReturnValue(null);
    mockDocUpdate.mockResolvedValue(undefined);
    // Trial gate: default to allowing trials (no prior history)
    mockTxGet.mockResolvedValue({ exists: false });
    mockRunTransaction.mockImplementation((fn: (tx: any) => Promise<void>) =>
      fn(mockTx),
    );
  });

  // ------------------------------------------------------------------
  // Auth checks
  // ------------------------------------------------------------------

  it("throws unauthenticated if no auth context", async () => {
    jest.resetModules();
    const { createGroupSubscription } =
      await import("../callable/createGroupSubscription");

    await expect(
      (createGroupSubscription as any)(makeRequest(null, null, { groupId })),
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  // ------------------------------------------------------------------
  // Input validation
  // ------------------------------------------------------------------

  it("throws invalid-argument if groupId is missing", async () => {
    jest.resetModules();
    const { createGroupSubscription } =
      await import("../callable/createGroupSubscription");

    await expect(
      (createGroupSubscription as any)(makeRequest(userId, userEmail, {})),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  // ------------------------------------------------------------------
  // Group checks
  // ------------------------------------------------------------------

  it("throws not-found if group does not exist", async () => {
    setDoc("groups", groupId, null);

    jest.resetModules();
    const { createGroupSubscription } =
      await import("../callable/createGroupSubscription");

    await expect(
      (createGroupSubscription as any)(
        makeRequest(userId, userEmail, { groupId }),
      ),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("throws permission-denied if caller is not a group admin", async () => {
    setDoc("groups", groupId, { ...baseGroupData, admins: ["other-user"] });

    jest.resetModules();
    const { createGroupSubscription } =
      await import("../callable/createGroupSubscription");

    await expect(
      (createGroupSubscription as any)(
        makeRequest(userId, userEmail, { groupId }),
      ),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("throws failed-precondition if group already has an active subscription", async () => {
    setDoc("groups", groupId, {
      ...baseGroupData,
      stripeSubscriptionId: "sub_existing",
      subscriptionStatus: "active",
    });

    jest.resetModules();
    const { createGroupSubscription } =
      await import("../callable/createGroupSubscription");

    await expect(
      (createGroupSubscription as any)(
        makeRequest(userId, userEmail, { groupId }),
      ),
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });

  // ------------------------------------------------------------------
  // Stripe customer creation — email fix
  // ------------------------------------------------------------------

  it("creates Stripe customer with email from auth token", async () => {
    jest.resetModules();
    const { createGroupSubscription } =
      await import("../callable/createGroupSubscription");

    await (createGroupSubscription as any)(
      makeRequest(userId, userEmail, { groupId }),
    );

    expect(mockCustomersCreate).toHaveBeenCalledTimes(1);
    const createCall = mockCustomersCreate.mock.calls[0][0];
    expect(createCall.email).toBe(userEmail);
  });

  it("creates Stripe customer with group name and groupId metadata", async () => {
    jest.resetModules();
    const { createGroupSubscription } =
      await import("../callable/createGroupSubscription");

    await (createGroupSubscription as any)(
      makeRequest(userId, userEmail, { groupId }),
    );

    const createCall = mockCustomersCreate.mock.calls[0][0];
    expect(createCall.name).toBe("Recovery Group");
    expect(createCall.metadata).toMatchObject({ groupId });
  });

  it("does not create a new customer when group already has stripeCustomerId", async () => {
    setDoc("groups", groupId, {
      ...baseGroupData,
      stripeCustomerId: "cus_existing_abc",
    });

    jest.resetModules();
    const { createGroupSubscription } =
      await import("../callable/createGroupSubscription");

    await (createGroupSubscription as any)(
      makeRequest(userId, userEmail, { groupId }),
    );

    expect(mockCustomersCreate).not.toHaveBeenCalled();
  });

  it("passes the existing customer ID to Stripe subscriptions.create when reusing customer", async () => {
    setDoc("groups", groupId, {
      ...baseGroupData,
      stripeCustomerId: "cus_existing_abc",
    });

    jest.resetModules();
    const { createGroupSubscription } =
      await import("../callable/createGroupSubscription");

    await (createGroupSubscription as any)(
      makeRequest(userId, userEmail, { groupId }),
    );

    const subCall = mockSubscriptionsCreate.mock.calls[0][0];
    expect(subCall.customer).toBe("cus_existing_abc");
  });

  // ------------------------------------------------------------------
  // Subscription creation
  // ------------------------------------------------------------------

  it("creates a subscription with the group price and updates the group doc", async () => {
    jest.resetModules();
    const { createGroupSubscription } =
      await import("../callable/createGroupSubscription");

    const result = await (createGroupSubscription as any)(
      makeRequest(userId, userEmail, { groupId }),
    );

    // Subscription created with the correct price
    const subCall = mockSubscriptionsCreate.mock.calls[0][0];
    expect(subCall.items[0].price).toBe("price_group_test_12");
    expect(subCall.items[0].quantity).toBe(1);

    // Group doc updated with subscription info
    expect(mockDocUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeSubscriptionId: "sub_test_123",
        subscriptionStatus: "trialing",
        stripePriceIdGroup: "price_group_test_12",
      }),
    );

    // Correct return shape
    expect(result.success).toBe(true);
    expect(result.subscriptionId).toBe("sub_test_123");
    expect(result.status).toBe("trialing");
  });

  it("returns the new customer ID in the response when a customer was created", async () => {
    jest.resetModules();
    const { createGroupSubscription } =
      await import("../callable/createGroupSubscription");

    const result = await (createGroupSubscription as any)(
      makeRequest(userId, userEmail, { groupId }),
    );

    expect(result.customerId).toBe("cus_new_test");
  });

  it("handles null email gracefully (no crash when email is absent from token)", async () => {
    // Some auth providers may not provide an email
    jest.resetModules();
    const { createGroupSubscription } =
      await import("../callable/createGroupSubscription");

    // Should not throw — email in customers.create will just be undefined/null
    await expect(
      (createGroupSubscription as any)(makeRequest(userId, null, { groupId })),
    ).resolves.toMatchObject({ success: true });

    // customers.create was called; email field is undefined/null but no crash
    expect(mockCustomersCreate).toHaveBeenCalledTimes(1);
  });
});
