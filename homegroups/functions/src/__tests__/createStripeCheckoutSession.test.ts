/**
 * Unit tests for createStripeCheckoutSession Cloud Function.
 *
 * Covers:
 *   - Auth check: unauthenticated caller throws HttpsError "unauthenticated"
 *   - Missing groupId throws HttpsError "invalid-argument"
 *   - Non-admin caller throws HttpsError "permission-denied"
 *   - Group not found throws HttpsError "not-found"
 *   - Uses group product price (getDefaultPriceForProduct called with productIdGroup)
 *   - Uses hardcoded success/cancel URLs (no open redirect)
 *   - Returns sessionId on success
 *
 * Mocks:
 *   - firebase-admin
 *   - firebase-functions / firebase-functions/v1/https / firebase-functions/v2/https
 *   - ../utils/firebase (db)
 *   - ../utils/stripe (stripe, productIdGroup, getDefaultPriceForProduct)
 */

// ============================================================
// MOCKS — must come before any imports that load the modules
// ============================================================

// --- firebase-admin ---
jest.mock("firebase-admin", () => ({
  firestore: {
    FieldValue: {
      serverTimestamp: () => "__SERVER_TIMESTAMP__",
      arrayUnion: (...args: any[]) => ({ __arrayUnion: args }),
      arrayRemove: (...args: any[]) => ({ __arrayRemove: args }),
      increment: (n: number) => ({ __increment: n }),
    },
    Timestamp: {
      now: () => ({ toMillis: () => Date.now() }),
      fromDate: (d: Date) => ({ toMillis: () => d.getTime() }),
    },
  },
  apps: ["mock-app"],
  initializeApp: jest.fn(),
}));

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
const mockStripeCheckoutSessionsCreate = jest.fn();
const mockStripeCustomersCreate = jest.fn();
const mockStripePricesRetrieve = jest
  .fn()
  .mockResolvedValue({ id: "price_group_12", recurring: { interval: "year" } });
const mockGetDefaultPriceForProduct = jest
  .fn()
  .mockResolvedValue("price_group_12");

jest.mock("../utils/stripe", () => ({
  stripe: {
    checkout: {
      sessions: {
        create: mockStripeCheckoutSessionsCreate,
      },
    },
    customers: {
      create: mockStripeCustomersCreate,
    },
    prices: {
      retrieve: mockStripePricesRetrieve,
    },
  },
  productIdGroup: "prod_test_group",
  priceIdMember: "price_test_member",
  getDefaultPriceForProduct: mockGetDefaultPriceForProduct,
  assertGroupPriceIsAnnual: jest.fn(), // logic tested in assertGroupPriceIsAnnual.test.ts
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

let docStore: Record<string, Record<string, any> | null> = {};

function makeMockDocSnap(id: string, data: Record<string, any> | null) {
  return {
    id,
    exists: data !== null,
    data: () => data,
    ref: { id, update: mockDocUpdate },
  };
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
  };
}

function buildCollectionRef(collectionName: string): any {
  return {
    doc: (docId?: string) => buildDocRef(collectionName, docId || "auto-id"),
  };
}

const mockDb = {
  collection: (name: string) => buildCollectionRef(name),
};

jest.mock("../utils/firebase", () => ({
  db: mockDb,
  messaging: { sendEachForMulticast: jest.fn() },
}));

// ============================================================
// Helpers
// ============================================================

function setDoc(
  collection: string,
  docId: string,
  data: Record<string, any> | null,
) {
  docStore[`${collection}/${docId}`] = data;
}

function makeRequest(uid: string | null, data: Record<string, any> = {}): any {
  return {
    auth: uid ? { uid, token: {} } : null,
    data,
  };
}

// ============================================================
// Tests: createStripeCheckoutSession
// ============================================================

describe("createStripeCheckoutSession", () => {
  const groupId = "group-test-abc";
  const userId = "user-admin-1";

  const baseGroupData = {
    name: "My Test Group",
    admins: [userId],
    stripeCustomerId: "cus_existing_123",
  };

  const mockSession = {
    id: "cs_test_session_123",
    url: "https://checkout.stripe.com/pay/cs_test_session_123",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    docStore = {};

    setDoc("groups", groupId, baseGroupData);

    mockStripeCheckoutSessionsCreate.mockResolvedValue(mockSession);
    mockGetDefaultPriceForProduct.mockResolvedValue("price_group_12");
    mockDocUpdate.mockResolvedValue(undefined);
  });

  // ------------------------------------------------------------------
  // Auth checks
  // ------------------------------------------------------------------

  it("throws unauthenticated if no auth", async () => {
    jest.resetModules();
    const { createStripeCheckoutSession } =
      await import("../callable/createStripeCheckoutSession");

    await expect(
      (createStripeCheckoutSession as any)(makeRequest(null, { groupId })),
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  // ------------------------------------------------------------------
  // Input validation
  // ------------------------------------------------------------------

  it("throws invalid-argument if groupId is missing", async () => {
    jest.resetModules();
    const { createStripeCheckoutSession } =
      await import("../callable/createStripeCheckoutSession");

    await expect(
      (createStripeCheckoutSession as any)(makeRequest(userId, {})),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  // ------------------------------------------------------------------
  // Group checks
  // ------------------------------------------------------------------

  it("throws not-found if group does not exist", async () => {
    setDoc("groups", groupId, null);

    jest.resetModules();
    const { createStripeCheckoutSession } =
      await import("../callable/createStripeCheckoutSession");

    await expect(
      (createStripeCheckoutSession as any)(makeRequest(userId, { groupId })),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("throws permission-denied if caller is not an admin of the group", async () => {
    setDoc("groups", groupId, {
      ...baseGroupData,
      admins: ["some-other-user"],
    });

    jest.resetModules();
    const { createStripeCheckoutSession } =
      await import("../callable/createStripeCheckoutSession");

    await expect(
      (createStripeCheckoutSession as any)(makeRequest(userId, { groupId })),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  // ------------------------------------------------------------------
  // Correct price: must use getDefaultPriceForProduct(productIdGroup)
  // ------------------------------------------------------------------

  it("calls getDefaultPriceForProduct with productIdGroup (not priceIdMember)", async () => {
    jest.resetModules();
    const { createStripeCheckoutSession } =
      await import("../callable/createStripeCheckoutSession");

    await (createStripeCheckoutSession as any)(
      makeRequest(userId, { groupId }),
    );

    // Must have fetched the group price via productIdGroup
    expect(mockGetDefaultPriceForProduct).toHaveBeenCalledWith(
      "prod_test_group",
    );
    expect(mockGetDefaultPriceForProduct).toHaveBeenCalledTimes(1);
    // Annual price guard must run
    expect(mockStripePricesRetrieve).toHaveBeenCalledWith("price_group_12");
    const { assertGroupPriceIsAnnual: mockAssert } =
      jest.requireMock("../utils/stripe");
    expect(mockAssert).toHaveBeenCalledTimes(1);
  });

  it("passes the group price (not member price) to Stripe checkout session", async () => {
    mockGetDefaultPriceForProduct.mockResolvedValue("price_group_12");

    jest.resetModules();
    const { createStripeCheckoutSession } =
      await import("../callable/createStripeCheckoutSession");

    await (createStripeCheckoutSession as any)(
      makeRequest(userId, { groupId }),
    );

    expect(mockStripeCheckoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [
          expect.objectContaining({ price: "price_group_12", quantity: 1 }),
        ],
      }),
    );

    // Must NOT use the member price ID
    const callArg = mockStripeCheckoutSessionsCreate.mock.calls[0][0];
    expect(callArg.line_items[0].price).not.toBe("price_test_member");
  });

  // ------------------------------------------------------------------
  // Open redirect prevention: URLs must be hardcoded server-side
  // ------------------------------------------------------------------

  it("uses hardcoded success_url containing homegroups-app.com (ignores any client input)", async () => {
    jest.resetModules();
    const { createStripeCheckoutSession } =
      await import("../callable/createStripeCheckoutSession");

    // Even if a caller somehow passes URLs, the function signature no longer accepts them
    await (createStripeCheckoutSession as any)(
      makeRequest(userId, {
        groupId,
        // These extra fields should be completely ignored by the function
        successUrl: "https://evil.com/steal",
        cancelUrl: "https://evil.com/cancel",
      }),
    );

    const callArg = mockStripeCheckoutSessionsCreate.mock.calls[0][0];
    expect(callArg.success_url).toContain("homegroups-app.com");
    expect(callArg.cancel_url).toContain("homegroups-app.com");
    expect(callArg.success_url).not.toContain("evil.com");
    expect(callArg.cancel_url).not.toContain("evil.com");
  });

  it("uses hardcoded cancel_url containing homegroups-app.com", async () => {
    jest.resetModules();
    const { createStripeCheckoutSession } =
      await import("../callable/createStripeCheckoutSession");

    await (createStripeCheckoutSession as any)(
      makeRequest(userId, { groupId }),
    );

    const callArg = mockStripeCheckoutSessionsCreate.mock.calls[0][0];
    expect(callArg.cancel_url).toContain("homegroups-app.com");
  });

  // ------------------------------------------------------------------
  // Success path
  // ------------------------------------------------------------------

  it("returns sessionId on success", async () => {
    jest.resetModules();
    const { createStripeCheckoutSession } =
      await import("../callable/createStripeCheckoutSession");

    const result = (await (createStripeCheckoutSession as any)(
      makeRequest(userId, { groupId }),
    )) as any;

    expect(result.sessionId).toBe("cs_test_session_123");
  });

  it("creates a new Stripe customer if group has no stripeCustomerId", async () => {
    setDoc("groups", groupId, {
      ...baseGroupData,
      stripeCustomerId: undefined,
    });
    mockStripeCustomersCreate.mockResolvedValue({ id: "cus_new_456" });

    jest.resetModules();
    const { createStripeCheckoutSession } =
      await import("../callable/createStripeCheckoutSession");

    const result = (await (createStripeCheckoutSession as any)(
      makeRequest(userId, { groupId }),
    )) as any;

    expect(mockStripeCustomersCreate).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { groupId } }),
    );
    expect(result.sessionId).toBe("cs_test_session_123");
  });

  it("reuses existing Stripe customer if group already has stripeCustomerId", async () => {
    jest.resetModules();
    const { createStripeCheckoutSession } =
      await import("../callable/createStripeCheckoutSession");

    await (createStripeCheckoutSession as any)(
      makeRequest(userId, { groupId }),
    );

    // Should NOT create a new customer
    expect(mockStripeCustomersCreate).not.toHaveBeenCalled();

    // Should use the existing customer ID
    const callArg = mockStripeCheckoutSessionsCreate.mock.calls[0][0];
    expect(callArg.customer).toBe("cus_existing_123");
  });

  it("passes groupId and userId in session metadata", async () => {
    jest.resetModules();
    const { createStripeCheckoutSession } =
      await import("../callable/createStripeCheckoutSession");

    await (createStripeCheckoutSession as any)(
      makeRequest(userId, { groupId }),
    );

    const callArg = mockStripeCheckoutSessionsCreate.mock.calls[0][0];
    expect(callArg.metadata).toMatchObject({ groupId, userId });
  });
});
