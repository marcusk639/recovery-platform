/**
 * Unit tests for requestAdminAccessWithSubscription Cloud Function.
 *
 * Covers the security fix for the free-admin-on-unpaid-trial gap:
 *   - Creating a NEW Stripe subscription (i.e. no subscriptionId already
 *     supplied from a completed web checkout) now requires a
 *     `paymentMethodId`; omitting it must reject with "invalid-argument"
 *     BEFORE any Stripe subscription is created.
 *   - Supplying `paymentMethodId` allows the new-subscription path to
 *     proceed and grant admin on a trialing subscription with a card
 *     attached.
 *   - The `subscriptionId`-already-supplied path (completed web checkout)
 *     is unaffected — it never calls stripe.subscriptions.create, so no
 *     paymentMethodId is required there.
 *
 * Mocks:
 *   - firebase-admin
 *   - firebase-functions/v2/https
 *   - firebase-functions/logger
 *   - ../utils/firebase (db)
 *   - ../utils/stripe (stripe, productIdGroup, getDefaultPriceForProduct, TRIAL_PERIOD_DAYS)
 *
 * Mock structure follows createGroupWithSubscription.test.ts's established
 * conventions (jest.mock blocks, hand-rolled in-memory Firestore mock,
 * Stripe mock, makeRequest helper), adapted here to also support
 * db.runTransaction() since requestAdminAccessWithSubscription claims the
 * group inside a Firestore transaction rather than a batch.
 */

// ============================================================
// MOCKS — must come before any imports that load the modules
// ============================================================

jest.mock("firebase-admin", () => ({
  firestore: {
    FieldValue: {
      serverTimestamp: () => "__SERVER_TIMESTAMP__",
      arrayUnion: (...args: unknown[]) => ({ __arrayUnion: args }),
      arrayRemove: (...args: unknown[]) => ({ __arrayRemove: args }),
      increment: (n: number) => ({ __increment: n }),
    },
    Timestamp: {
      now: () => ({ toMillis: () => Date.now(), toDate: () => new Date() }),
      fromDate: (d: Date) => ({ toMillis: () => d.getTime() }),
    },
  },
  apps: ["mock-app"],
  initializeApp: jest.fn(),
}));

// onCall can be called as:
//   onCall(handler)           — single-arg form (v1 style)
//   onCall(config, handler)   — two-arg form (v2 style with options)
// The mock returns the handler in both cases.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockOnCall(...args: any[]) {
  if (typeof args[0] === "function") return args[0];
  if (typeof args[1] === "function") return args[1];
  return args[0];
}

jest.mock("firebase-functions/v2/https", () => ({
  onCall: mockOnCall,
  HttpsError: class HttpsError extends Error {
    code: string;
    details?: unknown;
    constructor(code: string, message: string, details?: unknown) {
      super(message);
      this.code = code;
      this.details = details;
      this.name = "HttpsError";
    }
  },
}));

jest.mock("firebase-functions/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

// ---- Stripe mock ----
const mockStripeSubscriptionsCreate = jest.fn();
const mockStripeSubscriptionsRetrieve = jest.fn();
const mockStripeSubscriptionsCancel = jest.fn();
const mockStripeCustomersCreate = jest.fn();
const mockStripeCustomersUpdate = jest.fn();
const mockStripePaymentMethodsAttach = jest.fn();
const mockGetDefaultPriceForProduct = jest
  .fn()
  .mockResolvedValue("price_group_test");

jest.mock("../utils/stripe", () => ({
  stripe: {
    subscriptions: {
      create: mockStripeSubscriptionsCreate,
      retrieve: mockStripeSubscriptionsRetrieve,
      cancel: mockStripeSubscriptionsCancel,
    },
    customers: {
      create: mockStripeCustomersCreate,
      update: mockStripeCustomersUpdate,
    },
    paymentMethods: {
      attach: mockStripePaymentMethodsAttach,
    },
  },
  productIdGroup: "prod_test_group",
  getDefaultPriceForProduct: mockGetDefaultPriceForProduct,
  TRIAL_PERIOD_DAYS: 7,
}));

// ============================================================
// FIRESTORE MOCK INFRASTRUCTURE
// ============================================================

interface DocStore {
  [path: string]: Record<string, unknown> | null;
}

let docStore: DocStore = {};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildDocRef(collPath: string, docId: string): any {
  const fullPath = `${collPath}/${docId}`;
  return {
    id: docId,
    path: fullPath,
    get: jest.fn().mockImplementation(async () => {
      const data = Object.prototype.hasOwnProperty.call(docStore, fullPath)
        ? docStore[fullPath]
        : null;
      return {
        id: docId,
        exists: data !== null,
        data: () => data,
      };
    }),
    set: jest.fn().mockImplementation(async (data: Record<string, unknown>) => {
      docStore[fullPath] = data;
    }),
    update: jest
      .fn()
      .mockImplementation(async (data: Record<string, unknown>) => {
        docStore[fullPath] = { ...(docStore[fullPath] || {}), ...data };
      }),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildCollectionRef(collPath: string): any {
  return {
    doc: (docId: string) => buildDocRef(collPath, docId),
  };
}

function buildMockDb() {
  return {
    collection: (collPath: string) => buildCollectionRef(collPath),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    runTransaction: async (fn: (tx: any) => Promise<unknown>) => {
      const tx = {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        get: async (ref: any) => ref.get(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        update: (ref: any, data: Record<string, unknown>) => {
          docStore[ref.path] = { ...(docStore[ref.path] || {}), ...data };
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        set: (ref: any, data: Record<string, unknown>) => {
          docStore[ref.path] = data;
        },
      };
      return fn(tx);
    },
  };
}

let mockDb: ReturnType<typeof buildMockDb>;

jest.mock("../utils/firebase", () => ({
  get db() {
    return mockDb;
  },
}));

// ============================================================
// HELPERS
// ============================================================

function setDoc(path: string, data: Record<string, unknown> | null) {
  docStore[path] = data;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeRequest(
  uid: string | null,
  data: Record<string, unknown> = {},
): any {
  return {
    auth: uid ? { uid, token: {} } : null,
    data,
  };
}

const GROUP_ID = "group-1";
const USER_ID = "user-1";
const PAYMENT_METHOD_ID = "pm_test_card";

function seedUnclaimedGroup(overrides: Record<string, unknown> = {}) {
  setDoc(`groups/${GROUP_ID}`, {
    name: "Test Recovery Group",
    memberCount: 3,
    admins: [],
    isClaimed: false,
    pendingAdminRequests: [],
    ...overrides,
  });
}

function setupDefaults() {
  setDoc(`users/${USER_ID}`, {
    uid: USER_ID,
    email: "user1@example.com",
    displayName: "User One",
  });

  seedUnclaimedGroup();

  mockStripeCustomersCreate.mockResolvedValue({ id: "cus_test" });
  mockStripeCustomersUpdate.mockResolvedValue({});
  mockStripePaymentMethodsAttach.mockResolvedValue({});
  mockGetDefaultPriceForProduct.mockResolvedValue("price_group_test");

  // Default: a "successful" trialing subscription WITH a card attached.
  // (Individual tests override this where the scenario requires it.)
  mockStripeSubscriptionsCreate.mockResolvedValue({
    id: "sub_test",
    status: "trialing",
    items: { data: [{ id: "si_test" }] },
    latest_invoice: { payment_intent: {} },
  });
}

// ============================================================
// IMPORTS — after mocks
// ============================================================

import { requestAdminAccessWithSubscription } from "../callable/requestAdminAccessWithSubscription";

// ============================================================
// TESTS
// ============================================================

describe("requestAdminAccessWithSubscription — payment method requirement", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    docStore = {};
    mockDb = buildMockDb();
    setupDefaults();
  });

  it("rejects with invalid-argument when creating a new subscription without a paymentMethodId", async () => {
    const request = makeRequest(USER_ID, {
      groupId: GROUP_ID,
      // paymentMethodId intentionally omitted
    });

    await expect(
      (requestAdminAccessWithSubscription as any)(request), // eslint-disable-line @typescript-eslint/no-explicit-any
    ).rejects.toMatchObject({ code: "invalid-argument" });

    // The vulnerability this guards against: no subscription should ever
    // be created for a caller who supplied no payment method.
    expect(mockStripeSubscriptionsCreate).not.toHaveBeenCalled();
  });

  it("proceeds when paymentMethodId is provided and grants admin on a trialing subscription with a card attached", async () => {
    const request = makeRequest(USER_ID, {
      groupId: GROUP_ID,
      paymentMethodId: PAYMENT_METHOD_ID,
    });

    const result = await (requestAdminAccessWithSubscription as any)(
      // eslint-disable-line @typescript-eslint/no-explicit-any
      request,
    );

    expect(result).toMatchObject({ success: true });
    expect(mockStripeSubscriptionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ default_payment_method: PAYMENT_METHOD_ID }),
      expect.anything(),
    );
  });

  it("does not require paymentMethodId when subscriptionId is already supplied (completed web checkout path)", async () => {
    mockStripeSubscriptionsRetrieve.mockResolvedValue({
      id: "sub_already_created",
      status: "trialing",
      metadata: { groupId: GROUP_ID },
      customer: "cus_existing",
      items: { data: [{ id: "si_existing" }] },
    });

    const request = makeRequest(USER_ID, {
      groupId: GROUP_ID,
      subscriptionId: "sub_already_created",
      // paymentMethodId intentionally omitted — should be fine, subscription already exists
    });

    await expect(
      (requestAdminAccessWithSubscription as any)(request), // eslint-disable-line @typescript-eslint/no-explicit-any
    ).resolves.toMatchObject({ success: true });

    // Confirms this path truly skips new-subscription creation.
    expect(mockStripeSubscriptionsCreate).not.toHaveBeenCalled();
  });
});

describe("requestAdminAccessWithSubscription — compensating-cancellation on transaction failure", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    docStore = {};
    mockDb = buildMockDb();
    setupDefaults();
  });

  it("on a genuine already-claimed race loss: cancels the subscription, reverts the stale group-doc Stripe fields, and rethrows the original error", async () => {
    // Force the transaction to behave as if another caller claimed the
    // group first, by overriding runTransaction to simulate the real
    // isClaimed-check-then-throw behavior after the group doc has been
    // externally marked claimed between this call's step 2 write and the
    // transaction running.
    const originalRunTransaction = mockDb.runTransaction;
    let transactionAttempt = 0;
    mockDb.runTransaction = (async (fn: (tx: any) => Promise<unknown>) => {
      transactionAttempt++;
      if (transactionAttempt === 1) {
        // Simulate a concurrent winner claiming the group with its own
        // Stripe subscription just before this call's transaction reads it.
        docStore[`groups/${GROUP_ID}`] = {
          ...docStore[`groups/${GROUP_ID}`],
          isClaimed: true,
          admins: ["winner-user"],
          stripeSubscriptionId: "sub_winner", // winner's own write already landed
          subscriptionStatus: "trialing",
        };
      }
      return originalRunTransaction(fn);
    }) as typeof mockDb.runTransaction;

    mockStripeSubscriptionsCancel.mockResolvedValue({});

    const request = makeRequest(USER_ID, {
      groupId: GROUP_ID,
      paymentMethodId: PAYMENT_METHOD_ID,
    });

    await expect(
      (requestAdminAccessWithSubscription as any)(request), // eslint-disable-line @typescript-eslint/no-explicit-any
    ).rejects.toMatchObject({ code: "failed-precondition" });

    // This call's freshly-created subscription was canceled.
    expect(mockStripeSubscriptionsCancel).toHaveBeenCalledWith("sub_test");

    // The winner's Stripe fields were NOT clobbered — the doc still shows
    // the winner's subscription, not reverted/nulled.
    const finalGroup = docStore[`groups/${GROUP_ID}`] as Record<
      string,
      unknown
    >;
    expect(finalGroup.stripeSubscriptionId).toBe("sub_winner");
    expect(finalGroup.admins).toEqual(["winner-user"]);
  });

  it("on an unexpected (non-race) transaction failure: cancels the subscription, reverts THIS call's own stale group-doc Stripe fields, and throws a generic internal error instead of leaking the raw error", async () => {
    mockDb.runTransaction = (async () => {
      throw new Error("DEADLINE_EXCEEDED: transaction timed out");
    }) as typeof mockDb.runTransaction;

    mockStripeSubscriptionsCancel.mockResolvedValue({});

    const request = makeRequest(USER_ID, {
      groupId: GROUP_ID,
      paymentMethodId: PAYMENT_METHOD_ID,
    });

    await expect(
      (requestAdminAccessWithSubscription as any)(request), // eslint-disable-line @typescript-eslint/no-explicit-any
    ).rejects.toMatchObject({ code: "internal" });

    expect(mockStripeSubscriptionsCancel).toHaveBeenCalledWith("sub_test");

    // This call's own stale Stripe fields were reverted, not left trusting
    // a subscription that no longer exists.
    const finalGroup = docStore[`groups/${GROUP_ID}`] as Record<
      string,
      unknown
    >;
    expect(finalGroup.stripeSubscriptionId).toBeNull();
    expect(finalGroup.subscriptionStatus).toBeNull();
  });

  it("retry after an unexpected transaction failure creates a fresh subscription rather than trusting stale data", async () => {
    mockDb.runTransaction = (async () => {
      throw new Error("DEADLINE_EXCEEDED: transaction timed out");
    }) as typeof mockDb.runTransaction;
    mockStripeSubscriptionsCancel.mockResolvedValue({});

    const request = makeRequest(USER_ID, {
      groupId: GROUP_ID,
      paymentMethodId: PAYMENT_METHOD_ID,
    });

    await expect(
      (requestAdminAccessWithSubscription as any)(request), // eslint-disable-line @typescript-eslint/no-explicit-any
    ).rejects.toMatchObject({ code: "internal" });

    // Now let the retry succeed normally.
    mockDb.runTransaction = buildMockDb().runTransaction;
    mockStripeSubscriptionsCreate.mockResolvedValue({
      id: "sub_retry",
      status: "trialing",
      items: { data: [{ id: "si_retry" }] },
      latest_invoice: { payment_intent: {} },
    });

    const retryResult = await (requestAdminAccessWithSubscription as any)(
      // eslint-disable-line @typescript-eslint/no-explicit-any
      request,
    );

    expect(retryResult).toMatchObject({ success: true });
    // A NEW subscription was created on retry — proves the retry did not
    // treat the reverted (canceled) subscription as still valid.
    expect(mockStripeSubscriptionsCreate).toHaveBeenCalledTimes(2); // once in the failed attempt, once on retry
  });
});
