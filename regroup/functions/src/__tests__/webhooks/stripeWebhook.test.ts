/**
 * Unit tests for src/webhooks/stripeWebhook.ts
 *
 * Mock strategy:
 *   - stripe: the webhook source instantiates `new Stripe(...)` inline per-request,
 *     so we mock the 'stripe' package constructor directly.
 *   - firebase-admin: mocked with a lightweight in-memory Firestore.
 *   - firebase-functions/v2/https: onRequest is unwrapped to return the handler.
 *   - firebase-functions/params: defineSecret is a no-op stub.
 *   - firebase-functions: logger is silenced.
 */

// ---------------------------------------------------------------------------
// Firestore mock state — declared with mock* prefix so Jest hoisting permits
// them inside jest.mock factory functions.
// ---------------------------------------------------------------------------
const mockRunTransaction = jest.fn();
const mockCollectionStore: Record<string, Record<string, any>> = {};

function mockGetDoc(collection: string, id: string) {
  const data = (mockCollectionStore[collection] ?? {})[id];
  return { exists: !!data, data: () => data ?? {}, id };
}

function mockBuildQuerySnap(
  docs: Array<{ id: string; data: Record<string, any> }>,
) {
  return {
    empty: docs.length === 0,
    docs: docs.map((d) => ({
      id: d.id,
      exists: true,
      data: () => d.data,
      ref: {
        update: jest.fn().mockResolvedValue(undefined),
        set: jest.fn().mockResolvedValue(undefined),
      },
    })),
  };
}

// Mutable query results for .where() chains — tests set these before running.
let mockWhereResults: Array<{ id: string; data: Record<string, any> }> = [];

const mockDocGet = jest.fn();
const mockDocUpdate = jest.fn().mockResolvedValue(undefined);
const mockDocSet = jest.fn().mockResolvedValue(undefined);
const mockCollectionFn = jest.fn();
const mockMessagingSend = jest.fn().mockResolvedValue("message-id");

// Batch write mocks — needed by updateHouseSubscriptionStatus (B10/B8)
const mockBatchUpdate = jest.fn();
const mockBatchCommit = jest.fn().mockResolvedValue(undefined);
const mockBatch = jest.fn(() => ({
  update: mockBatchUpdate,
  commit: mockBatchCommit,
}));

// Stripe subscriptions.retrieve mock — needed by handleInvoicePaymentSucceeded
const mockSubscriptionsRetrieve = jest.fn();

// ---------------------------------------------------------------------------
// firebase-admin mock
// ---------------------------------------------------------------------------
jest.mock("firebase-admin", () => {
  const firestoreFn = jest.fn(() => ({
    collection: mockCollectionFn,
    runTransaction: mockRunTransaction,
    batch: mockBatch,
  }));
  // Static FieldValue used by updateHouseSubscriptionStatus (e.g. FieldValue.delete())
  (firestoreFn as any).FieldValue = {
    delete: jest.fn(() => "__FieldValue.delete__"),
    serverTimestamp: jest.fn(() => "__FieldValue.serverTimestamp__"),
    increment: jest.fn((n: number) => ({ __increment: n })),
  };
  return {
    initializeApp: jest.fn(),
    app: jest.fn(() => ({})),
    firestore: firestoreFn,
    messaging: jest.fn(() => ({ send: mockMessagingSend })),
  };
});

// ---------------------------------------------------------------------------
// firebase-functions/v2/https mock — unwrap onRequest to return the handler
// ---------------------------------------------------------------------------
// The options object is RECORDED, not discarded. It used to be thrown away, so
// deleting a `secrets:` binding passed every test here while collapsing the
// candidate list to one secret in production — the exact failure the candidate
// loop exists to prevent, invisible to the suite.
//
// Stored on globalThis because a jest.mock factory is hoisted above module-scope
// consts, and because onRequest is called at import time: anything recorded on
// the jest.fn itself is wiped by the jest.clearAllMocks() in beforeEach.
jest.mock("firebase-functions/v2/https", () => {
  const actual = jest.requireActual("firebase-functions/v2/https");
  return {
    ...actual,
    onRequest: jest.fn((_optsOrHandler: any, handler?: any) => {
      if (typeof _optsOrHandler === "function") {
        return _optsOrHandler;
      }
      const g = globalThis as any;
      (g.__onRequestOptions ??= []).push(_optsOrHandler);
      return handler;
    }),
  };
});

/** Every options object onRequest was constructed with, in declaration order. */
const recordedOnRequestOptions = (): Array<{ secrets?: unknown[] }> =>
  ((globalThis as any).__onRequestOptions ?? []) as Array<{
    secrets?: unknown[];
  }>;

// ---------------------------------------------------------------------------
// firebase-functions/params mock — defineSecret is a no-op string stub
// ---------------------------------------------------------------------------
jest.mock("firebase-functions/params", () => ({
  defineSecret: jest.fn((name: string) => name),
}));

// ---------------------------------------------------------------------------
// firebase-functions mock — silence logger
// ---------------------------------------------------------------------------
jest.mock("firebase-functions", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Stripe mock — constructEvent is the primary control point
// ---------------------------------------------------------------------------
const mockConstructEvent = jest.fn();
const mockChargesRetrieve = jest.fn();

jest.mock("stripe", () => {
  return jest.fn().mockImplementation(() => ({
    webhooks: { constructEvent: mockConstructEvent },
    charges: { retrieve: mockChargesRetrieve },
    subscriptions: { retrieve: mockSubscriptionsRetrieve },
  }));
});

// ---------------------------------------------------------------------------
// Imports — after all mocks
// ---------------------------------------------------------------------------
import { logger } from "firebase-functions";

import {
  stripeWebhook,
  handleStripeConnectWebhook,
} from "../../webhooks/stripeWebhook";

// ---------------------------------------------------------------------------
// req / res factory helpers
// ---------------------------------------------------------------------------
const makeReq = (body: any = {}, headers: any = {}) => ({
  method: "POST",
  body,
  headers: { "stripe-signature": "valid-sig", ...headers },
  rawBody: Buffer.from(JSON.stringify(body)),
  hostname: "us-central1-myapp.cloudfunctions.net",
  protocol: "https",
  query: {},
  path: "/stripeWebhook",
});

const makeRes = () => {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.send = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.redirect = jest.fn(() => res);
  return res;
};

// ---------------------------------------------------------------------------
// Firestore collection helper — wire up a fresh in-memory collection per test
// ---------------------------------------------------------------------------
function wireCollection(
  whereResultsByCollection: Record<
    string,
    Array<{ id: string; data: Record<string, any> }>
  >,
) {
  mockCollectionFn.mockImplementation((col: string) => {
    const whereSnap = mockBuildQuerySnap(whereResultsByCollection[col] ?? []);
    return {
      where: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue(whereSnap),
          }),
          get: jest.fn().mockResolvedValue(whereSnap),
        }),
        limit: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(whereSnap),
        }),
        get: jest.fn().mockResolvedValue(whereSnap),
      }),
      doc: jest.fn().mockReturnValue({
        get: mockDocGet,
        update: mockDocUpdate,
        set: mockDocSet,
      }),
    };
  });
}

// ---------------------------------------------------------------------------
// Reset between tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  jest.clearAllMocks();
  mockWhereResults = [];

  // Default: idempotency transaction returns "not yet processed"
  mockRunTransaction.mockImplementation(
    async (fn: (txn: any) => Promise<any>) => {
      const txn = {
        get: jest.fn().mockResolvedValue({ exists: false }),
        set: jest.fn(),
      };
      return fn(txn);
    },
  );

  // Default: no Stripe signature errors
  mockConstructEvent.mockImplementation(
    (_body: any, _sig: any, _secret: any) => ({
      id: "evt_test_default",
      type: "unknown.event",
      account: undefined,
      data: { object: {} },
    }),
  );

  // Default: quiet collection mock (empty results)
  wireCollection({});

  // Default: batch resolves successfully (no-op until test overrides collection)
  mockBatchCommit.mockResolvedValue(undefined);

  // Default: subscriptions.retrieve returns subscription with no userId in metadata
  // → resolveOperatorUid returns null → house update is skipped in non-B8 tests
  mockSubscriptionsRetrieve.mockResolvedValue({
    id: "sub_default",
    metadata: {},
  });

  // A test-mode deployment with all four signing secrets bound — what both
  // deployed functions actually get. Previously only the three live/platform vars
  // were set, so `delete process.env.STRIPE_TEST_WEBHOOK_SECRET` in the 500 tests
  // below was a no-op and STRIPE_CONNECT_TEST_WEBHOOK_SECRET was never exercised
  // by any handler test at all.
  //
  // The key is sk_test_, so deployedStripeMode() is 'test': candidates are ordered
  // test-first, the test secret is the one that verifies, and an event with no
  // `livemode` field counts as test-mode. That is the combination
  // verifyStripeWebhook requires, which is why fixtures here need no `livemode`.
  process.env.STRIPE_SECRET_KEY = "sk_test_fake";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_fake";
  process.env.STRIPE_TEST_WEBHOOK_SECRET = "whsec_test_fake";
  process.env.STRIPE_CONNECT_WEBHOOK_SECRET = "whsec_connect_fake";
  process.env.STRIPE_CONNECT_TEST_WEBHOOK_SECRET = "whsec_connect_test_fake";
});

// ===========================================================================
// stripeWebhook — basic routing
// ===========================================================================

describe("stripeWebhook — signature verification", () => {
  it("returns 400 when stripe-signature header is missing", async () => {
    const req = makeReq({}, {}); // override to remove sig header
    (req.headers as any)["stripe-signature"] = undefined;
    const res = makeRes();

    await (stripeWebhook as any)(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith(
      expect.stringContaining("Missing stripe-signature"),
    );
  });

  it("returns 400 when constructEvent throws (invalid signature)", async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error(
        "No signatures found matching the expected signature for payload",
      );
    });

    const req = makeReq();
    const res = makeRes();

    await (stripeWebhook as any)(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith(
      expect.stringContaining("Webhook Error"),
    );
  });
  // The 500 path, which the beforeEach above otherwise never reaches because it
  // configures all four secrets. BOTH platform vars have to be deleted for this
  // to be the no-secret case — deleting one leaves the other as a live candidate.
  // A missing secret is server misconfiguration: Stripe retries 500s, so the
  // event survives until the secret is set, where a 400 would have blamed the
  // sender for a local problem.
  it("returns 500 — not 400 — when no signing secret is configured", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_TEST_WEBHOOK_SECRET;

    const req = makeReq();
    const res = makeRes();

    await (stripeWebhook as any)(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    // constructEvent must never run: there is nothing to verify against, and
    // letting it run is what produced a misleading "invalid signature".
    expect(mockConstructEvent).not.toHaveBeenCalled();
  });

  it("does not leak the variable name into the 500 response body", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_TEST_WEBHOOK_SECRET;

    const req = makeReq();
    const res = makeRes();

    await (stripeWebhook as any)(req, res);

    // The name is useful in logs and useless to an unauthenticated caller.
    expect(res.send).toHaveBeenCalledWith(
      expect.not.stringContaining("STRIPE_"),
    );
  });


  it("returns 405 for non-POST requests", async () => {
    const req = { ...makeReq(), method: "GET" };
    const res = makeRes();

    await (stripeWebhook as any)(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
  });

  it("returns 200 with received:true on a valid but unhandled event type", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_test_1",
      type: "some.unhandled.event",
      account: undefined,
      data: { object: {} },
    });

    const req = makeReq();
    const res = makeRes();

    await (stripeWebhook as any)(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({ received: true }),
    );
  });

  it("skips processing and returns 200 when event was already processed (idempotency)", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_duplicate",
      type: "payment_intent.succeeded",
      account: undefined,
      data: {
        object: { id: "pi_1", amount: 1000, currency: "usd", metadata: {} },
      },
    });

    // Transaction reports the event already exists
    mockRunTransaction.mockImplementation(
      async (fn: (txn: any) => Promise<any>) => {
        const txn = {
          get: jest.fn().mockResolvedValue({ exists: true }),
          set: jest.fn(),
        };
        return fn(txn);
      },
    );

    const req = makeReq();
    const res = makeRes();

    await (stripeWebhook as any)(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({ received: true, duplicate: true }),
    );
  });
});

// ===========================================================================
// stripeWebhook — customer.subscription.updated
// ===========================================================================

describe("stripeWebhook — customer.subscription.updated", () => {
  const subscriptionId = "sub_test_123";
  const houseId = "house_abc";
  const firestoreSubDoc = {
    id: "subDoc1",
    data: {
      houseId,
      stripeCustomerId: "cus_fake",
      stripeSubscriptionId: subscriptionId,
      status: "active",
      currentPeriodEnd: new Date().toISOString(),
      planId: "price_old",
      guestCount: 5,
    },
  };

  const makeSubscriptionEvent = (overrides: Record<string, any> = {}) => ({
    id: "evt_sub_updated",
    type: "customer.subscription.updated",
    account: undefined,
    data: {
      object: {
        id: subscriptionId,
        status: "active",
        billing_cycle_anchor: Math.floor(Date.now() / 1000) + 2592000, // 30 days from now
        items: { data: [{ price: { id: "price_new" } }] },
        metadata: { guestCount: "6" },
        ...overrides,
      },
    },
  });

  it("updates subscription status in Firestore on customer.subscription.updated", async () => {
    const mockUpdate = jest.fn().mockResolvedValue(undefined);
    const subDocRef = { update: mockUpdate, set: jest.fn() };

    mockConstructEvent.mockReturnValue(makeSubscriptionEvent());

    // Wire subscriptions collection to return the test doc
    mockCollectionFn.mockImplementation((col: string) => {
      if (col === "subscriptions") {
        return {
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              get: jest.fn().mockResolvedValue({
                empty: false,
                docs: [
                  {
                    id: firestoreSubDoc.id,
                    data: () => firestoreSubDoc.data,
                    ref: subDocRef,
                  },
                ],
              }),
            }),
          }),
          doc: jest.fn().mockReturnValue({
            get: mockDocGet,
            update: mockUpdate,
            set: mockDocSet,
          }),
        };
      }
      // users / houses — empty results
      return {
        where: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
          }),
          limit: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
          }),
          get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
        }),
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ exists: false }),
          update: jest.fn(),
          set: jest.fn(),
        }),
      };
    });

    const req = makeReq();
    const res = makeRes();

    await (stripeWebhook as any)(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "active",
        planId: "price_new",
        guestCount: 6,
      }),
    );
  });

  it("sends FCM notification when subscription transitions to past_due", async () => {
    const mockUpdate = jest.fn().mockResolvedValue(undefined);
    const subDocRef = { update: mockUpdate, set: jest.fn() };

    // Existing status is "active", incoming is "past_due" — should notify
    const existingDoc = { ...firestoreSubDoc.data, status: "active" };

    mockConstructEvent.mockReturnValue(
      makeSubscriptionEvent({ status: "past_due" }),
    );

    mockCollectionFn.mockImplementation((col: string) => {
      if (col === "subscriptions") {
        return {
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              get: jest.fn().mockResolvedValue({
                empty: false,
                docs: [
                  {
                    id: firestoreSubDoc.id,
                    data: () => existingDoc,
                    ref: subDocRef,
                  },
                ],
              }),
            }),
          }),
          doc: jest.fn().mockReturnValue({
            get: mockDocGet,
            update: mockUpdate,
            set: mockDocSet,
          }),
        };
      }
      if (col === "users") {
        return {
          where: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
            }),
            get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
          }),
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ exists: false }),
          }),
        };
      }
      return {
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
          }),
          get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
        }),
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ exists: false }),
        }),
      };
    });

    const req = makeReq();
    const res = makeRes();

    await (stripeWebhook as any)(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: "past_due" }),
    );
  });

  it("returns 200 without crashing when subscription is not found in Firestore", async () => {
    mockConstructEvent.mockReturnValue(makeSubscriptionEvent());

    // subscriptions returns empty
    wireCollection({ subscriptions: [] });

    const req = makeReq();
    const res = makeRes();

    await (stripeWebhook as any)(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("handles a single-item tier subscription (no houseItemId/guestItemId) without throwing", async () => {
    const mockUpdate = jest.fn().mockResolvedValue(undefined);
    const subDocRef = { update: mockUpdate, set: jest.fn() };

    // Single line item carrying a tier price, plus tier metadata — mirrors a
    // subscription created via createTierSubscription.
    mockConstructEvent.mockReturnValue(
      makeSubscriptionEvent({
        items: {
          data: [{ id: "si_tier", price: { id: "price_tier_starter" } }],
        },
        metadata: {
          userId: "user_op",
          houseType: "traditional",
          tier: "starter",
        },
      }),
    );

    mockCollectionFn.mockImplementation((col: string) => {
      if (col === "subscriptions") {
        return {
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              get: jest.fn().mockResolvedValue({
                empty: false,
                docs: [
                  {
                    id: firestoreSubDoc.id,
                    data: () => firestoreSubDoc.data,
                    ref: subDocRef,
                  },
                ],
              }),
            }),
          }),
          doc: jest.fn().mockReturnValue({
            get: mockDocGet,
            update: mockUpdate,
            set: mockDocSet,
          }),
        };
      }
      return {
        where: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
          }),
          limit: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
          }),
          get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
        }),
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ exists: false }),
          update: jest.fn(),
          set: jest.fn(),
        }),
      };
    });

    const req = makeReq();
    const res = makeRes();

    await (stripeWebhook as any)(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    // planId reconciled from the single tier line item; guestCount falls back to
    // the existing doc value since tier subs carry no per-guest quantity.
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "active",
        planId: "price_tier_starter",
        guestCount: 5,
      }),
    );
  });
});

// ===========================================================================
// stripeWebhook — payment_intent.succeeded
// ===========================================================================

describe("stripeWebhook — payment_intent.succeeded", () => {
  it("writes payment doc and decrements guest balance", async () => {
    const guestId = "guest_1";
    const houseId = "house_1";
    const userId = "user_1";

    const mockGuestUpdate = jest.fn().mockResolvedValue(undefined);
    const mockPaymentSet = jest.fn().mockResolvedValue(undefined);
    const mockUserGet = jest.fn().mockResolvedValue({
      exists: true,
      data: () => ({ messagingToken: [] }),
    });

    mockConstructEvent.mockReturnValue({
      id: "evt_pi_succeeded",
      type: "payment_intent.succeeded",
      account: undefined,
      data: {
        object: {
          id: "pi_test_1",
          amount: 50000, // $500.00
          currency: "usd",
          metadata: { guestId, houseId },
        },
      },
    });

    mockCollectionFn.mockImplementation((col: string) => {
      if (col === "guests") {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => ({
                userId,
                firstName: "Jane",
                lastName: "Doe",
                balance: 600,
                houseId,
                rentDueDate: "2026-06-30",
              }),
            }),
            update: mockGuestUpdate,
          }),
        };
      }
      if (col === "payments") {
        return {
          doc: jest.fn().mockReturnValue({
            set: mockPaymentSet,
            update: jest.fn(),
          }),
        };
      }
      if (col === "users") {
        return {
          doc: jest.fn().mockReturnValue({ get: mockUserGet }),
          where: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
            }),
            get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
          }),
        };
      }
      return {
        where: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
          }),
          get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
        }),
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ exists: false }),
          update: jest.fn(),
          set: jest.fn(),
        }),
      };
    });

    const req = makeReq();
    const res = makeRes();

    await (stripeWebhook as any)(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    // Payment doc should be written with merge:true, including the guest's
    // rentDueDate captured at charge time (#34 on-time rate).
    expect(mockPaymentSet).toHaveBeenCalledWith(
      expect.objectContaining({
        stripePaymentIntentId: "pi_test_1",
        amount: 500,
        status: "succeeded",
        houseId,
        guestId,
        dueDate: "2026-06-30",
      }),
      { merge: true },
    );
    // Guest rentOwed is atomically decremented by the paid amount in cents.
    expect(mockGuestUpdate).toHaveBeenCalledWith({
      rentOwed: { __increment: -50000 },
    });
  });

  it("still writes partial payment doc when metadata is missing", async () => {
    const mockPaymentSet = jest.fn().mockResolvedValue(undefined);

    mockConstructEvent.mockReturnValue({
      id: "evt_pi_no_meta",
      type: "payment_intent.succeeded",
      account: undefined,
      data: {
        object: {
          id: "pi_no_meta",
          amount: 10000,
          currency: "usd",
          metadata: {}, // no guestId / houseId
        },
      },
    });

    mockCollectionFn.mockImplementation((col: string) => {
      if (col === "payments") {
        return {
          doc: jest
            .fn()
            .mockReturnValue({ set: mockPaymentSet, update: jest.fn() }),
        };
      }
      return {
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ exists: false }),
          update: jest.fn(),
          set: jest.fn(),
        }),
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
          }),
        }),
      };
    });

    const req = makeReq();
    const res = makeRes();

    await (stripeWebhook as any)(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockPaymentSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "succeeded",
        houseId: null,
        guestId: null,
      }),
      { merge: true },
    );
  });
});

// ===========================================================================
// stripeWebhook — charge.refunded (#35 refund netting)
// ===========================================================================

describe("stripeWebhook — charge.refunded", () => {
  it("merges refundedAmountCents onto the payment doc (string payment_intent)", async () => {
    const mockPaymentSet = jest.fn().mockResolvedValue(undefined);

    mockConstructEvent.mockReturnValue({
      id: "evt_charge_refunded",
      type: "charge.refunded",
      account: undefined,
      data: {
        object: {
          id: "ch_test_1",
          payment_intent: "pi_test_1",
          amount: 50000,
          amount_refunded: 15000, // $150 refunded (cents)
        },
      },
    });

    mockCollectionFn.mockImplementation((col: string) => {
      if (col === "payments") {
        return {
          doc: jest
            .fn()
            .mockReturnValue({ set: mockPaymentSet, update: jest.fn() }),
        };
      }
      return {
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ exists: false }),
          update: jest.fn(),
          set: jest.fn(),
        }),
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
          }),
        }),
      };
    });

    const req = makeReq();
    const res = makeRes();

    await (stripeWebhook as any)(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockPaymentSet).toHaveBeenCalledWith(
      expect.objectContaining({ refundedAmountCents: 15000 }),
      { merge: true },
    );
  });

  it("resolves payment_intent from an expanded object form", async () => {
    const mockPaymentSet = jest.fn().mockResolvedValue(undefined);

    mockConstructEvent.mockReturnValue({
      id: "evt_charge_refunded_obj",
      type: "charge.refunded",
      account: undefined,
      data: {
        object: {
          id: "ch_test_2",
          payment_intent: { id: "pi_test_2" }, // expanded object
          amount: 20000,
          amount_refunded: 20000,
        },
      },
    });

    mockCollectionFn.mockImplementation((col: string) => {
      if (col === "payments") {
        return {
          doc: jest
            .fn()
            .mockReturnValue({ set: mockPaymentSet, update: jest.fn() }),
        };
      }
      return {
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ exists: false }),
          update: jest.fn(),
          set: jest.fn(),
        }),
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
          }),
        }),
      };
    });

    const req = makeReq();
    const res = makeRes();

    await (stripeWebhook as any)(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockPaymentSet).toHaveBeenCalledWith(
      expect.objectContaining({ refundedAmountCents: 20000 }),
      { merge: true },
    );
  });

  it("no-ops (no write) when the charge has no payment_intent", async () => {
    const mockPaymentSet = jest.fn().mockResolvedValue(undefined);

    mockConstructEvent.mockReturnValue({
      id: "evt_charge_refunded_no_pi",
      type: "charge.refunded",
      account: undefined,
      data: {
        object: {
          id: "ch_test_3",
          payment_intent: null,
          amount: 10000,
          amount_refunded: 10000,
        },
      },
    });

    mockCollectionFn.mockImplementation((col: string) => {
      if (col === "payments") {
        return {
          doc: jest
            .fn()
            .mockReturnValue({ set: mockPaymentSet, update: jest.fn() }),
        };
      }
      return {
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ exists: false }),
          update: jest.fn(),
          set: jest.fn(),
        }),
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
          }),
        }),
      };
    });

    const req = makeReq();
    const res = makeRes();

    await (stripeWebhook as any)(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockPaymentSet).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// stripeWebhook — invoice.payment_succeeded
// ===========================================================================

describe("stripeWebhook — invoice.payment_succeeded", () => {
  it("updates subscription status to active", async () => {
    const stripeSubscriptionId = "sub_invoice_1";
    const mockUpdate = jest.fn().mockResolvedValue(undefined);
    const subDocRef = { update: mockUpdate, set: jest.fn() };

    mockConstructEvent.mockReturnValue({
      id: "evt_invoice_ok",
      type: "invoice.payment_succeeded",
      account: undefined,
      data: {
        object: {
          id: "in_test_1",
          attempt_count: 1,
          next_payment_attempt: null,
          parent: {
            type: "subscription_details",
            subscription_details: { subscription: stripeSubscriptionId },
          },
          lines: {
            data: [
              { period: { end: Math.floor(Date.now() / 1000) + 2592000 } },
            ],
          },
        },
      },
    });

    mockCollectionFn.mockImplementation((col: string) => {
      if (col === "subscriptions") {
        return {
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              get: jest.fn().mockResolvedValue({
                empty: false,
                docs: [
                  {
                    id: "subDoc1",
                    data: () => ({ houseId: "house_1" }),
                    ref: subDocRef,
                  },
                ],
              }),
            }),
          }),
          doc: jest.fn().mockReturnValue({
            get: mockDocGet,
            update: mockUpdate,
            set: mockDocSet,
          }),
        };
      }
      return {
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
          }),
        }),
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ exists: false }),
          update: jest.fn(),
          set: jest.fn(),
        }),
      };
    });

    const req = makeReq();
    const res = makeRes();

    await (stripeWebhook as any)(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: "active" }),
    );
  });
});

// ===========================================================================
// stripeWebhook — customer.subscription.deleted
// ===========================================================================

describe("stripeWebhook — customer.subscription.deleted", () => {
  it("updates subscription status to canceled", async () => {
    const stripeSubscriptionId = "sub_deleted_1";
    const canceledAt = Math.floor(Date.now() / 1000) - 3600;
    const mockUpdate = jest.fn().mockResolvedValue(undefined);
    const subDocRef = { update: mockUpdate, set: jest.fn() };

    mockConstructEvent.mockReturnValue({
      id: "evt_sub_deleted",
      type: "customer.subscription.deleted",
      account: undefined,
      data: {
        object: {
          id: stripeSubscriptionId,
          canceled_at: canceledAt,
          status: "canceled",
          items: { data: [] },
          metadata: {},
        },
      },
    });

    mockCollectionFn.mockImplementation((col: string) => {
      if (col === "subscriptions") {
        return {
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              get: jest.fn().mockResolvedValue({
                empty: false,
                docs: [
                  {
                    id: "subDoc2",
                    data: () => ({ houseId: "house_2" }),
                    ref: subDocRef,
                  },
                ],
              }),
            }),
          }),
          doc: jest.fn().mockReturnValue({
            get: mockDocGet,
            update: mockUpdate,
            set: mockDocSet,
          }),
        };
      }
      if (col === "users") {
        return {
          where: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
            }),
          }),
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ exists: false }),
          }),
        };
      }
      return {
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
          }),
        }),
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ exists: false }),
          update: jest.fn(),
          set: jest.fn(),
        }),
      };
    });

    const req = makeReq();
    const res = makeRes();

    await (stripeWebhook as any)(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "canceled",
        canceledAt: new Date(canceledAt * 1000).toISOString(),
      }),
    );
  });
});

// ===========================================================================
// stripeWebhook — account.updated (Connect)
// ===========================================================================

describe("stripeWebhook — account.updated", () => {
  it("updates house stripeStatus to active when charges and payouts are enabled", async () => {
    const stripeAccountId = "acct_test_1";
    const houseDocId = "house_connect_1";
    const mockHouseUpdate = jest.fn().mockResolvedValue(undefined);

    mockConstructEvent.mockReturnValue({
      id: "evt_acct_updated",
      type: "account.updated",
      account: stripeAccountId,
      data: {
        object: {
          id: stripeAccountId,
          charges_enabled: true,
          payouts_enabled: true,
          requirements: {
            currently_due: [],
            eventually_due: [],
            disabled_reason: null,
          },
        },
      },
    });

    mockCollectionFn.mockImplementation((col: string) => {
      if (col === "houses") {
        return {
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              get: jest.fn().mockResolvedValue({
                empty: false,
                docs: [
                  {
                    id: houseDocId,
                    data: () => ({ stripeAccountId, stripeStatus: "pending" }),
                    ref: { update: mockHouseUpdate, set: jest.fn() },
                  },
                ],
              }),
            }),
          }),
          doc: jest
            .fn()
            .mockReturnValue({ update: mockHouseUpdate, set: jest.fn() }),
        };
      }
      return {
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
          }),
        }),
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ exists: false }),
          update: jest.fn(),
          set: jest.fn(),
        }),
      };
    });

    const req = makeReq();
    const res = makeRes();

    await (stripeWebhook as any)(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockHouseUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeStatus: "active",
        stripeChargesEnabled: true,
        stripePayoutsEnabled: true,
      }),
    );
  });

  it("sets stripeStatus to restricted when requirements are pending", async () => {
    const stripeAccountId = "acct_restricted";
    const mockHouseUpdate = jest.fn().mockResolvedValue(undefined);

    mockConstructEvent.mockReturnValue({
      id: "evt_acct_restricted",
      type: "account.updated",
      account: stripeAccountId,
      data: {
        object: {
          id: stripeAccountId,
          charges_enabled: false,
          payouts_enabled: false,
          requirements: {
            currently_due: ["individual.id_number"],
            eventually_due: [],
            disabled_reason: "requirements.past_due",
          },
        },
      },
    });

    mockCollectionFn.mockImplementation((col: string) => {
      if (col === "houses") {
        return {
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              get: jest.fn().mockResolvedValue({
                empty: false,
                docs: [
                  {
                    id: "house_r",
                    data: () => ({ stripeAccountId, stripeStatus: "active" }),
                    ref: { update: mockHouseUpdate, set: jest.fn() },
                  },
                ],
              }),
            }),
          }),
          doc: jest
            .fn()
            .mockReturnValue({ update: mockHouseUpdate, set: jest.fn() }),
        };
      }
      if (col === "users") {
        return {
          where: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
            }),
          }),
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ exists: false }),
          }),
        };
      }
      return {
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
          }),
        }),
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ exists: false }),
          update: jest.fn(),
          set: jest.fn(),
        }),
      };
    });

    const req = makeReq();
    const res = makeRes();

    await (stripeWebhook as any)(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockHouseUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ stripeStatus: "restricted" }),
    );
  });
});

// ===========================================================================
// handleStripeConnectWebhook — basic tests
// ===========================================================================

describe("handleStripeConnectWebhook", () => {
  it("returns 405 for non-POST requests", async () => {
    const req = { ...makeReq(), method: "GET" };
    const res = makeRes();

    await (handleStripeConnectWebhook as any)(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
  });

  it("returns 400 when stripe-signature header is missing", async () => {
    const req = makeReq();
    (req.headers as any)["stripe-signature"] = undefined;
    const res = makeRes();

    await (handleStripeConnectWebhook as any)(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 400 when signature verification fails", async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error("Invalid signature");
    });

    const req = makeReq();
    const res = makeRes();

    await (handleStripeConnectWebhook as any)(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("handles account.application.deauthorized by marking house as disconnected", async () => {
    const stripeAccountId = "acct_deauth_1";
    const mockHouseUpdate = jest.fn().mockResolvedValue(undefined);

    mockConstructEvent.mockReturnValue({
      id: "evt_deauth",
      type: "account.application.deauthorized",
      account: stripeAccountId,
      data: { object: { id: "app_id" } },
    });

    mockCollectionFn.mockImplementation((col: string) => {
      if (col === "houses") {
        return {
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              get: jest.fn().mockResolvedValue({
                empty: false,
                docs: [
                  {
                    id: "house_deauth",
                    data: () => ({ stripeAccountId, stripeStatus: "active" }),
                    ref: { update: mockHouseUpdate, set: jest.fn() },
                  },
                ],
              }),
            }),
          }),
          doc: jest
            .fn()
            .mockReturnValue({ update: mockHouseUpdate, set: jest.fn() }),
        };
      }
      return {
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
          }),
        }),
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ exists: false }),
          update: jest.fn(),
          set: jest.fn(),
        }),
      };
    });

    const req = makeReq();
    const res = makeRes();

    await (handleStripeConnectWebhook as any)(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockHouseUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeStatus: "disconnected",
        stripeChargesEnabled: false,
        stripePayoutsEnabled: false,
      }),
    );
  });

  it("returns 200 for unhandled Connect event types", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_unknown_connect",
      type: "some.unknown.connect.event",
      account: undefined,
      data: { object: {} },
    });

    const req = makeReq();
    const res = makeRes();

    await (handleStripeConnectWebhook as any)(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({ received: true }),
    );
  });

  it("skips processing and returns 200 when the Connect event was already processed (idempotency)", async () => {
    const mockHouseUpdate = jest.fn().mockResolvedValue(undefined);

    mockConstructEvent.mockReturnValue({
      id: "evt_connect_duplicate",
      type: "account.application.deauthorized",
      account: "acct_dup",
      data: { object: { id: "app_id" } },
    });

    // Transaction reports the event already exists.
    mockRunTransaction.mockImplementation(
      async (fn: (txn: any) => Promise<any>) => {
        const txn = {
          get: jest.fn().mockResolvedValue({ exists: true }),
          set: jest.fn(),
        };
        return fn(txn);
      },
    );

    // If idempotency works, the deauthorization handler (and its house write)
    // must never run.
    mockCollectionFn.mockImplementation((col: string) => {
      if (col === "houses") {
        return {
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              get: jest.fn().mockResolvedValue({
                empty: false,
                docs: [
                  {
                    id: "house_dup",
                    data: () => ({ stripeAccountId: "acct_dup" }),
                    ref: { update: mockHouseUpdate, set: jest.fn() },
                  },
                ],
              }),
            }),
          }),
          doc: jest
            .fn()
            .mockReturnValue({ update: mockHouseUpdate, set: jest.fn() }),
        };
      }
      return {
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
          }),
        }),
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ exists: false }),
          update: jest.fn(),
          set: jest.fn(),
        }),
      };
    });

    const req = makeReq();
    const res = makeRes();

    await (handleStripeConnectWebhook as any)(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({ received: true, duplicate: true }),
    );
    expect(mockHouseUpdate).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// B8 — house.subscriptionStatus propagation
//
// These tests verify that subscription lifecycle events not only update the
// subscriptions collection but also batch-write subscriptionStatus (and
// optionally guestGraceEndsAt) to every house document owned by the operator.
// ===========================================================================

// Builds a mockCollectionFn implementation that returns:
//   - houses: one doc owned by operatorUid (matched by adminIds array-contains)
//   - subscriptions: one doc linking stripeSubscriptionId → houseId + userId
//   - everything else: empty
function wireHousesForOperator(
  operatorUid: string,
  houseId: string,
  houseDocRef: { update: jest.Mock; set: jest.Mock },
) {
  const houseDoc = {
    id: houseId,
    data: () => ({ subscriptionStatus: "active", adminIds: [operatorUid] }),
    ref: houseDocRef,
  };

  return (col: string) => {
    if (col === "houses") {
      return {
        // where(field, op, value) — returns house doc for adminIds query, empty for adminId query
        where: jest.fn().mockImplementation((field: string) => ({
          get: jest
            .fn()
            .mockResolvedValue(
              field === "adminIds"
                ? { empty: false, docs: [houseDoc] }
                : { empty: true, docs: [] },
            ),
        })),
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ exists: false }),
          update: jest.fn(),
          set: jest.fn(),
        }),
      };
    }
    if (col === "subscriptions") {
      return {
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              empty: false,
              docs: [
                {
                  id: "subDoc_b8",
                  data: () => ({
                    stripeSubscriptionId: "sub_b8",
                    houseId,
                    userId: operatorUid,
                  }),
                  ref: {
                    update: jest.fn().mockResolvedValue(undefined),
                    set: jest.fn(),
                  },
                },
              ],
            }),
          }),
        }),
        doc: jest.fn().mockReturnValue({
          get: mockDocGet,
          update: mockDocUpdate,
          set: mockDocSet,
        }),
      };
    }
    // Default — users and any other collections return empty
    return {
      where: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
        }),
        get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
        where: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
        }),
      }),
      doc: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue({ exists: false }),
        update: jest.fn(),
        set: jest.fn(),
      }),
    };
  };
}

describe("B8 — house.subscriptionStatus propagation", () => {
  it("invoice.payment_succeeded sets house subscriptionStatus to active", async () => {
    const operatorUid = "uid_b8_1";
    const houseId = "house_b8_1";
    const houseRef = { update: jest.fn(), set: jest.fn() };

    // resolveOperatorUid fast path: userId in Stripe subscription metadata
    mockSubscriptionsRetrieve.mockResolvedValue({
      id: "sub_b8",
      metadata: { userId: operatorUid },
    });

    mockConstructEvent.mockReturnValue({
      id: "evt_b8_invoice_ok",
      type: "invoice.payment_succeeded",
      account: undefined,
      data: {
        object: {
          id: "in_b8_1",
          attempt_count: 1,
          next_payment_attempt: null,
          parent: {
            type: "subscription_details",
            subscription_details: { subscription: "sub_b8" },
          },
          lines: {
            data: [
              { period: { end: Math.floor(Date.now() / 1000) + 2592000 } },
            ],
          },
        },
      },
    });

    mockCollectionFn.mockImplementation(
      wireHousesForOperator(operatorUid, houseId, houseRef),
    );

    await (stripeWebhook as any)(makeReq(), makeRes());

    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
    expect(mockBatchUpdate).toHaveBeenCalledWith(
      houseRef,
      expect.objectContaining({ subscriptionStatus: "active" }),
    );
  });

  it("customer.subscription.deleted sets house subscriptionStatus to canceled", async () => {
    const operatorUid = "uid_b8_2";
    const houseId = "house_b8_2";
    const houseRef = { update: jest.fn(), set: jest.fn() };

    // subscription object carries userId in metadata — resolveOperatorUid fast path
    mockConstructEvent.mockReturnValue({
      id: "evt_b8_sub_deleted",
      type: "customer.subscription.deleted",
      account: undefined,
      data: {
        object: {
          id: "sub_b8",
          canceled_at: Math.floor(Date.now() / 1000) - 100,
          status: "canceled",
          items: { data: [] },
          metadata: { userId: operatorUid },
        },
      },
    });

    mockCollectionFn.mockImplementation(
      wireHousesForOperator(operatorUid, houseId, houseRef),
    );

    await (stripeWebhook as any)(makeReq(), makeRes());

    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
    expect(mockBatchUpdate).toHaveBeenCalledWith(
      houseRef,
      expect.objectContaining({ subscriptionStatus: "canceled" }),
    );
  });

  it("customer.subscription.updated (past_due) sets house subscriptionStatus to past_due", async () => {
    const operatorUid = "uid_b8_3";
    const houseId = "house_b8_3";
    const houseRef = { update: jest.fn(), set: jest.fn() };

    mockConstructEvent.mockReturnValue({
      id: "evt_b8_sub_past_due",
      type: "customer.subscription.updated",
      account: undefined,
      data: {
        object: {
          id: "sub_b8",
          status: "past_due",
          billing_cycle_anchor: Math.floor(Date.now() / 1000) + 2592000,
          items: { data: [{ price: { id: "price_b8" } }] },
          metadata: { guestCount: "3", userId: operatorUid },
        },
      },
    });

    mockCollectionFn.mockImplementation(
      wireHousesForOperator(operatorUid, houseId, houseRef),
    );

    await (stripeWebhook as any)(makeReq(), makeRes());

    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
    expect(mockBatchUpdate).toHaveBeenCalledWith(
      houseRef,
      expect.objectContaining({ subscriptionStatus: "past_due" }),
    );
  });

  it("invoice.payment_failed sets house subscriptionStatus to past_due with guestGraceEndsAt", async () => {
    const operatorUid = "uid_b8_4";
    const houseId = "house_b8_4";
    const houseRef = { update: jest.fn(), set: jest.fn() };

    mockConstructEvent.mockReturnValue({
      id: "evt_b8_invoice_failed",
      type: "invoice.payment_failed",
      account: undefined,
      data: {
        object: {
          id: "in_b8_failed",
          attempt_count: 1,
          next_payment_attempt: Math.floor(Date.now() / 1000) + 86400,
          parent: {
            type: "subscription_details",
            subscription_details: { subscription: "sub_b8" },
          },
          lines: { data: [] },
        },
      },
    });

    mockCollectionFn.mockImplementation(
      wireHousesForOperator(operatorUid, houseId, houseRef),
    );

    await (stripeWebhook as any)(makeReq(), makeRes());

    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
    expect(mockBatchUpdate).toHaveBeenCalledWith(
      houseRef,
      expect.objectContaining({
        subscriptionStatus: "past_due",
        guestGraceEndsAt: expect.any(String),
      }),
    );
  });

  it("skips batch commit when operator has no houses in Firestore", async () => {
    const operatorUid = "uid_b8_no_houses";

    mockConstructEvent.mockReturnValue({
      id: "evt_b8_no_houses",
      type: "customer.subscription.deleted",
      account: undefined,
      data: {
        object: {
          id: "sub_b8_nh",
          canceled_at: Math.floor(Date.now() / 1000) - 100,
          status: "canceled",
          items: { data: [] },
          metadata: { userId: operatorUid },
        },
      },
    });

    // subscriptions returns a doc, but houses queries both return empty
    mockCollectionFn.mockImplementation((col: string) => {
      if (col === "subscriptions") {
        return {
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              get: jest.fn().mockResolvedValue({
                empty: false,
                docs: [
                  {
                    id: "subDoc_nh",
                    data: () => ({
                      houseId: "house_gone",
                      userId: operatorUid,
                    }),
                    ref: {
                      update: jest.fn().mockResolvedValue(undefined),
                      set: jest.fn(),
                    },
                  },
                ],
              }),
            }),
          }),
          doc: jest
            .fn()
            .mockReturnValue({ get: mockDocGet, update: mockDocUpdate }),
        };
      }
      // houses returns empty for both adminIds and adminId queries
      return {
        where: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
          where: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
          }),
          limit: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
          }),
        }),
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ exists: false }),
          update: jest.fn(),
        }),
      };
    });

    await (stripeWebhook as any)(makeReq(), makeRes());

    // updateHouseSubscriptionStatus returns early — batch.commit must NOT be called
    expect(mockBatchCommit).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Candidate loop + mode gate
//
// Behavioural coverage for the two things the rest of this suite could not see:
// that EVERY configured signing secret is tried, and that a VERIFIED event whose
// Stripe mode disagrees with this deployment is rejected.
//
// Before these, the whole suite passed with multi-candidate verification reverted
// to a single secret, and nothing proved a wrong secret was rejected at all:
// rejection was only ever simulated by throwing for every secret at once, so a
// handler that ignored the secret entirely would have passed.
//
// secretFor() makes constructEvent secret-aware — the control these tests need.
// ===========================================================================

/**
 * A constructEvent implementation that behaves differently per signing secret.
 * `byValue` maps a secret VALUE to either an event to return or an Error to throw;
 * an unlisted secret throws the generic Stripe signature error.
 */
const constructEventBySecret = (
  byValue: Record<string, Error | Record<string, unknown>>,
) =>
  mockConstructEvent.mockImplementation(
    (_body: any, _sig: any, secret: string) => {
      const outcome = byValue[secret];
      if (outcome === undefined) {
        throw new Error(
          "No signatures found matching the expected signature for payload",
        );
      }
      if (outcome instanceof Error) {
        throw outcome;
      }
      return outcome;
    },
  );

/** Secret values constructEvent was offered, in the order it was offered them. */
const secretsTried = () =>
  mockConstructEvent.mock.calls.map((c: any[]) => c[2]);

const testModeEvent = (overrides: Record<string, unknown> = {}) => ({
  id: "evt_mode_test",
  type: "payment_intent.succeeded",
  account: undefined,
  livemode: false,
  data: { object: { id: "pi_1", metadata: {} } },
  ...overrides,
});

describe("stripeWebhook — candidate loop", () => {
  it("tries every configured secret rather than stopping at the first failure", async () => {
    // Test-mode deployment, so the order is [test secret, live secret]. The test
    // secret fails; the live secret is still offered.
    constructEventBySecret({
      whsec_test_fake: new Error("Timestamp outside the tolerance zone"),
      whsec_fake: testModeEvent({ livemode: true }),
    });

    await (stripeWebhook as any)(makeReq(), makeRes());

    // A single-candidate handler calls constructEvent once and never reaches the
    // second secret. This is the assertion that fails on that revert.
    expect(secretsTried()).toEqual(["whsec_test_fake", "whsec_fake"]);
    expect(mockConstructEvent).toHaveBeenCalledTimes(2);
  });

  it("rejects with 400 when no candidate verifies, having tried them all", async () => {
    constructEventBySecret({}); // every secret throws the generic error

    const res = makeRes();
    await (stripeWebhook as any)(makeReq(), res);

    expect(secretsTried()).toEqual(["whsec_test_fake", "whsec_fake"]);
    expect(res.status).toHaveBeenCalledWith(400);
    // Nothing downstream ran: no idempotency write, no document mutation.
    expect(mockRunTransaction).not.toHaveBeenCalled();
    expect(mockDocUpdate).not.toHaveBeenCalled();
  });

  it("rejects a WRONG secret while accepting the right one", async () => {
    // Only the live secret verifies. On a test-mode deployment that is the wrong
    // secret, so this must be refused — proving the handler does not treat any
    // secret as good enough. Previously mockConstructEvent returned a valid event
    // for every secret, so no test could tell these cases apart.
    constructEventBySecret({ whsec_fake: testModeEvent({ livemode: true }) });

    const res = makeRes();
    await (stripeWebhook as any)(makeReq(), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockRunTransaction).not.toHaveBeenCalled();
  });

  it("preserves the FIRST candidate's error, not only the last", async () => {
    // A replay ("Timestamp outside the tolerance zone") on candidate 1 is the
    // diagnostic failure; candidate 2's generic message is noise. Overwriting one
    // variable per iteration reported only the latter.
    constructEventBySecret({
      whsec_test_fake: new Error("Timestamp outside the tolerance zone"),
    });

    await (stripeWebhook as any)(makeReq(), makeRes());

    const warn = (logger.warn as jest.Mock).mock.calls.find((c) =>
      String(c[0]).includes("rejected (signature)"),
    );
    expect(warn).toBeDefined();
    expect(warn![1].errors[0]).toContain("Timestamp outside");
    expect(warn![1].errors[1]).toContain("No signatures found");
  });

  it("binds both platform signing secrets, so the candidate list cannot collapse", () => {
    // Asserted on the real options object. Dropping STRIPE_TEST_WEBHOOK_SECRET
    // here leaves one candidate in production; every other test in this file
    // would still pass.
    const platformOpts = recordedOnRequestOptions().find((o) =>
      (o.secrets ?? []).includes("STRIPE_WEBHOOK_SECRET"),
    );
    expect(platformOpts).toBeDefined();
    expect(platformOpts!.secrets).toEqual(
      expect.arrayContaining([
        "STRIPE_SECRET_KEY",
        "STRIPE_WEBHOOK_SECRET",
        "STRIPE_TEST_WEBHOOK_SECRET",
      ]),
    );
  });
});

describe("stripeWebhook — mode gate", () => {
  // The regression this guards. Both mode secrets are bound to the live function,
  // so without a post-verification mode check a test-mode-signed event verifies
  // and is processed against production data — and the handlers resolve their
  // target from event METADATA, not a Stripe lookup, so a payment_intent event
  // decrements a real guest's rentOwed. The pre-rework single-secret code
  // returned 400 here.
  it("rejects a verified TEST-mode event on a LIVE deployment", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_live_fake";
    constructEventBySecret({ whsec_fake: testModeEvent({ livemode: false }) });

    const res = makeRes();
    await (stripeWebhook as any)(makeReq(), res);

    expect(res.status).toHaveBeenCalledWith(400);
    // Verification happened, so this is the mode gate and not a signature failure.
    expect(mockConstructEvent).toHaveBeenCalled();
    // Nothing was written: no idempotency marker, no guest/payment mutation.
    expect(mockRunTransaction).not.toHaveBeenCalled();
    expect(mockDocUpdate).not.toHaveBeenCalled();
    expect(mockDocSet).not.toHaveBeenCalled();
  });

  it("rejects an event claiming livemode:true that was signed with the TEST secret", async () => {
    // The other half of the gate. Matching the event's mode against the
    // deployment alone is not enough: an attacker holding the low-value test
    // signing secret would simply set livemode:true.
    process.env.STRIPE_SECRET_KEY = "sk_live_fake";
    constructEventBySecret({
      whsec_test_fake: testModeEvent({ livemode: true }),
    });

    const res = makeRes();
    await (stripeWebhook as any)(makeReq(), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockRunTransaction).not.toHaveBeenCalled();
  });

  it("rejects a verified LIVE-mode event on a TEST deployment", async () => {
    // Symmetric: a test deployment must not act on production events either.
    constructEventBySecret({ whsec_fake: testModeEvent({ livemode: true }) });

    const res = makeRes();
    await (stripeWebhook as any)(makeReq(), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockRunTransaction).not.toHaveBeenCalled();
  });

  it("treats a payload with no livemode field as test-mode", async () => {
    // Never coerce a missing field into satisfying a live deployment.
    process.env.STRIPE_SECRET_KEY = "sk_live_fake";
    const noLivemode = testModeEvent();
    delete (noLivemode as any).livemode;
    constructEventBySecret({ whsec_fake: noLivemode });

    const res = makeRes();
    await (stripeWebhook as any)(makeReq(), res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("accepts a LIVE event on a LIVE deployment signed with the live secret", async () => {
    // The gate must not reject the one combination that is correct.
    process.env.STRIPE_SECRET_KEY = "sk_live_fake";
    constructEventBySecret({
      whsec_fake: {
        id: "evt_live_ok",
        type: "some.unhandled.event",
        account: undefined,
        livemode: true,
        data: { object: {} },
      },
    });

    const res = makeRes();
    await (stripeWebhook as any)(makeReq(), res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("never names a secret, a mode, or a variable in the rejection body", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_live_fake";
    constructEventBySecret({ whsec_fake: testModeEvent({ livemode: false }) });

    const res = makeRes();
    await (stripeWebhook as any)(makeReq(), res);

    const body = String((res.send as jest.Mock).mock.calls[0][0]);
    expect(body).not.toContain("STRIPE_");
    expect(body).not.toContain("whsec");
    expect(body).not.toContain("livemode");
  });
});

// ===========================================================================
// handleStripeConnectWebhook — the same rewrite landed here and had none of the
// coverage above. STRIPE_CONNECT_TEST_WEBHOOK_SECRET was not set by any handler
// test before this file's beforeEach was fixed.
// ===========================================================================

describe("handleStripeConnectWebhook — candidate loop and mode gate", () => {
  const connectEvent = (overrides: Record<string, unknown> = {}) => ({
    id: "evt_connect_mode",
    type: "some.unhandled.connect.event",
    account: "acct_1",
    livemode: false,
    data: { object: {} },
    ...overrides,
  });

  it("tries every configured Connect secret rather than stopping at the first", async () => {
    constructEventBySecret({
      whsec_connect_test_fake: new Error(
        "Timestamp outside the tolerance zone",
      ),
      whsec_connect_fake: connectEvent({ livemode: true }),
    });

    await (handleStripeConnectWebhook as any)(makeReq(), makeRes());

    expect(secretsTried()).toEqual([
      "whsec_connect_test_fake",
      "whsec_connect_fake",
    ]);
  });

  it("rejects with 400 when no Connect candidate verifies", async () => {
    constructEventBySecret({});

    const res = makeRes();
    await (handleStripeConnectWebhook as any)(makeReq(), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockRunTransaction).not.toHaveBeenCalled();
  });

  it("rejects a verified TEST-mode Connect event on a LIVE deployment", async () => {
    // account.application.deauthorized is reachable this way, which would
    // disconnect a real house's Stripe account from a test-mode event.
    process.env.STRIPE_SECRET_KEY = "sk_live_fake";
    constructEventBySecret({
      whsec_connect_fake: connectEvent({
        type: "account.application.deauthorized",
        livemode: false,
      }),
    });

    const res = makeRes();
    await (handleStripeConnectWebhook as any)(makeReq(), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockConstructEvent).toHaveBeenCalled();
    expect(mockRunTransaction).not.toHaveBeenCalled();
    expect(mockDocUpdate).not.toHaveBeenCalled();
  });

  it("rejects a Connect event claiming livemode:true signed with the TEST secret", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_live_fake";
    constructEventBySecret({
      whsec_connect_test_fake: connectEvent({ livemode: true }),
    });

    const res = makeRes();
    await (handleStripeConnectWebhook as any)(makeReq(), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockRunTransaction).not.toHaveBeenCalled();
  });

  it("accepts a LIVE Connect event on a LIVE deployment", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_live_fake";
    constructEventBySecret({
      whsec_connect_fake: connectEvent({ livemode: true }),
    });

    const res = makeRes();
    await (handleStripeConnectWebhook as any)(makeReq(), res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("returns 500 when neither Connect secret is configured", async () => {
    delete process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
    delete process.env.STRIPE_CONNECT_TEST_WEBHOOK_SECRET;

    const res = makeRes();
    await (handleStripeConnectWebhook as any)(makeReq(), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(mockConstructEvent).not.toHaveBeenCalled();
    expect(res.send).toHaveBeenCalledWith(
      expect.not.stringContaining("STRIPE_"),
    );
  });

  it("binds both Connect signing secrets", () => {
    const connectOpts = recordedOnRequestOptions().find((o) =>
      (o.secrets ?? []).includes("STRIPE_CONNECT_WEBHOOK_SECRET"),
    );
    expect(connectOpts).toBeDefined();
    expect(connectOpts!.secrets).toEqual(
      expect.arrayContaining([
        "STRIPE_SECRET_KEY",
        "STRIPE_CONNECT_WEBHOOK_SECRET",
        "STRIPE_CONNECT_TEST_WEBHOOK_SECRET",
      ]),
    );
  });
});
