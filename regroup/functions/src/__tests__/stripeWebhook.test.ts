/**
 * Comprehensive unit tests for the Stripe webhook handler.
 *
 * Mock strategy:
 *  - stripe: mocked at module level via jest.mock('stripe')
 *  - firebase-admin: mocked at module level
 *  - firebase-functions: mocked to expose config() and logger
 *
 * Each test group stands alone — mocks are reset between tests.
 */

// ---------------------------------------------------------------------------
// Jest module mocks — must be hoisted before imports
// ---------------------------------------------------------------------------

// Firestore mock infrastructure
const mockSet = jest.fn();
const mockUpdate = jest.fn();
const mockCollection = jest.fn();
const mockRunTransaction = jest.fn();

// FCM mock
const mockMessagingSend = jest.fn();

// Stripe mock
const mockConstructEvent = jest.fn();
const mockChargesRetrieve = jest.fn();

// ---------------------------------------------------------------------------
// firebase-admin mock
// ---------------------------------------------------------------------------
jest.mock("firebase-admin", () => {
  const firestoreMock = {
    collection: mockCollection,
    runTransaction: mockRunTransaction,
  };
  return {
    initializeApp: jest.fn(),
    app: jest.fn(() => ({})),
    firestore: jest.fn(() => firestoreMock),
    messaging: jest.fn(() => ({ send: mockMessagingSend })),
  };
});

// ---------------------------------------------------------------------------
// firebase-functions mock
// ---------------------------------------------------------------------------
jest.mock("firebase-functions", () => ({
  config: jest.fn(() => ({
    stripe: {
      secret_key: "sk_test_fake",
      webhook_secret: "whsec_fake",
    },
  })),
  https: {
    onRequest: jest.fn((handler) => handler), // return handler directly for testing
    HttpsError: class HttpsError extends Error {
      constructor(public code: string, message: string) {
        super(message);
      }
    },
  },
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// ---------------------------------------------------------------------------
// stripe mock
// ---------------------------------------------------------------------------
jest.mock("stripe", () => {
  return jest.fn().mockImplementation(() => ({
    webhooks: {
      constructEvent: mockConstructEvent,
    },
    charges: {
      retrieve: mockChargesRetrieve,
    },
  }));
});

// ---------------------------------------------------------------------------
// Import after mocks are established
// ---------------------------------------------------------------------------
import * as functions from "firebase-functions";
import { stripeWebhook } from "../webhooks/stripeWebhook";
import Stripe from "stripe";

// ---------------------------------------------------------------------------
// Local type alias mirroring the webhook's internal HouseDoc status union
// ---------------------------------------------------------------------------
type HouseStatus =
  | "active"
  | "pending"
  | "restricted"
  | "disconnected"
  | "not_connected";

// ---------------------------------------------------------------------------
// Request / Response helpers
// ---------------------------------------------------------------------------

function makeRequest(
  overrides: Partial<{
    method: string;
    headers: Record<string, string>;
    rawBody: Buffer | string;
    body: unknown;
  }>
): Record<string, unknown> {
  return {
    method: "POST",
    headers: { "stripe-signature": "valid-sig" },
    rawBody: Buffer.from("{}"),
    body: {},
    ...overrides,
  };
}

function makeResponse(): {
  status: jest.Mock;
  send: jest.Mock;
  statusCode: number;
  body: unknown;
} {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  };
  res.status.mockImplementation((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.send.mockImplementation((body: unknown) => {
    res.body = body;
    return res;
  });
  return res;
}

// ---------------------------------------------------------------------------
// Firestore mock helpers
// ---------------------------------------------------------------------------

/** Build a Firestore query snap (simulates .where().limit().get()) */
function buildQuerySnap(
  docs: Array<{
    id: string;
    data: () => Record<string, unknown>;
    ref?: { update: jest.Mock; set: jest.Mock };
  }>
): FirebaseFirestore.QuerySnapshot {
  const builtDocs = docs.map((d) => ({
    id: d.id,
    exists: true,
    data: d.data,
    ref: d.ref ?? {
      update: mockUpdate.mockResolvedValue(undefined),
      set: mockSet.mockResolvedValue(undefined),
    },
  }));
  return {
    empty: builtDocs.length === 0,
    docs: builtDocs,
  } as unknown as FirebaseFirestore.QuerySnapshot;
}

// ---------------------------------------------------------------------------
// sendFcmToHouseAdmins mock helpers
//
// The production `sendFcmToHouseAdmins` (in util/notifications.ts) issues:
//   1. db.collection("houses").doc(houseId).get()
//      → expects a doc with `adminIds: string[]` (and/or adminId/ownerId/etc)
//   2. For each admin uid: db.collection("users").doc(uid).get()
//      → expects a doc with `messagingToken: string[]`
//   3. admin.messaging().send({ token, notification, android })
//
// These helpers let each test scenario wire the house→admin→token lookup
// alongside the scenario's own collection mocks.
// ---------------------------------------------------------------------------

interface HouseAdminMock {
  /** House document with adminIds for sendFcmToHouseAdmins lookup. */
  houseDocGet: jest.Mock;
  /**
   * Builds the appropriate user doc for `users.doc(uid).get()`:
   *  - If `uid` matches an admin in `adminIds`, returns a user doc with
   *    `messagingToken: [token]` so sendFcmToHouseAdmins emits FCM.
   *  - Otherwise returns the supplied default (e.g. the guest user doc).
   */
  buildUserDocGet: (
    defaultUserGet: jest.Mock
  ) => (uid: string) => { get: jest.Mock };
}

function buildHouseAdminMock(
  adminUid: string,
  token: string,
  houseId: string = "house_1"
): HouseAdminMock {
  const houseDocGet = jest.fn().mockResolvedValue({
    exists: true,
    data: () => ({ adminIds: [adminUid] }),
  });

  const adminUserDoc = {
    exists: true,
    data: () => ({ messagingToken: [token] }),
  };

  const buildUserDocGet = (defaultUserGet: jest.Mock) => (uid: string) => {
    if (uid === adminUid) {
      return { get: jest.fn().mockResolvedValue(adminUserDoc) };
    }
    return { get: defaultUserGet };
  };

  // Note: houseId is captured for clarity but not currently differentiated —
  // every test scenario uses a single house, so the mock returns the same
  // adminIds regardless of the houseId passed to doc().
  void houseId;

  return { houseDocGet, buildUserDocGet };
}

// ---------------------------------------------------------------------------
// Stripe event factory helpers
// ---------------------------------------------------------------------------

function makeStripeEvent(
  type: string,
  object: unknown,
  overrides: Partial<Stripe.Event> = {}
): Stripe.Event {
  const event = {
    id: `evt_test_${Math.random().toString(36).slice(2)}`,
    object: "event",
    api_version: "2026-01-28.clover",
    created: Math.floor(Date.now() / 1000),
    data: { object },
    livemode: false,
    pending_webhooks: 0,
    request: null,
    type,
    account: undefined,
    ...overrides,
  };
  return event as unknown as Stripe.Event;
}

function makePaymentIntent(
  overrides: Partial<Stripe.PaymentIntent> = {}
): Stripe.PaymentIntent {
  return {
    id: "pi_test_123",
    object: "payment_intent",
    amount: 100000, // $1000.00
    currency: "usd",
    status: "succeeded",
    metadata: { guestId: "guest_1", houseId: "house_1" },
    last_payment_error: null,
    ...overrides,
  } as unknown as Stripe.PaymentIntent;
}

/**
 * Build an Invoice shape matching the 2026-01-28.clover API:
 * subscription ID lives at invoice.parent.subscription_details.subscription
 */
function makeInvoice(
  overrides: Partial<Record<string, unknown>> = {}
): Stripe.Invoice {
  return {
    id: "in_test_123",
    object: "invoice",
    parent: {
      type: "subscription_details",
      subscription_details: {
        subscription: "sub_test_123",
        metadata: null,
      },
      quote_details: null,
    },
    attempt_count: 1,
    next_payment_attempt: null,
    lines: {
      data: [{ period: { end: Math.floor(Date.now() / 1000) + 2592000 } }],
    },
    ...overrides,
  } as unknown as Stripe.Invoice;
}

/**
 * Build a Subscription shape matching the 2026-01-28.clover API:
 * current_period_end was removed; billing_cycle_anchor is used instead.
 */
function makeSubscription(
  overrides: Partial<Stripe.Subscription> = {}
): Stripe.Subscription {
  return {
    id: "sub_test_123",
    object: "subscription",
    status: "active",
    billing_cycle_anchor: Math.floor(Date.now() / 1000) + 2592000,
    canceled_at: null,
    items: { data: [{ price: { id: "price_starter" } }] },
    metadata: { guestCount: "5" },
    ...overrides,
  } as unknown as Stripe.Subscription;
}

function makeDispute(overrides: Partial<Stripe.Dispute> = {}): Stripe.Dispute {
  return {
    id: "dp_test_123",
    object: "dispute",
    amount: 50000,
    charge: "ch_test_123",
    ...overrides,
  } as unknown as Stripe.Dispute;
}

function makeAccount(overrides: Partial<Stripe.Account> = {}): Stripe.Account {
  return {
    id: "acct_test_123",
    object: "account",
    charges_enabled: true,
    payouts_enabled: true,
    requirements: {
      currently_due: [],
      eventually_due: [],
      disabled_reason: null,
      alternatives: null,
      current_deadline: null,
      errors: [],
      past_due: [],
      pending_verification: [],
    } as unknown as Stripe.Account["requirements"],
    ...overrides,
  } as unknown as Stripe.Account;
}

function makePayout(overrides: Partial<Stripe.Payout> = {}): Stripe.Payout {
  return {
    id: "po_test_123",
    object: "payout",
    amount: 250000,
    failure_code: "account_closed",
    failure_message: "The bank account has been closed",
    destination: "ba_test_123",
    ...overrides,
  } as unknown as Stripe.Payout;
}

// ---------------------------------------------------------------------------
// Idempotency transaction mock helper
// ---------------------------------------------------------------------------

function setupIdempotencyTransaction(alreadyExists: boolean): void {
  mockRunTransaction.mockImplementation(
    async (fn: (txn: unknown) => Promise<unknown>) => {
      const txn = {
        get: jest.fn().mockResolvedValue({ exists: alreadyExists }),
        set: jest.fn(),
      };
      return fn(txn);
    }
  );
}

// ---------------------------------------------------------------------------
// beforeEach — reset all mocks
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();

  // Default: successful FCM send
  mockMessagingSend.mockResolvedValue("message-id");

  // Default: stripe charges retrieve returns a charge with metadata
  mockChargesRetrieve.mockResolvedValue({
    id: "ch_test_123",
    payment_intent: "pi_test_123",
    metadata: { houseId: "house_1", guestId: "guest_1" },
  });

  // Default idempotency: event not yet processed
  setupIdempotencyTransaction(false);
});

// ===========================================================================
// SECTION 1: Signature Verification
// ===========================================================================

describe("Signature Verification", () => {
  test("valid signature processes the event and returns 200", async () => {
    const event = makeStripeEvent(
      "payment_intent.succeeded",
      makePaymentIntent()
    );
    mockConstructEvent.mockReturnValue(event);

    // Setup Firestore for payment and guest lookup
    mockCollection.mockImplementation((name: string) => {
      if (name === "webhookEvents") {
        return { doc: () => ({ get: jest.fn(), set: jest.fn() }) };
      }
      if (name === "payments") {
        return { doc: () => ({ set: mockSet.mockResolvedValue(undefined) }) };
      }
      if (name === "guests") {
        return {
          doc: () => ({
            get: jest.fn().mockResolvedValue({ exists: false }),
            update: mockUpdate,
          }),
        };
      }
      if (name === "users") {
        return {
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(buildQuerySnap([])),
        };
      }
      return {
        doc: () => ({ get: jest.fn().mockResolvedValue({ exists: false }) }),
      };
    });

    const req = makeRequest({});
    const res = makeResponse();

    await stripeWebhook(req as never, res as never);

    expect(mockConstructEvent).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test("invalid signature returns 400 and does NOT process any event", async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error(
        "No signatures found matching the expected signature for payload"
      );
    });

    const req = makeRequest({});
    const res = makeResponse();

    await stripeWebhook(req as never, res as never);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith(
      expect.stringContaining("Webhook Error:")
    );
    // Ensure no Firestore writes happened
    expect(mockRunTransaction).not.toHaveBeenCalled();
  });

  test("missing stripe-signature header returns 400", async () => {
    const req = makeRequest({ headers: {} });
    const res = makeResponse();

    await stripeWebhook(req as never, res as never);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith(
      expect.stringContaining("Missing stripe-signature")
    );
    expect(mockConstructEvent).not.toHaveBeenCalled();
  });

  test("expired timestamp (replay attack) returns 400", async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error("Timestamp outside the tolerance zone");
    });

    const req = makeRequest({});
    const res = makeResponse();

    await stripeWebhook(req as never, res as never);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith(
      expect.stringContaining("Timestamp outside")
    );
  });

  test("non-POST method returns 405", async () => {
    const req = makeRequest({ method: "GET" });
    const res = makeResponse();

    await stripeWebhook(req as never, res as never);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(mockConstructEvent).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// SECTION 2: Idempotency
// ===========================================================================

describe("Idempotency", () => {
  test("duplicate event returns 200 without re-writing to Firestore", async () => {
    const event = makeStripeEvent(
      "payment_intent.succeeded",
      makePaymentIntent()
    );
    mockConstructEvent.mockReturnValue(event);

    // Idempotency: already processed
    setupIdempotencyTransaction(true);

    const req = makeRequest({});
    const res = makeResponse();

    await stripeWebhook(req as never, res as never);

    expect(res.status).toHaveBeenCalledWith(200);
    // body indicates duplicate
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({ duplicate: true })
    );
    // No payment writes should have occurred
    expect(mockSet).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test("first occurrence of event is processed normally", async () => {
    const event = makeStripeEvent(
      "customer.subscription.deleted",
      makeSubscription()
    );
    mockConstructEvent.mockReturnValue(event);
    setupIdempotencyTransaction(false);

    // Setup sub lookup
    const subRef = {
      update: mockUpdate.mockResolvedValue(undefined),
      set: mockSet.mockResolvedValue(undefined),
    };
    const subSnap = buildQuerySnap([
      {
        id: "sub_doc_1",
        data: () => ({
          houseId: "house_1",
          stripeSubscriptionId: "sub_test_123",
        }),
        ref: subRef,
      },
    ]);

    mockCollection.mockImplementation((name: string) => {
      if (name === "subscriptions") {
        return {
          where: jest.fn().mockReturnThis(),
          limit: jest
            .fn()
            .mockReturnValue({ get: jest.fn().mockResolvedValue(subSnap) }),
        };
      }
      if (name === "users") {
        return {
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(buildQuerySnap([])),
        };
      }
      return {
        doc: () => ({
          set: jest.fn(),
          get: jest.fn().mockResolvedValue({ exists: false }),
        }),
      };
    });

    const req = makeRequest({});
    const res = makeResponse();

    await stripeWebhook(req as never, res as never);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: "canceled" })
    );
  });

  test("concurrent duplicate events: transaction ensures only one write", async () => {
    const event = makeStripeEvent("invoice.payment_succeeded", makeInvoice());
    mockConstructEvent.mockReturnValue(event);

    // First call: event not yet in Firestore → writes idempotency record
    // Second call: event now exists → skips
    let transactionCallCount = 0;
    mockRunTransaction.mockImplementation(
      async (fn: (txn: unknown) => Promise<unknown>) => {
        transactionCallCount++;
        const alreadyExists = transactionCallCount > 1;
        const txn = {
          get: jest.fn().mockResolvedValue({ exists: alreadyExists }),
          set: jest.fn(),
        };
        return fn(txn);
      }
    );

    mockCollection.mockImplementation(() => ({
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue(buildQuerySnap([])),
      }),
      doc: () => ({ set: jest.fn(), get: jest.fn() }),
    }));

    const req = makeRequest({});
    const res1 = makeResponse();
    const res2 = makeResponse();

    await stripeWebhook(req as never, res1 as never);
    await stripeWebhook(req as never, res2 as never);

    // First call: processed (no duplicate flag)
    expect(res1.send).toHaveBeenCalledWith(
      expect.objectContaining({ received: true })
    );
    expect(res1.send).not.toHaveBeenCalledWith(
      expect.objectContaining({ duplicate: true })
    );

    // Second call: duplicate
    expect(res2.send).toHaveBeenCalledWith(
      expect.objectContaining({ duplicate: true })
    );
  });
});

// ===========================================================================
// SECTION 3: payment_intent.succeeded
// ===========================================================================

describe("payment_intent.succeeded", () => {
  function setupForPaymentSucceeded({
    guestExists = true,
    guestData = {},
    adminDocs = [] as Array<{
      id: string;
      data: () => Record<string, unknown>;
    }>,
    fcmTokens = ["token_guest_1"],
  } = {}): void {
    const guestDoc = {
      exists: guestExists,
      data: () => ({
        userId: "user_1",
        firstName: "John",
        lastName: "Doe",
        balance: 1000,
        houseId: "house_1",
        ...guestData,
      }),
    };

    const userDoc = {
      exists: true,
      data: () => ({ fcmTokens }),
    };

    const adminSnap = buildQuerySnap(
      adminDocs.length > 0
        ? adminDocs
        : [
            {
              id: "admin_user_1",
              data: () => ({ fcmTokens: ["token_admin_1"] }),
            },
          ]
    );

    // sendFcmToHouseAdmins reads houses/{id} → adminIds, then users/{uid} → messagingToken.
    const houseAdmin = buildHouseAdminMock("admin_user_1", "token_admin_1");
    const defaultUserGet = jest.fn().mockResolvedValue(userDoc);
    const userDocFactory = houseAdmin.buildUserDocGet(defaultUserGet);

    mockCollection.mockImplementation((name: string) => {
      if (name === "payments") {
        return { doc: () => ({ set: mockSet.mockResolvedValue(undefined) }) };
      }
      if (name === "guests") {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue(guestDoc),
            update: mockUpdate.mockResolvedValue(undefined),
          }),
        };
      }
      if (name === "houses") {
        return {
          doc: jest.fn().mockReturnValue({ get: houseAdmin.houseDocGet }),
        };
      }
      if (name === "users") {
        return {
          doc: jest.fn((uid: string) => userDocFactory(uid)),
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(adminSnap),
        };
      }
      return {
        doc: () => ({
          set: jest.fn(),
          get: jest.fn().mockResolvedValue({ exists: false }),
        }),
      };
    });
  }

  test("happy path: payment doc created, balance updated, FCM sent", async () => {
    const pi = makePaymentIntent({
      metadata: { guestId: "guest_1", houseId: "house_1" },
      amount: 50000, // $500
    });
    const event = makeStripeEvent("payment_intent.succeeded", pi);
    mockConstructEvent.mockReturnValue(event);
    setupForPaymentSucceeded();

    await stripeWebhook(makeRequest({}) as never, makeResponse() as never);

    // Payment doc written
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        stripePaymentIntentId: "pi_test_123",
        houseId: "house_1",
        guestId: "guest_1",
        amount: 500,
        currency: "usd",
        status: "succeeded",
      }),
      expect.any(Object)
    );

    // Balance decremented: 1000 - 500 = 500
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ balance: 500 })
    );

    // FCM sent to guest and admin
    expect(mockMessagingSend).toHaveBeenCalledTimes(2); // guest + 1 admin
  });

  test("missing guestId in metadata: handles gracefully without throwing", async () => {
    const pi = makePaymentIntent({
      metadata: { houseId: "house_1" } as Stripe.Metadata,
    });
    const event = makeStripeEvent("payment_intent.succeeded", pi);
    mockConstructEvent.mockReturnValue(event);

    mockCollection.mockImplementation((name: string) => {
      if (name === "payments")
        return { doc: () => ({ set: mockSet.mockResolvedValue(undefined) }) };
      return {
        doc: () => ({
          set: jest.fn(),
          get: jest.fn().mockResolvedValue({ exists: false }),
        }),
      };
    });

    const res = makeResponse();
    await stripeWebhook(makeRequest({}) as never, res as never);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(functions.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("missing metadata"),
      expect.any(Object)
    );
  });

  test("guest not found in Firestore: handles gracefully", async () => {
    const pi = makePaymentIntent({
      metadata: { guestId: "ghost_guest", houseId: "house_1" },
    });
    const event = makeStripeEvent("payment_intent.succeeded", pi);
    mockConstructEvent.mockReturnValue(event);

    setupForPaymentSucceeded({ guestExists: false });

    const res = makeResponse();
    await stripeWebhook(makeRequest({}) as never, res as never);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(functions.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("guest not found"),
      expect.any(Object)
    );
    // No balance update attempted
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test("FCM send fails: event still processes successfully", async () => {
    const pi = makePaymentIntent({ amount: 20000 }); // $200
    const event = makeStripeEvent("payment_intent.succeeded", pi);
    mockConstructEvent.mockReturnValue(event);
    setupForPaymentSucceeded();

    // FCM throws
    mockMessagingSend.mockRejectedValue(new Error("FCM unavailable"));

    const res = makeResponse();
    await stripeWebhook(makeRequest({}) as never, res as never);

    // Should still return 200
    expect(res.status).toHaveBeenCalledWith(200);
    // Balance was still updated before the notification attempted
    expect(mockUpdate).toHaveBeenCalled();
  });

  test("guest has no FCM tokens: no error thrown, admin still notified", async () => {
    const pi = makePaymentIntent({ amount: 10000 }); // $100
    const event = makeStripeEvent("payment_intent.succeeded", pi);
    mockConstructEvent.mockReturnValue(event);
    // Empty guest tokens — admin tokens still present via setupForPaymentSucceeded defaults
    setupForPaymentSucceeded({ fcmTokens: [] });

    const res = makeResponse();
    await stripeWebhook(makeRequest({}) as never, res as never);

    expect(res.status).toHaveBeenCalledWith(200);
    // Guest FCM skipped (no tokens) — no call with guest userId context
    // Admin notification should still be sent
    expect(mockMessagingSend).toHaveBeenCalledWith(
      expect.objectContaining({
        token: "token_admin_1",
        notification: expect.objectContaining({
          title: "Rent Payment Received",
        }),
      })
    );
    // Confirm no crash occurred (logger.error not called with FCM context)
    const errorCalls = (functions.logger.error as jest.Mock).mock.calls;
    const fcmErrors = errorCalls.filter((args: unknown[]) =>
      String(args[0]).toLowerCase().includes("fcm")
    );
    expect(fcmErrors).toHaveLength(0);
  });

  test("balance never goes below zero", async () => {
    const pi = makePaymentIntent({ amount: 200000 }); // $2000 — more than balance of $1000
    const event = makeStripeEvent("payment_intent.succeeded", pi);
    mockConstructEvent.mockReturnValue(event);
    setupForPaymentSucceeded({ guestData: { balance: 500 } }); // only $500 balance

    await stripeWebhook(makeRequest({}) as never, makeResponse() as never);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ balance: 0 })
    );
  });
});

// ===========================================================================
// SECTION 4: payment_intent.payment_failed
// ===========================================================================

describe("payment_intent.payment_failed", () => {
  function setupForPaymentFailed(): void {
    const guestDoc = {
      exists: true,
      data: () => ({
        userId: "user_1",
        firstName: "Jane",
        lastName: "Smith",
        balance: 500,
        houseId: "house_1",
      }),
    };

    const userDoc = {
      exists: true,
      data: () => ({ fcmTokens: ["token_guest_1"] }),
    };

    const adminSnap = buildQuerySnap([
      { id: "admin_1", data: () => ({ fcmTokens: ["token_admin_1"] }) },
    ]);

    mockCollection.mockImplementation((name: string) => {
      if (name === "payments")
        return { doc: () => ({ set: mockSet.mockResolvedValue(undefined) }) };
      if (name === "guests") {
        return {
          doc: jest
            .fn()
            .mockReturnValue({ get: jest.fn().mockResolvedValue(guestDoc) }),
        };
      }
      if (name === "users") {
        return {
          doc: jest
            .fn()
            .mockReturnValue({ get: jest.fn().mockResolvedValue(userDoc) }),
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(adminSnap),
        };
      }
      return {
        doc: () => ({
          set: jest.fn(),
          get: jest.fn().mockResolvedValue({ exists: false }),
        }),
      };
    });
  }

  function makeFailedPaymentIntent(
    code: string,
    extraProps: Partial<Stripe.PaymentIntent> = {}
  ): Stripe.PaymentIntent {
    return makePaymentIntent({
      status: "requires_payment_method",
      last_payment_error: {
        code,
        message: `Error: ${code}`,
        decline_code:
          code === "card_declined" ? "insufficient_funds" : undefined,
        type: "card_error",
      } as Stripe.PaymentIntent["last_payment_error"],
      ...extraProps,
    });
  }

  test("card_declined: failure message includes decline reason", async () => {
    const pi = makeFailedPaymentIntent("card_declined");
    const event = makeStripeEvent("payment_intent.payment_failed", pi);
    mockConstructEvent.mockReturnValue(event);
    setupForPaymentFailed();

    await stripeWebhook(makeRequest({}) as never, makeResponse() as never);

    expect(mockMessagingSend).toHaveBeenCalledWith(
      expect.objectContaining({
        notification: expect.objectContaining({
          body: expect.stringContaining("insufficient_funds"),
        }),
      })
    );
  });

  test("insufficient_funds: message suggests ACH", async () => {
    const pi = makeFailedPaymentIntent("insufficient_funds");
    const event = makeStripeEvent("payment_intent.payment_failed", pi);
    mockConstructEvent.mockReturnValue(event);
    setupForPaymentFailed();

    await stripeWebhook(makeRequest({}) as never, makeResponse() as never);

    expect(mockMessagingSend).toHaveBeenCalledWith(
      expect.objectContaining({
        notification: expect.objectContaining({
          body: expect.stringContaining("ACH"),
        }),
      })
    );
  });

  test("authentication_required: correct re-authenticate message", async () => {
    const pi = makeFailedPaymentIntent("authentication_required");
    const event = makeStripeEvent("payment_intent.payment_failed", pi);
    mockConstructEvent.mockReturnValue(event);
    setupForPaymentFailed();

    await stripeWebhook(makeRequest({}) as never, makeResponse() as never);

    expect(mockMessagingSend).toHaveBeenCalledWith(
      expect.objectContaining({
        notification: expect.objectContaining({
          body: expect.stringContaining("re-authenticate"),
        }),
      })
    );
  });

  test("unknown failure code: handled gracefully with generic message", async () => {
    const pi = makeFailedPaymentIntent("do_not_honor");
    const event = makeStripeEvent("payment_intent.payment_failed", pi);
    mockConstructEvent.mockReturnValue(event);
    setupForPaymentFailed();

    const res = makeResponse();
    await stripeWebhook(makeRequest({}) as never, res as never);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockMessagingSend).toHaveBeenCalled();
  });

  test("payment doc updated with failure details", async () => {
    const pi = makeFailedPaymentIntent("card_declined");
    const event = makeStripeEvent("payment_intent.payment_failed", pi);
    mockConstructEvent.mockReturnValue(event);
    setupForPaymentFailed();

    await stripeWebhook(makeRequest({}) as never, makeResponse() as never);

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        failureCode: "card_declined",
      }),
      expect.any(Object)
    );
  });

  test("failure logged for ops visibility", async () => {
    const pi = makeFailedPaymentIntent("card_declined");
    const event = makeStripeEvent("payment_intent.payment_failed", pi);
    mockConstructEvent.mockReturnValue(event);
    setupForPaymentFailed();

    await stripeWebhook(makeRequest({}) as never, makeResponse() as never);

    expect(functions.logger.error).toHaveBeenCalledWith(
      "payment_intent.payment_failed",
      expect.objectContaining({ failureCode: "card_declined" })
    );
  });
});

// ===========================================================================
// SECTION 5: charge.dispute.created
// ===========================================================================

describe("charge.dispute.created", () => {
  test("happy path: payment doc marked disputed, admin notified", async () => {
    const dispute = makeDispute();
    const event = makeStripeEvent("charge.dispute.created", dispute);
    mockConstructEvent.mockReturnValue(event);

    mockChargesRetrieve.mockResolvedValue({
      id: "ch_test_123",
      payment_intent: "pi_test_123",
      metadata: { houseId: "house_1" },
    });

    const adminSnap = buildQuerySnap([
      { id: "admin_1", data: () => ({ fcmTokens: ["token_admin_1"] }) },
    ]);

    // sendFcmToHouseAdmins reads houses/{id} → adminIds, then users/{uid} → messagingToken.
    const houseAdmin = buildHouseAdminMock("admin_1", "token_admin_1");
    const defaultUserGet = jest
      .fn()
      .mockResolvedValue({ exists: false, data: () => ({}) });
    const userDocFactory = houseAdmin.buildUserDocGet(defaultUserGet);

    mockCollection.mockImplementation((name: string) => {
      if (name === "payments") {
        return { doc: () => ({ set: mockSet.mockResolvedValue(undefined) }) };
      }
      if (name === "houses") {
        return {
          doc: jest.fn().mockReturnValue({ get: houseAdmin.houseDocGet }),
        };
      }
      if (name === "users") {
        return {
          doc: jest.fn((uid: string) => userDocFactory(uid)),
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(adminSnap),
        };
      }
      return {
        doc: () => ({
          set: jest.fn(),
          get: jest.fn().mockResolvedValue({ exists: false }),
        }),
      };
    });

    await stripeWebhook(makeRequest({}) as never, makeResponse() as never);

    // Payment marked as disputed
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ disputed: true }),
      expect.any(Object)
    );

    // Admin notified
    expect(mockMessagingSend).toHaveBeenCalledWith(
      expect.objectContaining({
        notification: expect.objectContaining({
          title: "Payment Dispute Filed",
        }),
      })
    );
  });

  test("charge retrieve fails: no crash, returns 200", async () => {
    const dispute = makeDispute();
    const event = makeStripeEvent("charge.dispute.created", dispute);
    mockConstructEvent.mockReturnValue(event);

    mockChargesRetrieve.mockRejectedValue(new Error("Stripe API error"));

    mockCollection.mockImplementation(() => ({
      doc: () => ({
        set: jest.fn(),
        get: jest.fn().mockResolvedValue({ exists: false }),
      }),
      where: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue(buildQuerySnap([])),
    }));

    const res = makeResponse();
    await stripeWebhook(makeRequest({}) as never, res as never);

    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ===========================================================================
// SECTION 6: invoice.payment_succeeded
// ===========================================================================

describe("invoice.payment_succeeded", () => {
  test("happy path: subscription status → active, currentPeriodEnd updated", async () => {
    const invoice = makeInvoice();
    const event = makeStripeEvent("invoice.payment_succeeded", invoice);
    mockConstructEvent.mockReturnValue(event);

    const subRef = {
      update: mockUpdate.mockResolvedValue(undefined),
      set: mockSet.mockResolvedValue(undefined),
    };
    const subSnap = buildQuerySnap([
      {
        id: "sub_doc_1",
        data: () => ({
          houseId: "house_1",
          stripeSubscriptionId: "sub_test_123",
          status: "past_due",
        }),
        ref: subRef,
      },
    ]);

    mockCollection.mockImplementation((name: string) => {
      if (name === "subscriptions") {
        return {
          where: jest.fn().mockReturnThis(),
          limit: jest
            .fn()
            .mockReturnValue({ get: jest.fn().mockResolvedValue(subSnap) }),
        };
      }
      return {
        doc: () => ({
          set: jest.fn(),
          get: jest.fn().mockResolvedValue({ exists: false }),
        }),
      };
    });

    await stripeWebhook(makeRequest({}) as never, makeResponse() as never);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: "active" })
    );
  });

  test("invoice with no subscription parent: logs warning, returns 200", async () => {
    const invoice = makeInvoice({ parent: null });
    const event = makeStripeEvent("invoice.payment_succeeded", invoice);
    mockConstructEvent.mockReturnValue(event);

    mockCollection.mockImplementation((name: string) => {
      if (name === "subscriptions") {
        return {
          where: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue(buildQuerySnap([])),
          }),
        };
      }
      return {
        doc: () => ({
          set: jest.fn(),
          get: jest.fn().mockResolvedValue({ exists: false }),
        }),
      };
    });

    const res = makeResponse();
    await stripeWebhook(makeRequest({}) as never, res as never);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(functions.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("no subscription on invoice"),
      expect.any(Object)
    );
  });

  test("subscription not found: logs warning, returns 200", async () => {
    const invoice = makeInvoice();
    const event = makeStripeEvent("invoice.payment_succeeded", invoice);
    mockConstructEvent.mockReturnValue(event);

    mockCollection.mockImplementation((name: string) => {
      if (name === "subscriptions") {
        return {
          where: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue(buildQuerySnap([])),
          }),
        };
      }
      return {
        doc: () => ({
          set: jest.fn(),
          get: jest.fn().mockResolvedValue({ exists: false }),
        }),
      };
    });

    const res = makeResponse();
    await stripeWebhook(makeRequest({}) as never, res as never);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(functions.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("subscription not found"),
      expect.any(Object)
    );
  });
});

// ===========================================================================
// SECTION 7: invoice.payment_failed
// ===========================================================================

describe("invoice.payment_failed", () => {
  function setupSubLookup(houseId = "house_1", status = "active"): void {
    const subRef = {
      update: mockUpdate.mockResolvedValue(undefined),
      set: mockSet.mockResolvedValue(undefined),
    };
    const subSnap = buildQuerySnap([
      {
        id: "sub_doc_1",
        data: () => ({ houseId, stripeSubscriptionId: "sub_test_123", status }),
        ref: subRef,
      },
    ]);

    const adminSnap = buildQuerySnap([
      { id: "admin_1", data: () => ({ fcmTokens: ["token_admin_1"] }) },
    ]);

    // sendFcmToHouseAdmins reads houses/{id} → adminIds, then users/{uid} → messagingToken.
    const houseAdmin = buildHouseAdminMock("admin_1", "token_admin_1");
    const defaultUserGet = jest
      .fn()
      .mockResolvedValue({ exists: false, data: () => ({}) });
    const userDocFactory = houseAdmin.buildUserDocGet(defaultUserGet);

    mockCollection.mockImplementation((name: string) => {
      if (name === "subscriptions") {
        return {
          where: jest.fn().mockReturnThis(),
          limit: jest
            .fn()
            .mockReturnValue({ get: jest.fn().mockResolvedValue(subSnap) }),
        };
      }
      if (name === "houses") {
        return {
          doc: jest.fn().mockReturnValue({ get: houseAdmin.houseDocGet }),
        };
      }
      if (name === "users") {
        return {
          doc: jest.fn((uid: string) => userDocFactory(uid)),
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(adminSnap),
        };
      }
      return {
        doc: () => ({
          set: jest.fn(),
          get: jest.fn().mockResolvedValue({ exists: false }),
        }),
      };
    });
  }

  test("first failure (attempt_count=1): status → past_due", async () => {
    const invoice = makeInvoice({ attempt_count: 1 });
    const event = makeStripeEvent("invoice.payment_failed", invoice);
    mockConstructEvent.mockReturnValue(event);
    setupSubLookup();

    await stripeWebhook(makeRequest({}) as never, makeResponse() as never);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: "past_due" })
    );
  });

  test("third+ failure (attempt_count >= 3): status → unpaid", async () => {
    const invoice = makeInvoice({ attempt_count: 3 });
    const event = makeStripeEvent("invoice.payment_failed", invoice);
    mockConstructEvent.mockReturnValue(event);
    setupSubLookup();

    await stripeWebhook(makeRequest({}) as never, makeResponse() as never);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: "unpaid" })
    );
  });

  test("missing next_payment_attempt: handled gracefully", async () => {
    const invoice = makeInvoice({
      attempt_count: 1,
      next_payment_attempt: null,
    });
    const event = makeStripeEvent("invoice.payment_failed", invoice);
    mockConstructEvent.mockReturnValue(event);
    setupSubLookup();

    const res = makeResponse();
    await stripeWebhook(makeRequest({}) as never, res as never);

    expect(res.status).toHaveBeenCalledWith(200);
    // Notification sent without retry date — body should not contain 'retry'
    const calls = mockMessagingSend.mock.calls;
    const bodyStrings = calls.map(
      (c: [{ notification: { body: string } }]) => c[0].notification.body
    );
    expect(bodyStrings.some((b: string) => b.includes("Next retry"))).toBe(
      false
    );
  });

  test("next_payment_attempt present: retry date included in notification", async () => {
    const futureTimestamp = Math.floor(Date.now() / 1000) + 86400; // 1 day from now
    const invoice = makeInvoice({
      attempt_count: 1,
      next_payment_attempt: futureTimestamp,
    });
    const event = makeStripeEvent("invoice.payment_failed", invoice);
    mockConstructEvent.mockReturnValue(event);
    setupSubLookup();

    await stripeWebhook(makeRequest({}) as never, makeResponse() as never);

    expect(mockMessagingSend).toHaveBeenCalledWith(
      expect.objectContaining({
        notification: expect.objectContaining({
          body: expect.stringContaining("Next retry"),
        }),
      })
    );
  });

  test("admin notification sent on payment failure", async () => {
    const invoice = makeInvoice({ attempt_count: 2 });
    const event = makeStripeEvent("invoice.payment_failed", invoice);
    mockConstructEvent.mockReturnValue(event);
    setupSubLookup();

    await stripeWebhook(makeRequest({}) as never, makeResponse() as never);

    expect(mockMessagingSend).toHaveBeenCalledWith(
      expect.objectContaining({
        notification: expect.objectContaining({
          title: "Subscription Payment Failed",
        }),
      })
    );
  });
});

// ===========================================================================
// SECTION 8: customer.subscription.deleted
// ===========================================================================

describe("customer.subscription.deleted", () => {
  test("status updated to canceled, admin notified", async () => {
    const sub = makeSubscription({
      status: "active",
      canceled_at: Math.floor(Date.now() / 1000),
    });
    const event = makeStripeEvent("customer.subscription.deleted", sub);
    mockConstructEvent.mockReturnValue(event);

    const subRef = {
      update: mockUpdate.mockResolvedValue(undefined),
      set: mockSet.mockResolvedValue(undefined),
    };
    const subSnap = buildQuerySnap([
      {
        id: "sub_doc_1",
        data: () => ({
          houseId: "house_1",
          stripeSubscriptionId: "sub_test_123",
        }),
        ref: subRef,
      },
    ]);
    const adminSnap = buildQuerySnap([
      { id: "admin_1", data: () => ({ fcmTokens: ["token_admin_1"] }) },
    ]);

    // sendFcmToHouseAdmins reads houses/{id} → adminIds, then users/{uid} → messagingToken.
    const houseAdmin = buildHouseAdminMock("admin_1", "token_admin_1");
    const defaultUserGet = jest
      .fn()
      .mockResolvedValue({ exists: false, data: () => ({}) });
    const userDocFactory = houseAdmin.buildUserDocGet(defaultUserGet);

    mockCollection.mockImplementation((name: string) => {
      if (name === "subscriptions") {
        return {
          where: jest.fn().mockReturnThis(),
          limit: jest
            .fn()
            .mockReturnValue({ get: jest.fn().mockResolvedValue(subSnap) }),
        };
      }
      if (name === "houses") {
        return {
          doc: jest.fn().mockReturnValue({ get: houseAdmin.houseDocGet }),
        };
      }
      if (name === "users") {
        return {
          doc: jest.fn((uid: string) => userDocFactory(uid)),
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(adminSnap),
        };
      }
      return {
        doc: () => ({
          set: jest.fn(),
          get: jest.fn().mockResolvedValue({ exists: false }),
        }),
      };
    });

    await stripeWebhook(makeRequest({}) as never, makeResponse() as never);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: "canceled" })
    );
    expect(mockMessagingSend).toHaveBeenCalledWith(
      expect.objectContaining({
        notification: expect.objectContaining({
          title: "Subscription Canceled",
        }),
      })
    );
  });

  test("subscription not found: logs warning, returns 200", async () => {
    const sub = makeSubscription();
    const event = makeStripeEvent("customer.subscription.deleted", sub);
    mockConstructEvent.mockReturnValue(event);

    mockCollection.mockImplementation((name: string) => {
      if (name === "subscriptions") {
        return {
          where: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue(buildQuerySnap([])),
          }),
        };
      }
      return {
        doc: () => ({
          set: jest.fn(),
          get: jest.fn().mockResolvedValue({ exists: false }),
        }),
      };
    });

    const res = makeResponse();
    await stripeWebhook(makeRequest({}) as never, res as never);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(functions.logger.warn).toHaveBeenCalled();
  });
});

// ===========================================================================
// SECTION 9: customer.subscription.updated
// ===========================================================================

describe("customer.subscription.updated", () => {
  function setupForSubUpdated(previousStatus: string): void {
    const subRef = {
      update: mockUpdate.mockResolvedValue(undefined),
      set: mockSet.mockResolvedValue(undefined),
    };
    const subSnap = buildQuerySnap([
      {
        id: "sub_doc_1",
        data: () => ({
          houseId: "house_1",
          stripeSubscriptionId: "sub_test_123",
          status: previousStatus,
          planId: "price_old",
          guestCount: 3,
        }),
        ref: subRef,
      },
    ]);
    const adminSnap = buildQuerySnap([
      { id: "admin_1", data: () => ({ fcmTokens: ["token_admin_1"] }) },
    ]);

    // sendFcmToHouseAdmins reads houses/{id} → adminIds, then users/{uid} → messagingToken.
    const houseAdmin = buildHouseAdminMock("admin_1", "token_admin_1");
    const defaultUserGet = jest
      .fn()
      .mockResolvedValue({ exists: false, data: () => ({}) });
    const userDocFactory = houseAdmin.buildUserDocGet(defaultUserGet);

    mockCollection.mockImplementation((name: string) => {
      if (name === "subscriptions") {
        return {
          where: jest.fn().mockReturnThis(),
          limit: jest
            .fn()
            .mockReturnValue({ get: jest.fn().mockResolvedValue(subSnap) }),
        };
      }
      if (name === "houses") {
        return {
          doc: jest.fn().mockReturnValue({ get: houseAdmin.houseDocGet }),
        };
      }
      if (name === "users") {
        return {
          doc: jest.fn((uid: string) => userDocFactory(uid)),
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(adminSnap),
        };
      }
      return {
        doc: () => ({
          set: jest.fn(),
          get: jest.fn().mockResolvedValue({ exists: false }),
        }),
      };
    });
  }

  test("updates plan info, guest count, and billing cycle", async () => {
    const sub = makeSubscription({
      status: "active",
      items: {
        data: [{ price: { id: "price_new" } }],
      } as Stripe.ApiList<Stripe.SubscriptionItem>,
      metadata: { guestCount: "10" },
    });
    const event = makeStripeEvent("customer.subscription.updated", sub);
    mockConstructEvent.mockReturnValue(event);
    setupForSubUpdated("active");

    await stripeWebhook(makeRequest({}) as never, makeResponse() as never);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        planId: "price_new",
        guestCount: 10,
        status: "active",
      })
    );
  });

  test("status changed to past_due: admin notified", async () => {
    const sub = makeSubscription({
      status: "past_due" as Stripe.Subscription["status"],
    });
    const event = makeStripeEvent("customer.subscription.updated", sub);
    mockConstructEvent.mockReturnValue(event);
    setupForSubUpdated("active"); // was active before

    await stripeWebhook(makeRequest({}) as never, makeResponse() as never);

    expect(mockMessagingSend).toHaveBeenCalledWith(
      expect.objectContaining({
        notification: expect.objectContaining({
          title: "Subscription Past Due",
        }),
      })
    );
  });

  test("status already past_due: admin NOT notified again", async () => {
    const sub = makeSubscription({
      status: "past_due" as Stripe.Subscription["status"],
    });
    const event = makeStripeEvent("customer.subscription.updated", sub);
    mockConstructEvent.mockReturnValue(event);
    setupForSubUpdated("past_due"); // was already past_due

    await stripeWebhook(makeRequest({}) as never, makeResponse() as never);

    expect(mockMessagingSend).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// SECTION 10: account.updated
// ===========================================================================

describe("account.updated", () => {
  function setupForAccountUpdated(
    houseExists: boolean,
    previousStatus: HouseStatus = "active"
  ): void {
    const adminSnap = buildQuerySnap([
      { id: "admin_1", data: () => ({ fcmTokens: ["token_admin_1"] }) },
    ]);

    const houseSnap = houseExists
      ? buildQuerySnap([
          {
            id: "house_1",
            data: () => ({
              stripeAccountId: "acct_test_123",
              stripeStatus: previousStatus,
              stripeChargesEnabled: true,
              stripePayoutsEnabled: true,
            }),
          },
        ])
      : buildQuerySnap([]);

    // sendFcmToHouseAdmins reads houses/{id} → adminIds, then users/{uid} → messagingToken.
    const houseAdmin = buildHouseAdminMock("admin_1", "token_admin_1");
    const defaultUserGet = jest
      .fn()
      .mockResolvedValue({ exists: false, data: () => ({}) });
    const userDocFactory = houseAdmin.buildUserDocGet(defaultUserGet);

    mockCollection.mockImplementation((name: string) => {
      if (name === "houses") {
        // doc(houseId) is used by both the existing account.update flow (.update)
        // and the new sendFcmToHouseAdmins flow (.get returning adminIds).
        const houseDoc = {
          update: mockUpdate.mockResolvedValue(undefined),
          get: houseAdmin.houseDocGet,
        };
        return {
          where: jest.fn().mockReturnThis(),
          limit: jest
            .fn()
            .mockReturnValue({ get: jest.fn().mockResolvedValue(houseSnap) }),
          doc: jest.fn().mockReturnValue(houseDoc),
        };
      }
      if (name === "users") {
        return {
          doc: jest.fn((uid: string) => userDocFactory(uid)),
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(adminSnap),
        };
      }
      return {
        doc: () => ({
          set: jest.fn(),
          get: jest.fn().mockResolvedValue({ exists: false }),
        }),
      };
    });
  }

  test("charges_enabled + payouts_enabled → status active", async () => {
    const account = makeAccount({
      charges_enabled: true,
      payouts_enabled: true,
    });
    const event = makeStripeEvent("account.updated", account);
    mockConstructEvent.mockReturnValue(event);
    setupForAccountUpdated(true, "pending");

    await stripeWebhook(makeRequest({}) as never, makeResponse() as never);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeStatus: "active",
        stripeChargesEnabled: true,
        stripePayoutsEnabled: true,
      })
    );
  });

  test("requirements.currently_due present → status restricted", async () => {
    const account = makeAccount({
      charges_enabled: false,
      payouts_enabled: false,
      requirements: {
        currently_due: ["individual.verification.document"],
        eventually_due: [],
        disabled_reason: null,
        alternatives: null,
        current_deadline: null,
        errors: [],
        past_due: [],
        pending_verification: [],
      } as unknown as Stripe.Account["requirements"],
    });
    const event = makeStripeEvent("account.updated", account);
    mockConstructEvent.mockReturnValue(event);
    setupForAccountUpdated(true, "active");

    await stripeWebhook(makeRequest({}) as never, makeResponse() as never);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ stripeStatus: "restricted" })
    );
  });

  test("not ready but no requirements → status pending", async () => {
    const account = makeAccount({
      charges_enabled: false,
      payouts_enabled: false,
      requirements: {
        currently_due: [],
        eventually_due: [],
        disabled_reason: null,
        alternatives: null,
        current_deadline: null,
        errors: [],
        past_due: [],
        pending_verification: [],
      } as unknown as Stripe.Account["requirements"],
    });
    const event = makeStripeEvent("account.updated", account);
    mockConstructEvent.mockReturnValue(event);
    setupForAccountUpdated(true, "pending");

    await stripeWebhook(makeRequest({}) as never, makeResponse() as never);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ stripeStatus: "pending" })
    );
  });

  test("account went active → restricted: admin notified", async () => {
    const account = makeAccount({
      charges_enabled: false,
      requirements: {
        currently_due: ["individual.verification.document"],
        eventually_due: [],
        disabled_reason: "requirements.past_due",
        alternatives: null,
        current_deadline: null,
        errors: [],
        past_due: [],
        pending_verification: [],
      } as unknown as Stripe.Account["requirements"],
    });
    const event = makeStripeEvent("account.updated", account);
    mockConstructEvent.mockReturnValue(event);
    setupForAccountUpdated(true, "active"); // previously active

    await stripeWebhook(makeRequest({}) as never, makeResponse() as never);

    expect(mockMessagingSend).toHaveBeenCalledWith(
      expect.objectContaining({
        notification: expect.objectContaining({
          title: "Stripe Account Restricted",
        }),
      })
    );
  });

  test("account stays restricted: no double notification on same state", async () => {
    const account = makeAccount({
      charges_enabled: false,
      requirements: {
        currently_due: ["some.field"],
        eventually_due: [],
        disabled_reason: null,
        alternatives: null,
        current_deadline: null,
        errors: [],
        past_due: [],
        pending_verification: [],
      } as unknown as Stripe.Account["requirements"],
    });
    const event = makeStripeEvent("account.updated", account);
    mockConstructEvent.mockReturnValue(event);
    setupForAccountUpdated(true, "restricted"); // was already restricted

    await stripeWebhook(makeRequest({}) as never, makeResponse() as never);

    // Should update Firestore but NOT send notification (not a transition)
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockMessagingSend).not.toHaveBeenCalled();
  });

  test("account ID not found in any house: no crash", async () => {
    const account = makeAccount({ id: "acct_unknown" });
    const event = makeStripeEvent("account.updated", account);
    mockConstructEvent.mockReturnValue(event);
    setupForAccountUpdated(false); // no house found

    const res = makeResponse();
    await stripeWebhook(makeRequest({}) as never, res as never);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// SECTION 11: payout.failed
// ===========================================================================

describe("payout.failed", () => {
  function setupForPayoutFailed(houseFound: boolean): void {
    const adminSnap = buildQuerySnap([
      { id: "admin_1", data: () => ({ fcmTokens: ["token_admin_1"] }) },
    ]);

    const houseSnap = houseFound
      ? buildQuerySnap([
          {
            id: "house_1",
            data: () => ({
              stripeAccountId: "acct_test_123",
              stripeStatus: "active",
            }),
          },
        ])
      : buildQuerySnap([]);

    // sendFcmToHouseAdmins reads houses/{id} → adminIds, then users/{uid} → messagingToken.
    const houseAdmin = buildHouseAdminMock("admin_1", "token_admin_1");
    const defaultUserGet = jest
      .fn()
      .mockResolvedValue({ exists: false, data: () => ({}) });
    const userDocFactory = houseAdmin.buildUserDocGet(defaultUserGet);

    mockCollection.mockImplementation((name: string) => {
      if (name === "houses") {
        return {
          where: jest.fn().mockReturnThis(),
          limit: jest
            .fn()
            .mockReturnValue({ get: jest.fn().mockResolvedValue(houseSnap) }),
          doc: jest.fn().mockReturnValue({ get: houseAdmin.houseDocGet }),
        };
      }
      if (name === "users") {
        return {
          doc: jest.fn((uid: string) => userDocFactory(uid)),
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(adminSnap),
        };
      }
      return {
        doc: () => ({
          set: jest.fn(),
          get: jest.fn().mockResolvedValue({ exists: false }),
        }),
      };
    });
  }

  test("house found by account ID: admin notified with payout details", async () => {
    const payout = makePayout({ amount: 150000 }); // $1500
    const event = makeStripeEvent("payout.failed", payout, {
      account: "acct_test_123",
    });
    mockConstructEvent.mockReturnValue(event);
    setupForPayoutFailed(true);

    await stripeWebhook(makeRequest({}) as never, makeResponse() as never);

    expect(mockMessagingSend).toHaveBeenCalledWith(
      expect.objectContaining({
        notification: expect.objectContaining({
          title: "Payout Failed",
          body: expect.stringContaining("$1500.00"),
        }),
      })
    );
  });

  test("no account on event: logs warning, returns 200", async () => {
    const payout = makePayout();
    const event = makeStripeEvent("payout.failed", payout); // no account field
    mockConstructEvent.mockReturnValue(event);
    setupForPayoutFailed(false);

    const res = makeResponse();
    await stripeWebhook(makeRequest({}) as never, res as never);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(functions.logger.warn).toHaveBeenCalled();
  });

  test("unknown destination (house not found): no crash", async () => {
    const payout = makePayout({ destination: "ba_unknown" });
    const event = makeStripeEvent("payout.failed", payout, {
      account: "acct_unknown",
    });
    mockConstructEvent.mockReturnValue(event);
    setupForPayoutFailed(false); // house not found

    const res = makeResponse();
    await stripeWebhook(makeRequest({}) as never, res as never);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockMessagingSend).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// SECTION 12: General error handling
// ===========================================================================

describe("General error handling", () => {
  test("Firestore write fails: returns 200 (prevents Stripe retry storms)", async () => {
    const pi = makePaymentIntent({
      metadata: { guestId: "guest_1", houseId: "house_1" },
    });
    const event = makeStripeEvent("payment_intent.succeeded", pi);
    mockConstructEvent.mockReturnValue(event);

    // Firestore throws for every operation
    mockCollection.mockImplementation(() => ({
      doc: () => ({
        set: jest.fn().mockRejectedValue(new Error("Firestore unavailable")),
        get: jest.fn().mockRejectedValue(new Error("Firestore unavailable")),
        update: jest.fn().mockRejectedValue(new Error("Firestore unavailable")),
      }),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnValue({
        get: jest.fn().mockRejectedValue(new Error("Firestore unavailable")),
      }),
    }));

    const res = makeResponse();
    await stripeWebhook(makeRequest({}) as never, res as never);

    // Must return 200 — Stripe should NOT retry
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test("unrecognized event type: ignored, returns 200", async () => {
    const event = makeStripeEvent("product.created", { id: "prod_123" });
    mockConstructEvent.mockReturnValue(event);

    mockCollection.mockImplementation(() => ({
      doc: () => ({
        set: jest.fn(),
        get: jest.fn().mockResolvedValue({ exists: false }),
      }),
    }));

    const res = makeResponse();
    await stripeWebhook(makeRequest({}) as never, res as never);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(functions.logger.info).toHaveBeenCalledWith(
      expect.stringContaining("unhandled event type"),
      expect.any(Object)
    );
  });

  test("event handler throws: error is logged and 200 is still returned", async () => {
    const pi = makePaymentIntent();
    const event = makeStripeEvent("payment_intent.succeeded", pi);
    mockConstructEvent.mockReturnValue(event);

    // Make idempotency pass, then throw in collection access
    let collectionCallCount = 0;
    mockCollection.mockImplementation(() => {
      collectionCallCount++;
      if (collectionCallCount > 1) {
        throw new Error("Simulated fatal handler error");
      }
      return {
        doc: () => ({
          set: jest.fn(),
          get: jest.fn().mockResolvedValue({ exists: false }),
        }),
      };
    });

    const res = makeResponse();
    await stripeWebhook(makeRequest({}) as never, res as never);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(functions.logger.error).toHaveBeenCalledWith(
      "stripeWebhook: event handler threw an error",
      expect.any(Object)
    );
  });

  test("idempotency check failure: processing continues (fail open)", async () => {
    const pi = makePaymentIntent({
      metadata: { guestId: "guest_1", houseId: "house_1" },
    });
    const event = makeStripeEvent("payment_intent.succeeded", pi);
    mockConstructEvent.mockReturnValue(event);

    // Transaction throws — idempotency check fails
    mockRunTransaction.mockRejectedValue(new Error("Transaction contention"));

    mockCollection.mockImplementation((name: string) => {
      if (name === "payments")
        return { doc: () => ({ set: mockSet.mockResolvedValue(undefined) }) };
      if (name === "guests") {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ exists: false }),
          }),
        };
      }
      return {
        doc: () => ({
          set: jest.fn(),
          get: jest.fn().mockResolvedValue({ exists: false }),
        }),
      };
    });

    const res = makeResponse();
    await stripeWebhook(makeRequest({}) as never, res as never);

    expect(res.status).toHaveBeenCalledWith(200);
    // Error logged
    expect(functions.logger.error).toHaveBeenCalledWith(
      "stripeWebhook: idempotency check failed",
      expect.any(Object)
    );
  });
});
