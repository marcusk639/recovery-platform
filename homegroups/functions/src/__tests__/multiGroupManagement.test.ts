/**
 * Unit tests for multi-group management Cloud Functions:
 *   - getMultiGroupPricing
 *   - createGroupSubscription (with isAdditionalGroup support)
 *
 * Mocks:
 *   - firebase-admin
 *   - firebase-functions / firebase-functions/v1 / firebase-functions/v1/https / firebase-functions/v2/https
 *   - ../utils/firebase (db)
 *   - ../utils/stripe (stripe, getDefaultPriceForProduct, productIdGroup, etc.)
 */

// ============================================================
// MOCKS — must come before any imports that load the modules
// ============================================================

// --- firebase-admin ---
jest.mock("firebase-admin", () => {
  const mockTx = {
    get: jest.fn().mockResolvedValue({ exists: false }),
    set: jest.fn(),
  };
  const firestoreInstance = {
    collection: jest.fn().mockReturnValue({
      doc: jest.fn().mockReturnValue({}),
    }),
    runTransaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: typeof mockTx) => Promise<void>) =>
        fn(mockTx),
      ),
  };
  const firestoreFn = jest.fn().mockReturnValue(firestoreInstance);
  (firestoreFn as any).FieldValue = {
    serverTimestamp: () => "__SERVER_TIMESTAMP__",
    arrayUnion: (...args: any[]) => ({ __arrayUnion: args }),
    arrayRemove: (...args: any[]) => ({ __arrayRemove: args }),
    increment: (n: number) => ({ __increment: n }),
  };
  (firestoreFn as any).Timestamp = {
    now: () => ({ toMillis: () => Date.now() }),
    fromDate: (d: Date) => ({ toMillis: () => d.getTime() }),
  };
  return {
    firestore: firestoreFn,
    apps: ["mock-app"],
    initializeApp: jest.fn(),
  };
});

// --- firebase-functions ---
// Supports both v1-style onCall(handler) and v2-style onCall(options, handler)
jest.mock("firebase-functions", () => ({
  https: {
    onCall: (optsOrHandler: any, maybeHandler?: (req: any) => Promise<any>) => {
      // v2-style: onCall(options, handler)
      if (
        typeof optsOrHandler === "object" &&
        typeof maybeHandler === "function"
      ) {
        return maybeHandler;
      }
      // v1-style: onCall(handler)
      return optsOrHandler;
    },
  },
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// --- firebase-functions/v1 ---
jest.mock("firebase-functions/v1", () => ({
  pubsub: {
    schedule: () => ({
      timeZone: () => ({
        onRun: (handler: () => Promise<any>) => handler,
      }),
    }),
  },
  firestore: {
    document: () => ({
      onCreate: (handler: (snap: any, ctx: any) => Promise<any>) => handler,
      onUpdate: (handler: (change: any, ctx: any) => Promise<any>) => handler,
      onWrite: (handler: (change: any, ctx: any) => Promise<any>) => handler,
    }),
  },
  https: {
    onCall: (handler: (req: any) => Promise<any>) => handler,
  },
}));

// --- firebase-functions/v1/https (HttpsError) ---
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

// --- firebase-functions/v2/https (CallableRequest type only) ---
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
const mockStripeSubscriptionsCreate = jest.fn();
const mockStripeCustomersCreate = jest.fn();
const mockStripeProductsRetrieve = jest.fn();

jest.mock("../utils/stripe", () => ({
  stripe: {
    subscriptions: {
      create: mockStripeSubscriptionsCreate,
    },
    customers: {
      create: mockStripeCustomersCreate,
    },
    products: {
      retrieve: mockStripeProductsRetrieve,
    },
    prices: {
      retrieve: jest.fn().mockResolvedValue({
        type: "recurring",
        recurring: { interval: "year", interval_count: 1 },
      }),
    },
  },
  productIdGroup: "prod_test_group",
  priceIdMember: "price_test_member",
  getDefaultPriceForProduct: jest.fn().mockResolvedValue("price_full_12"),
  assertGroupPriceIsAnnual: jest.fn(),
  TRIAL_PERIOD_DAYS: 7,
  PLATFORM_FEE_PERCENT: 0.05,
  webhookSecret: "whsec_test",
  connectWebhookSecret: "whsec_connect_test",
  isTestMode: true,
  STRIPE_TEST_SECRET_KEY_ENV: "STRIPE_TEST_SECRET_KEY",
  STRIPE_TEST_WEBHOOK_SECRET_ENV: "STRIPE_TEST_WEBHOOK_SECRET",
  STRIPE_TEST_CONNECT_WEBHOOK_SECRET_ENV: "STRIPE_TEST_CONNECT_WEBHOOK_SECRET",
  STRIPE_TEST_PRICE_ID_MEMBER_ENV: "STRIPE_TEST_PRICE_ID_MEMBER",
  STRIPE_TEST_PRODUCT_ID_GROUP_ENV: "STRIPE_TEST_PRODUCT_ID_GROUP",
  STRIPE_SECRET_KEY_ENV: "STRIPE_SECRET_KEY",
  STRIPE_WEBHOOK_SECRET_ENV: "STRIPE_WEBHOOK_SECRET",
  STRIPE_CONNECT_WEBHOOK_SECRET_ENV: "STRIPE_CONNECT_WEBHOOK_SECRET",
  STRIPE_PRICE_ID_MEMBER_ENV: "STRIPE_PRICE_ID_MEMBER",
  STRIPE_PRODUCT_ID_GROUP_ENV: "STRIPE_PRODUCT_ID_GROUP",
}));

// ---- Firestore mock infrastructure ----
const mockDocUpdate = jest.fn().mockResolvedValue(undefined);

// Per-collection query result store, keyed by collection name
let queryResultsStore: Record<
  string,
  Array<{ id: string; data: Record<string, any> }>
> = {};
// Per-document store, keyed by "collection/docId"
let docStore: Record<string, Record<string, any> | null> = {};

function makeMockDocSnap(id: string, data: Record<string, any> | null) {
  return {
    id,
    exists: data !== null,
    data: () => data,
    ref: { id, update: mockDocUpdate },
  };
}

function buildQueryRef(collectionName: string): any {
  const wheres: Array<{ field: string; op: string; value: any }> = [];

  const self: any = {
    where: (field: string, op: string, value: any) => {
      wheres.push({ field, op, value });
      return self;
    },
    get: jest.fn().mockImplementation(async () => {
      let results = queryResultsStore[collectionName] || [];

      // Apply where filters
      for (const w of wheres) {
        if (w.field === "__name__" && w.op === "in") {
          results = results.filter((r) => (w.value as string[]).includes(r.id));
        } else if (w.op === "==") {
          results = results.filter((r) => r.data[w.field] === w.value);
        } else if (w.op === "in") {
          results = results.filter((r) =>
            (w.value as any[]).includes(r.data[w.field]),
          );
        }
      }

      return {
        empty: results.length === 0,
        size: results.length,
        docs: results.map((r) => makeMockDocSnap(r.id, r.data)),
      };
    }),
  };

  return self;
}

function buildDocRef(collectionName: string, docId: string): any {
  const key = `${collectionName}/${docId}`;
  return {
    id: docId,
    get: jest.fn().mockImplementation(async () => {
      const data = docStore[key] !== undefined ? docStore[key] : null;
      return makeMockDocSnap(docId, data);
    }),
    update: mockDocUpdate,
    set: jest.fn().mockResolvedValue(undefined),
    collection: (subCollection: string) =>
      buildCollectionRef(`${collectionName}/${docId}/${subCollection}`),
  };
}

function buildCollectionRef(collectionName: string): any {
  return {
    doc: (docId?: string) => buildDocRef(collectionName, docId || "auto-id"),
    where: (field: string, op: string, value: any) => {
      const q = buildQueryRef(collectionName);
      return q.where(field, op, value);
    },
    get: jest.fn().mockImplementation(async () => {
      const results = queryResultsStore[collectionName] || [];
      return {
        empty: results.length === 0,
        size: results.length,
        docs: results.map((r) => makeMockDocSnap(r.id, r.data)),
      };
    }),
    add: jest.fn().mockResolvedValue({ id: "new-doc-id" }),
  };
}

const mockDb = {
  collection: (name: string) => buildCollectionRef(name),
  batch: jest.fn().mockReturnValue({
    update: jest.fn().mockReturnThis(),
    commit: jest.fn().mockResolvedValue(undefined),
  }),
};

jest.mock("../utils/firebase", () => ({
  db: mockDb,
  messaging: { sendEachForMulticast: jest.fn() },
}));

// ============================================================
// Helpers
// ============================================================

function setQueryResults(
  collection: string,
  docs: Array<{ id: string; data: Record<string, any> }>,
) {
  queryResultsStore[collection] = docs;
}

function setDoc(
  collection: string,
  docId: string,
  data: Record<string, any> | null,
) {
  docStore[`${collection}/${docId}`] = data;
}

// Auth request helper
function makeRequest(uid: string | null, data: Record<string, any> = {}): any {
  return {
    auth: uid ? { uid, token: {} } : null,
    data,
  };
}

// ============================================================
// Tests: getMultiGroupPricing
// ============================================================

describe("getMultiGroupPricing", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryResultsStore = {};
    docStore = {};
    // Reset env
    delete process.env.STRIPE_PRICE_ID_GROUP_ADDITIONAL;
  });

  it("returns unauthenticated error if no auth", async () => {
    jest.resetModules();
    const { getMultiGroupPricing } =
      await import("../callable/getMultiGroupPricing");

    await expect(
      (getMultiGroupPricing as any)(makeRequest(null)),
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("user with 0 existing active groups → returns full price, isFirstGroup=true", async () => {
    // No member docs → no admin groups → 0 active subscriptions
    setQueryResults("members", []);

    jest.resetModules();
    const { getMultiGroupPricing } =
      await import("../callable/getMultiGroupPricing");

    const result = (await (getMultiGroupPricing as any)(
      makeRequest("user-1"),
    )) as any;

    expect(result.isFirstGroup).toBe(true);
    expect(result.existingActiveGroupCount).toBe(0);
    expect(result.fullPriceId).toBe("price_full_12");
    expect(result.recommendedPriceId).toBe("price_full_12");
    expect(result.fullPriceUsd).toBe(12);
    expect(result.recommendedPriceUsd).toBe(12);
  });

  it("user with 1 existing active admin group → returns discounted price, isFirstGroup=false", async () => {
    // User is admin in group-abc, and that group has an active subscription
    setQueryResults("members", [
      {
        id: "member-1",
        data: { userId: "user-2", groupId: "group-abc", isAdmin: true },
      },
    ]);
    setQueryResults("groups", [
      {
        id: "group-abc",
        data: { subscriptionStatus: "active", name: "Test Group" },
      },
    ]);

    // Set the additional price env var
    process.env.STRIPE_PRICE_ID_GROUP_ADDITIONAL = "price_additional_8";

    jest.resetModules();
    const { getMultiGroupPricing } =
      await import("../callable/getMultiGroupPricing");

    const result = (await (getMultiGroupPricing as any)(
      makeRequest("user-2"),
    )) as any;

    expect(result.isFirstGroup).toBe(false);
    expect(result.existingActiveGroupCount).toBe(1);
    expect(result.additionalPriceId).toBe("price_additional_8");
    expect(result.recommendedPriceId).toBe("price_additional_8");
    expect(result.recommendedPriceUsd).toBe(8);
    expect(result.fullPriceUsd).toBe(12);
    expect(result.additionalPriceUsd).toBe(8);
  });

  it("user with admin memberships but no active subscriptions → returns full price", async () => {
    setQueryResults("members", [
      {
        id: "member-1",
        data: { userId: "user-3", groupId: "group-xyz", isAdmin: true },
      },
    ]);
    // group-xyz is trialing, not active
    setQueryResults("groups", [
      {
        id: "group-xyz",
        data: { subscriptionStatus: "trialing", name: "Trial Group" },
      },
    ]);

    jest.resetModules();
    const { getMultiGroupPricing } =
      await import("../callable/getMultiGroupPricing");

    const result = (await (getMultiGroupPricing as any)(
      makeRequest("user-3"),
    )) as any;

    expect(result.isFirstGroup).toBe(true);
    expect(result.existingActiveGroupCount).toBe(0);
    expect(result.recommendedPriceId).toBe("price_full_12");
  });

  it("when STRIPE_PRICE_ID_GROUP_ADDITIONAL not set → additionalPriceId is null even for multi-group users", async () => {
    setQueryResults("members", [
      {
        id: "member-1",
        data: { userId: "user-4", groupId: "group-def", isAdmin: true },
      },
    ]);
    setQueryResults("groups", [
      {
        id: "group-def",
        data: { subscriptionStatus: "active", name: "Group DEF" },
      },
    ]);

    // No env var set → MULTI_GROUP_PRICE_ID is undefined
    delete process.env.STRIPE_PRICE_ID_GROUP_ADDITIONAL;

    jest.resetModules();
    const { getMultiGroupPricing } =
      await import("../callable/getMultiGroupPricing");

    const result = (await (getMultiGroupPricing as any)(
      makeRequest("user-4"),
    )) as any;

    expect(result.isFirstGroup).toBe(false);
    expect(result.additionalPriceId).toBeNull();
    // Falls back to full price when no additional price configured
    expect(result.recommendedPriceId).toBe("price_full_12");
  });
});

// ============================================================
// Tests: createGroupSubscription with isAdditionalGroup
// ============================================================

describe("createGroupSubscription — isAdditionalGroup", () => {
  const groupId = "group-test-123";
  const userId = "user-admin-1";

  const baseGroupData = {
    name: "My Test Group",
    admins: [userId],
    stripeCustomerId: "cus_existing",
    subscriptionStatus: "inactive",
    stripeSubscriptionId: null,
  };

  const mockSubscription = {
    id: "sub_test_abc",
    status: "trialing",
    trial_end: Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
    items: {
      data: [{ id: "si_test_123", price: { id: "price_full_12" } }],
    },
    latest_invoice: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    queryResultsStore = {};
    docStore = {};

    // Set up the group doc
    setDoc("groups", groupId, baseGroupData);

    // Stripe create subscription succeeds by default
    mockStripeSubscriptionsCreate.mockResolvedValue(mockSubscription);
    mockDocUpdate.mockResolvedValue(undefined);

    delete process.env.STRIPE_PRICE_ID_GROUP_ADDITIONAL;
  });

  it("without isAdditionalGroup → uses full price from getDefaultPriceForProduct", async () => {
    jest.resetModules();
    const { createGroupSubscription } =
      await import("../callable/createGroupSubscription");

    const result = (await (createGroupSubscription as any)(
      makeRequest(userId, { groupId }),
    )) as any;

    expect(result.success).toBe(true);
    expect(result.annualCost).toBe(12);

    // Subscription should have been created with the full price
    expect(mockStripeSubscriptionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [expect.objectContaining({ price: "price_full_12" })],
      }),
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    );
  });

  it("isAdditionalGroup=false → uses full price (explicit)", async () => {
    jest.resetModules();
    const { createGroupSubscription } =
      await import("../callable/createGroupSubscription");

    const result = (await (createGroupSubscription as any)(
      makeRequest(userId, { groupId, isAdditionalGroup: false }),
    )) as any;

    expect(result.success).toBe(true);
    expect(result.annualCost).toBe(12);
    expect(mockStripeSubscriptionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [expect.objectContaining({ price: "price_full_12" })],
      }),
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    );
  });

  it("isAdditionalGroup=true with STRIPE_PRICE_ID_GROUP_ADDITIONAL set → uses discounted price", async () => {
    process.env.STRIPE_PRICE_ID_GROUP_ADDITIONAL = "price_additional_8";

    jest.resetModules();
    const { createGroupSubscription } =
      await import("../callable/createGroupSubscription");

    const result = (await (createGroupSubscription as any)(
      makeRequest(userId, { groupId, isAdditionalGroup: true }),
    )) as any;

    expect(result.success).toBe(true);
    expect(result.annualCost).toBe(8);

    // The subscription should use the discounted price
    expect(mockStripeSubscriptionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [expect.objectContaining({ price: "price_additional_8" })],
      }),
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    );
  });

  it("isAdditionalGroup=true WITHOUT env var configured → falls back to full price", async () => {
    // No env var
    delete process.env.STRIPE_PRICE_ID_GROUP_ADDITIONAL;

    jest.resetModules();
    const { createGroupSubscription } =
      await import("../callable/createGroupSubscription");

    const result = (await (createGroupSubscription as any)(
      makeRequest(userId, { groupId, isAdditionalGroup: true }),
    )) as any;

    expect(result.success).toBe(true);
    // Falls back to full price since no MULTI_GROUP_PRICE_ID configured
    expect(result.annualCost).toBe(12);
    expect(mockStripeSubscriptionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [expect.objectContaining({ price: "price_full_12" })],
      }),
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    );
  });

  it("throws unauthenticated if no auth", async () => {
    jest.resetModules();
    const { createGroupSubscription } =
      await import("../callable/createGroupSubscription");

    await expect(
      (createGroupSubscription as any)(makeRequest(null, { groupId })),
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("throws invalid-argument if groupId is missing", async () => {
    jest.resetModules();
    const { createGroupSubscription } =
      await import("../callable/createGroupSubscription");

    await expect(
      (createGroupSubscription as any)(makeRequest(userId, {})),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("throws permission-denied if caller is not an admin of the group", async () => {
    // Replace group with different admins
    setDoc("groups", groupId, {
      ...baseGroupData,
      admins: ["some-other-user"],
    });

    jest.resetModules();
    const { createGroupSubscription } =
      await import("../callable/createGroupSubscription");

    await expect(
      (createGroupSubscription as any)(makeRequest(userId, { groupId })),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });
});
