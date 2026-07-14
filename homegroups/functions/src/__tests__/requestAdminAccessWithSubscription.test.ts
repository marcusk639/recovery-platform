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
import { HttpsError } from "firebase-functions/v2/https";

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

describe("requestAdminAccessWithSubscription — ack-ambiguity-aware compensation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    docStore = {};
    mockDb = buildMockDb();
    setupDefaults();
  });

  it("treats a transaction that actually committed (despite a thrown error) as a win, not a failure", async () => {
    // Simulate the ack-ambiguity scenario: the transaction's write goes
    // through (docStore reflects it), but the client-observed call still
    // throws (e.g. the ack itself was lost to a network error).
    //
    // ADAPTATION: this test's custom `tx.update` needs to resolve the
    // `arrayUnion` sentinel into a real array (rather than storing it
    // verbatim, as this file's other mocks do by documented convention —
    // see `resolveFieldValue` and the write-ordering describe block's
    // comment above) because the production ack-ambiguity check does
    // `postTxData?.admins?.includes(userId)`, which requires a real array
    // to behave meaningfully — exactly as real Firestore would actually
    // resolve `arrayUnion` on commit. Using the verbatim-sentinel
    // convention here would make `admins` an object with no `.includes`
    // method and throw, which isn't the scenario this test is targeting.
    mockDb.runTransaction = (async (fn: (tx: any) => Promise<unknown>) => {
      const tx = {
        get: async (ref: any) => ref.get(),
        update: (ref: any, data: Record<string, unknown>) => {
          const existing = (docStore[ref.path] || {}) as Record<
            string,
            unknown
          >;
          const merged: Record<string, unknown> = { ...existing };
          for (const [key, value] of Object.entries(data)) {
            if (
              value &&
              typeof value === "object" &&
              Object.prototype.hasOwnProperty.call(value, "__arrayUnion")
            ) {
              const base = Array.isArray(existing[key])
                ? (existing[key] as unknown[])
                : [];
              const toAdd = (value as { __arrayUnion: unknown[] }).__arrayUnion;
              merged[key] = Array.from(new Set([...base, ...toAdd]));
            } else if (
              value &&
              typeof value === "object" &&
              Object.prototype.hasOwnProperty.call(value, "__arrayRemove")
            ) {
              const base = Array.isArray(existing[key])
                ? (existing[key] as unknown[])
                : [];
              const toRemove = (value as { __arrayRemove: unknown[] })
                .__arrayRemove;
              merged[key] = base.filter((item) => !toRemove.includes(item));
            } else {
              merged[key] = value;
            }
          }
          docStore[ref.path] = merged;
        },
      };
      await fn(tx); // the write actually happens
      throw new Error("DEADLINE_EXCEEDED: ack lost"); // but the client sees an error
    }) as typeof mockDb.runTransaction;

    const request = makeRequest(USER_ID, {
      groupId: GROUP_ID,
      paymentMethodId: PAYMENT_METHOD_ID,
    });

    await expect(
      (requestAdminAccessWithSubscription as any)(request), // eslint-disable-line @typescript-eslint/no-explicit-any
    ).resolves.toMatchObject({ success: true });

    // No compensation ran — the subscription this call created is still
    // live, because the claim genuinely succeeded.
    expect(mockStripeSubscriptionsCancel).not.toHaveBeenCalled();

    const finalGroup = docStore[`groups/${GROUP_ID}`] as Record<
      string,
      unknown
    >;
    expect(finalGroup.admins).toEqual([USER_ID]);
    expect(finalGroup.stripeSubscriptionId).toBe("sub_test");

    // Regression coverage: the ack-ambiguity recovery return must go
    // through the same member-doc grant path as the normal happy path —
    // it must not skip straight to returning success. Otherwise the user
    // ends up listed in group.admins but with member.isAdmin unset, and
    // the onMemberWrite trigger never syncs their custom JWT claims.
    const memberDoc = docStore[`members/${GROUP_ID}_${USER_ID}`] as Record<
      string,
      unknown
    >;
    expect(memberDoc).toBeDefined();
    expect(memberDoc.isAdmin).toBe(true);
  });

  it("a same-user concurrent double-request sharing one subscription object: the loser's ack-ambiguity check catches it, no cancellation attempted", async () => {
    // Both "concurrent" calls in this test use the SAME idempotency key
    // (subscriptionAttempt reads as 0 for both, since neither has
    // triggered a compensation), so the mock returns the identical
    // subscription object for both — this IS the scenario the design
    // spec's invariant argument is about.
    const originalRunTransaction = mockDb.runTransaction;
    let transactionAttempt = 0;
    mockDb.runTransaction = (async (fn: (tx: any) => Promise<unknown>) => {
      transactionAttempt++;
      if (transactionAttempt === 1) {
        // Simulate this exact user's OTHER concurrent request having
        // already committed with the shared subscription object.
        docStore[`groups/${GROUP_ID}`] = {
          ...docStore[`groups/${GROUP_ID}`],
          isClaimed: true,
          admins: [USER_ID], // same user, not a different one
          stripeSubscriptionId: "sub_test", // the SAME object this call also holds
          subscriptionStatus: "trialing",
        };
      }
      return originalRunTransaction(fn);
    }) as typeof mockDb.runTransaction;

    const request = makeRequest(USER_ID, {
      groupId: GROUP_ID,
      paymentMethodId: PAYMENT_METHOD_ID,
    });

    // This call's OWN transaction attempt fails (isClaimed already true),
    // but since admins already includes THIS SAME userId, the
    // ack-ambiguity check must catch it and return success.
    await expect(
      (requestAdminAccessWithSubscription as any)(request), // eslint-disable-line @typescript-eslint/no-explicit-any
    ).resolves.toMatchObject({ success: true });

    expect(mockStripeSubscriptionsCancel).not.toHaveBeenCalled();

    // Same regression coverage as the previous test: this recovery path
    // must also grant the member doc, not just return success.
    const memberDoc = docStore[`members/${GROUP_ID}_${USER_ID}`] as Record<
      string,
      unknown
    >;
    expect(memberDoc).toBeDefined();
    expect(memberDoc.isAdmin).toBe(true);
  });

  it("a same-user CROSS-BRANCH race (this call's own create-new subscription vs. a different concurrent web-checkout request of theirs that won): does not falsely claim success, cancels its own now-orphaned subscription", async () => {
    // Unlike the shared-object case above, this call's create-new path
    // makes its OWN Stripe subscription ("sub_mobile_new"), while the
    // post-tx group doc reflects a DIFFERENT subscription object
    // ("sub_web_checkout") — as would happen if the SAME user's other
    // concurrent request went through the web-checkout (subscriptionId
    // already supplied) branch instead and won the claim transaction.
    // admins.includes(userId) alone can't tell these two cases apart;
    // only comparing the committed stripeSubscriptionId can.
    mockStripeSubscriptionsCreate.mockResolvedValue({
      id: "sub_mobile_new",
      status: "trialing",
      items: { data: [{ id: "si_mobile_new" }] },
      latest_invoice: { payment_intent: {} },
    });
    mockStripeSubscriptionsCancel.mockResolvedValue({});
    // First retrieve() call is the pre-transaction live-status re-check
    // (must see an active/trialing status or the grant guard rejects
    // before the transaction ever runs); second is the post-cancel
    // confirmation read in the compensation block.
    mockStripeSubscriptionsRetrieve
      .mockResolvedValueOnce({ status: "trialing" })
      .mockResolvedValueOnce({ status: "canceled" });

    const originalRunTransaction = mockDb.runTransaction;
    let transactionAttempt = 0;
    mockDb.runTransaction = (async (fn: (tx: any) => Promise<unknown>) => {
      transactionAttempt++;
      if (transactionAttempt === 1) {
        docStore[`groups/${GROUP_ID}`] = {
          ...docStore[`groups/${GROUP_ID}`],
          isClaimed: true,
          admins: [USER_ID], // same user won — but via the OTHER request
          stripeSubscriptionId: "sub_web_checkout", // NOT this call's own subscription
          subscriptionStatus: "active",
        };
      }
      return originalRunTransaction(fn);
    }) as typeof mockDb.runTransaction;

    const request = makeRequest(USER_ID, {
      groupId: GROUP_ID,
      paymentMethodId: PAYMENT_METHOD_ID,
    });

    // Must reject as a genuine race loss, NOT resolve as a false success —
    // this call's own subscription was never the one that got committed.
    await expect(
      (requestAdminAccessWithSubscription as any)(request), // eslint-disable-line @typescript-eslint/no-explicit-any
    ).rejects.toMatchObject({ code: "failed-precondition" });

    // Its own orphaned subscription must be canceled, not silently left
    // active and billing with no group ever attached.
    expect(mockStripeSubscriptionsCancel).toHaveBeenCalledWith(
      "sub_mobile_new",
    );

    // The group doc still reflects the actual winner's data, untouched.
    const finalGroup = docStore[`groups/${GROUP_ID}`] as Record<
      string,
      unknown
    >;
    expect(finalGroup.stripeSubscriptionId).toBe("sub_web_checkout");
  });

  it("cancel-ack-ambiguity: cancel() rejects but retrieve() confirms canceled — advances the attempt counter", async () => {
    mockDb.runTransaction = (async () => {
      throw new Error("DEADLINE_EXCEEDED: transaction timed out");
    }) as typeof mockDb.runTransaction;
    mockStripeSubscriptionsCancel.mockRejectedValue(
      new Error("Stripe API error: ack lost, but cancellation went through"),
    );
    // ADAPTATION: `retrieve()` is called twice in this flow — once by
    // Task 2's pre-transaction live-status re-check (must see "trialing"
    // so that guard doesn't reject before the transaction ever runs) and
    // once by this compensation block's post-cancel confirmation (the
    // thing actually under test here). A single blanket `mockResolvedValue`
    // of "canceled" would make the FIRST call see "canceled" too, tripping
    // the earlier guard and masking the scenario this test targets.
    mockStripeSubscriptionsRetrieve.mockResolvedValueOnce({
      status: "trialing",
    });
    mockStripeSubscriptionsRetrieve.mockResolvedValueOnce({
      status: "canceled",
    });

    const request = makeRequest(USER_ID, {
      groupId: GROUP_ID,
      paymentMethodId: PAYMENT_METHOD_ID,
    });

    await expect(
      (requestAdminAccessWithSubscription as any)(request), // eslint-disable-line @typescript-eslint/no-explicit-any
    ).rejects.toMatchObject({ code: "internal" });

    const afterFirstAttempt = docStore[`groups/${GROUP_ID}`] as Record<
      string,
      unknown
    >;
    expect(afterFirstAttempt.stripeSubscriptionAttempt).toBe(1);
  });

  it("cancel-ack-ambiguity: cancel() rejects and retrieve() shows still-active — does NOT advance the counter", async () => {
    mockDb.runTransaction = (async () => {
      throw new Error("DEADLINE_EXCEEDED: transaction timed out");
    }) as typeof mockDb.runTransaction;
    mockStripeSubscriptionsCancel.mockRejectedValue(
      new Error("Stripe API error: cancellation genuinely failed"),
    );
    mockStripeSubscriptionsRetrieve.mockResolvedValue({ status: "trialing" });

    const request = makeRequest(USER_ID, {
      groupId: GROUP_ID,
      paymentMethodId: PAYMENT_METHOD_ID,
    });

    await expect(
      (requestAdminAccessWithSubscription as any)(request), // eslint-disable-line @typescript-eslint/no-explicit-any
    ).rejects.toMatchObject({ code: "internal" });

    const afterFirstAttempt = docStore[`groups/${GROUP_ID}`] as Record<
      string,
      unknown
    >;
    expect(afterFirstAttempt.stripeSubscriptionAttempt).toBeUndefined();
  });

  it("a failed re-read during compensation skips cancellation entirely rather than throwing unhandled", async () => {
    mockDb.runTransaction = (async () => {
      throw new Error("DEADLINE_EXCEEDED: transaction timed out");
    }) as typeof mockDb.runTransaction;

    // ADAPTATION: the illustrative brief test grabbed a docRef via
    // `mockDb.collection("groups").doc(GROUP_ID)` and called
    // `.get.mockRejectedValueOnce(...)` on it directly. That doesn't work
    // against this file's actual `buildDocRef()`: every `.doc(docId)` call
    // mints a brand-new object with its own fresh `jest.fn()`s (see
    // `buildCollectionRef` above), and the SUT creates its OWN `groupRef`
    // internally (`db.collection("groups").doc(groupId)`, called once, at
    // the top of the handler) — a completely different object instance
    // than anything grabbed from the test before invoking the SUT. Stubbing
    // a test-side instance would never affect the SUT's own calls.
    //
    // Instead, wrap `mockDb.collection` so that whichever docRef instance
    // the SUT ends up creating for `groups/{GROUP_ID}` has a `.get()` that
    // fails on exactly its SECOND invocation (the initial fetch at the top
    // of the handler must succeed; the post-transaction-failure re-read
    // inside the catch block is the one under test) and behaves normally
    // otherwise.
    const originalCollection = mockDb.collection;
    let groupGetCallCount = 0;
    mockDb.collection = ((collPath: string) => {
      const collRef = originalCollection(collPath);
      if (collPath !== "groups") return collRef;
      return {
        ...collRef,
        doc: (docId: string) => {
          const docRef = collRef.doc(docId);
          if (docId !== GROUP_ID) return docRef;
          const originalGet = docRef.get;
          docRef.get = jest.fn().mockImplementation(async () => {
            groupGetCallCount++;
            if (groupGetCallCount === 2) {
              throw new Error("Firestore unavailable during re-read");
            }
            return originalGet();
          });
          return docRef;
        },
      };
    }) as typeof mockDb.collection;

    const request = makeRequest(USER_ID, {
      groupId: GROUP_ID,
      paymentMethodId: PAYMENT_METHOD_ID,
    });

    await expect(
      (requestAdminAccessWithSubscription as any)(request), // eslint-disable-line @typescript-eslint/no-explicit-any
    ).rejects.toMatchObject({ code: "internal" });

    expect(mockStripeSubscriptionsCancel).not.toHaveBeenCalled();
  });
});

describe("requestAdminAccessWithSubscription — web-checkout residual case (already-billed subscription, lost the claim)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    docStore = {};
    mockDb = buildMockDb();
    setupDefaults();
  });

  it("gives a distinct support-contact error, not a generic internal error, when the web-checkout caller loses the claim", async () => {
    mockStripeSubscriptionsRetrieve.mockResolvedValue({
      id: "sub_already_created",
      status: "trialing",
      metadata: { groupId: GROUP_ID },
      customer: "cus_existing",
      items: { data: [{ id: "si_existing" }] },
    });
    mockDb.runTransaction = (async () => {
      throw new HttpsError(
        "failed-precondition",
        "This group has already been claimed by another admin.",
      );
    }) as typeof mockDb.runTransaction;

    const request = makeRequest(USER_ID, {
      groupId: GROUP_ID,
      subscriptionId: "sub_already_created",
    });

    await expect(
      (requestAdminAccessWithSubscription as any)(request), // eslint-disable-line @typescript-eslint/no-explicit-any
    ).rejects.toMatchObject({
      code: "failed-precondition",
      message: expect.stringContaining("Contact support"),
    });

    // The subscription is NOT auto-canceled — refund implications the
    // backend can't resolve unilaterally.
    expect(mockStripeSubscriptionsCancel).not.toHaveBeenCalled();
  });
});
