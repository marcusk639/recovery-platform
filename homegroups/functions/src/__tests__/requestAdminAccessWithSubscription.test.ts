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

// Resolves a single field's incoming write value against its current stored
// value. Most fields (including arrayUnion/arrayRemove sentinels) are stored
// verbatim, matching this codebase's other Firestore mocks — tests that care
// about those only assert the sentinel object was passed to `.update()`.
// `FieldValue.increment(n)` is the one sentinel this mock DOES resolve to a
// real number, because Task 2's regression tests assert the persisted
// `stripeSubscriptionAttempt` count across sequential calls, not just that
// an increment sentinel was passed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveFieldValue(current: unknown, incoming: any): unknown {
  if (
    incoming &&
    typeof incoming === "object" &&
    Object.prototype.hasOwnProperty.call(incoming, "__increment")
  ) {
    const base = typeof current === "number" ? current : 0;
    return base + (incoming.__increment as number);
  }
  return incoming;
}

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
        const existing = (docStore[fullPath] || {}) as Record<string, unknown>;
        const merged: Record<string, unknown> = { ...existing };
        for (const [key, value] of Object.entries(data)) {
          merged[key] = resolveFieldValue(existing[key], value);
        }
        docStore[fullPath] = merged;
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

  // Default for the final live-status re-check (Task 2): matches the
  // create() response's status above, so tests unrelated to that re-check
  // don't need to know it exists. Tests exercising the re-check itself
  // override this to simulate a stale/replayed create() response.
  mockStripeSubscriptionsRetrieve.mockResolvedValue({ status: "trialing" });
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

describe("requestAdminAccessWithSubscription — write-ordering (Stripe fields only land for the transaction winner)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    docStore = {};
    mockDb = buildMockDb();
    setupDefaults();
  });

  it("does not write any Stripe fields to the group doc before the claim transaction commits", async () => {
    // Intercept the moment right before the transaction runs to inspect
    // whether any Stripe fields have been written yet.
    const originalRunTransaction = mockDb.runTransaction;
    let stripeFieldsWrittenBeforeTransaction = false;
    mockDb.runTransaction = (async (fn: (tx: any) => Promise<unknown>) => {
      const preTxGroup = docStore[`groups/${GROUP_ID}`] as
        Record<string, unknown> | undefined;
      if (preTxGroup?.stripeSubscriptionId !== undefined) {
        stripeFieldsWrittenBeforeTransaction = true;
      }
      return originalRunTransaction(fn);
    }) as typeof mockDb.runTransaction;

    const request = makeRequest(USER_ID, {
      groupId: GROUP_ID,
      paymentMethodId: PAYMENT_METHOD_ID,
    });

    await (requestAdminAccessWithSubscription as any)(request); // eslint-disable-line @typescript-eslint/no-explicit-any

    expect(stripeFieldsWrittenBeforeTransaction).toBe(false);

    // After the transaction commits, the fields ARE present (written
    // atomically with the win).
    const finalGroup = docStore[`groups/${GROUP_ID}`] as Record<
      string,
      unknown
    >;
    expect(finalGroup.stripeSubscriptionId).toBe("sub_test");
    // Per this mock's documented convention, arrayUnion sentinels are stored
    // verbatim rather than resolved to a real array — assert the sentinel
    // was passed to tx.update(), consistent with how the rest of this file
    // treats arrayUnion/arrayRemove.
    expect(finalGroup.admins).toEqual({ __arrayUnion: [USER_ID] });
  });

  it("on a genuine already-claimed race loss, never writes this caller's own Stripe fields anywhere — the winner's data is untouched", async () => {
    const originalRunTransaction = mockDb.runTransaction;
    let transactionAttempt = 0;
    mockDb.runTransaction = (async (fn: (tx: any) => Promise<unknown>) => {
      transactionAttempt++;
      if (transactionAttempt === 1) {
        docStore[`groups/${GROUP_ID}`] = {
          ...docStore[`groups/${GROUP_ID}`],
          isClaimed: true,
          admins: ["winner-user"],
          stripeSubscriptionId: "sub_winner",
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

    // The winner's Stripe fields are exactly as the winner left them —
    // this caller's own (now-canceled) subscription was never written
    // anywhere, so there's nothing to have clobbered them with.
    const finalGroup = docStore[`groups/${GROUP_ID}`] as Record<
      string,
      unknown
    >;
    expect(finalGroup.stripeSubscriptionId).toBe("sub_winner");
    expect(finalGroup.admins).toEqual(["winner-user"]);
    expect(mockStripeSubscriptionsCancel).toHaveBeenCalledWith("sub_test");
  });
});

describe("requestAdminAccessWithSubscription — final live-status re-check before granting admin", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    docStore = {};
    mockDb = buildMockDb();
    setupDefaults();
  });

  it("rejects using a live retrieve() result even when the create() response's own status looked valid (stale/replayed data)", async () => {
    // Simulate an idempotent replay: the create() call's own response
    // still shows "trialing" (a cached response from before some earlier
    // cancellation), but a live retrieve() reveals it's actually canceled.
    mockStripeSubscriptionsCreate.mockResolvedValue({
      id: "sub_test",
      status: "trialing", // stale — this is what create()'s cached response shows
      items: { data: [{ id: "si_test" }] },
      latest_invoice: { payment_intent: {} },
    });
    mockStripeSubscriptionsRetrieve.mockResolvedValue({
      status: "canceled", // the live truth
    });

    const request = makeRequest(USER_ID, {
      groupId: GROUP_ID,
      paymentMethodId: PAYMENT_METHOD_ID,
    });

    await expect(
      (requestAdminAccessWithSubscription as any)(request), // eslint-disable-line @typescript-eslint/no-explicit-any
    ).rejects.toMatchObject({ code: "failed-precondition" });

    // Confirm the guard's rejection message reflects the LIVE status, not
    // the stale create() response's status.
    await expect(
      (requestAdminAccessWithSubscription as any)(request), // eslint-disable-line @typescript-eslint/no-explicit-any
    ).rejects.toMatchObject({
      message: expect.stringContaining("canceled"),
    });
  });

  it("does NOT re-check live status for the web-checkout (subscriptionId-supplied) path — it already verified moments earlier", async () => {
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
    });

    await expect(
      (requestAdminAccessWithSubscription as any)(request), // eslint-disable-line @typescript-eslint/no-explicit-any
    ).resolves.toMatchObject({ success: true });

    // Exactly one retrieve() call — the verify-time one. No second call
    // right before the guard for this path.
    expect(mockStripeSubscriptionsRetrieve).toHaveBeenCalledTimes(1);
  });
});
