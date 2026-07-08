/**
 * Unit tests for stripeWebhook — verifying that intergroup subscription handlers
 * are called for the relevant Stripe webhook events.
 *
 * Fix C8: handleIntergroupSubscriptionUpdated and handleIntergroupSubscriptionDeleted
 * must be called alongside the group handlers in the customer.subscription.updated
 * and customer.subscription.deleted switch cases.
 *
 * Strategy: mock stripe.webhooks.constructEvent to return a controlled event,
 * mock all handlers in stripeUtils, then invoke processEvent by driving the
 * stripeWebhook HTTP handler through a fake req/res pair.
 */

// ============================================================
// Handler mocks — must be defined before any module imports
// ============================================================

const mockHandleCheckoutSessionCompleted = jest
  .fn()
  .mockResolvedValue(undefined);
const mockHandleInvoicePaymentSucceeded = jest
  .fn()
  .mockResolvedValue(undefined);
const mockHandleInvoicePaymentFailed = jest.fn().mockResolvedValue(undefined);
const mockHandleSubscriptionUpdated = jest.fn().mockResolvedValue(undefined);
const mockHandleSubscriptionDeleted = jest.fn().mockResolvedValue(undefined);
const mockHandleIntergroupSubscriptionUpdated = jest
  .fn()
  .mockResolvedValue(undefined);
const mockHandleIntergroupSubscriptionDeleted = jest
  .fn()
  .mockResolvedValue(undefined);
const mockHandleTrialWillEnd = jest.fn().mockResolvedValue(undefined);
const mockHandlePaymentIntentSucceeded = jest.fn().mockResolvedValue(undefined);
const mockHandlePaymentIntentFailed = jest.fn().mockResolvedValue(undefined);
const mockHandleDisputeCreated = jest.fn().mockResolvedValue(undefined);
const mockIsEventProcessed = jest.fn().mockResolvedValue(false);
const mockMarkEventProcessed = jest.fn().mockResolvedValue(undefined);

jest.mock("../utils/stripeUtils", () => ({
  handleCheckoutSessionCompleted: mockHandleCheckoutSessionCompleted,
  handleInvoicePaymentSucceeded: mockHandleInvoicePaymentSucceeded,
  handleInvoicePaymentFailed: mockHandleInvoicePaymentFailed,
  handleSubscriptionUpdated: mockHandleSubscriptionUpdated,
  handleSubscriptionDeleted: mockHandleSubscriptionDeleted,
  handleIntergroupSubscriptionUpdated: mockHandleIntergroupSubscriptionUpdated,
  handleIntergroupSubscriptionDeleted: mockHandleIntergroupSubscriptionDeleted,
  handleTrialWillEnd: mockHandleTrialWillEnd,
  handlePaymentIntentSucceeded: mockHandlePaymentIntentSucceeded,
  handlePaymentIntentFailed: mockHandlePaymentIntentFailed,
  handleDisputeCreated: mockHandleDisputeCreated,
  isEventProcessed: mockIsEventProcessed,
  markEventProcessed: mockMarkEventProcessed,
}));

const mockConstructEvent = jest.fn();

jest.mock("../utils/stripe", () => ({
  stripe: {
    webhooks: {
      constructEvent: mockConstructEvent,
    },
  },
  webhookSecret: "whsec_test",
  connectWebhookSecret: "whsec_connect_test",
  NonRetriableError: class NonRetriableError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "NonRetriableError";
    }
  },
}));

jest.mock("firebase-admin", () => ({
  firestore: {
    FieldValue: { serverTimestamp: () => "__SERVER_TIMESTAMP__" },
    Timestamp: { fromMillis: (ms: number) => ({ ms }) },
  },
  apps: ["mock-app"],
  initializeApp: jest.fn(),
}));

jest.mock("firebase-functions", () => ({
  https: {
    onRequest: (_opts: any, handler: Function) => handler,
  },
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockDocCreate = jest.fn().mockResolvedValue(undefined);
const mockDocUpdate = jest.fn().mockResolvedValue(undefined);
const mockDocDelete = jest.fn().mockResolvedValue(undefined);

jest.mock("../utils/firebase", () => ({
  db: {
    collection: jest.fn().mockReturnValue({
      doc: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue({ exists: false }),
        set: jest.fn().mockResolvedValue(undefined),
        create: mockDocCreate,
        update: mockDocUpdate,
        delete: mockDocDelete,
      }),
    }),
  },
  messaging: { sendEachForMulticast: jest.fn() },
}));

// ============================================================
// Helpers
// ============================================================

/**
 * Build a minimal fake Stripe subscription object suitable for use
 * as event.data.object in subscription.updated / subscription.deleted events.
 */
function makeSubscription(id = "sub_test_001"): any {
  return {
    id,
    status: "active",
    cancel_at_period_end: false,
    current_period_end: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
    items: {
      data: [
        {
          id: "si_test",
          price: { id: "price_test", product: "prod_test" },
        },
      ],
    },
  };
}

/**
 * Build a minimal Stripe event object.
 */
function makeEvent(
  type: string,
  dataObject: any,
  previousAttributes?: any,
): any {
  const event: any = {
    id: `evt_test_${type.replace(/\./g, "_")}`,
    type,
    data: { object: dataObject },
  };
  if (previousAttributes !== undefined) {
    event.data.previous_attributes = previousAttributes;
  }
  return event;
}

/**
 * Build a minimal fake HTTP request that stripeWebhook expects.
 */
function makeReq(event: any, connectedAccountId?: string): any {
  const headers: Record<string, string> = {
    "stripe-signature": "sig_test",
  };
  if (connectedAccountId) {
    headers["stripe-account"] = connectedAccountId;
  }
  return {
    rawBody: Buffer.from(JSON.stringify(event)),
    headers,
  };
}

/**
 * Build a minimal fake HTTP response that captures the status/send calls.
 */
function makeRes(): any {
  const res: any = {
    statusCode: 0,
    body: null,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    send(body: any) {
      res.body = body;
      return res;
    },
  };
  return res;
}

// ============================================================
// Tests
// ============================================================

describe("stripeWebhook — intergroup handler wiring (C8)", () => {
  let stripeWebhook: Function;

  beforeAll(async () => {
    // Import after all mocks are registered
    jest.resetModules();
    const mod = await import("../http/stripeWebhook");
    stripeWebhook = mod.stripeWebhook as unknown as Function;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // By default: create() succeeds (event not yet claimed), update/delete are no-ops
    mockDocCreate.mockResolvedValue(undefined);
    mockDocUpdate.mockResolvedValue(undefined);
    mockDocDelete.mockResolvedValue(undefined);
  });

  // ----------------------------------------------------------------
  // customer.subscription.updated
  // ----------------------------------------------------------------

  it("calls handleIntergroupSubscriptionUpdated when customer.subscription.updated fires", async () => {
    const subscription = makeSubscription("sub_intergroup_upd");
    const event = makeEvent("customer.subscription.updated", subscription, {
      status: "trialing",
    });
    mockConstructEvent.mockReturnValue(event);

    const req = makeReq(event);
    const res = makeRes();

    await stripeWebhook(req, res);

    expect(res.statusCode).toBe(200);
    expect(mockHandleIntergroupSubscriptionUpdated).toHaveBeenCalledTimes(1);
    expect(mockHandleIntergroupSubscriptionUpdated).toHaveBeenCalledWith(
      subscription,
    );
  });

  it("calls handleSubscriptionUpdated alongside handleIntergroupSubscriptionUpdated for customer.subscription.updated", async () => {
    const subscription = makeSubscription("sub_group_upd");
    const previousAttributes = { status: "trialing" };
    const event = makeEvent(
      "customer.subscription.updated",
      subscription,
      previousAttributes,
    );
    mockConstructEvent.mockReturnValue(event);

    const req = makeReq(event);
    const res = makeRes();

    await stripeWebhook(req, res);

    // Both handlers must be called
    expect(mockHandleSubscriptionUpdated).toHaveBeenCalledTimes(1);
    expect(mockHandleSubscriptionUpdated).toHaveBeenCalledWith(
      subscription,
      previousAttributes,
    );
    expect(mockHandleIntergroupSubscriptionUpdated).toHaveBeenCalledTimes(1);
    expect(mockHandleIntergroupSubscriptionUpdated).toHaveBeenCalledWith(
      subscription,
    );
  });

  // ----------------------------------------------------------------
  // customer.subscription.deleted
  // ----------------------------------------------------------------

  it("calls handleIntergroupSubscriptionDeleted when customer.subscription.deleted fires", async () => {
    const subscription = makeSubscription("sub_intergroup_del");
    const event = makeEvent("customer.subscription.deleted", subscription);
    mockConstructEvent.mockReturnValue(event);

    const req = makeReq(event);
    const res = makeRes();

    await stripeWebhook(req, res);

    expect(res.statusCode).toBe(200);
    expect(mockHandleIntergroupSubscriptionDeleted).toHaveBeenCalledTimes(1);
    expect(mockHandleIntergroupSubscriptionDeleted).toHaveBeenCalledWith(
      subscription,
    );
  });

  it("calls handleSubscriptionDeleted alongside handleIntergroupSubscriptionDeleted for customer.subscription.deleted", async () => {
    const subscription = makeSubscription("sub_group_del");
    const event = makeEvent("customer.subscription.deleted", subscription);
    mockConstructEvent.mockReturnValue(event);

    const req = makeReq(event);
    const res = makeRes();

    await stripeWebhook(req, res);

    // Both handlers must be called
    expect(mockHandleSubscriptionDeleted).toHaveBeenCalledTimes(1);
    expect(mockHandleSubscriptionDeleted).toHaveBeenCalledWith(subscription);
    expect(mockHandleIntergroupSubscriptionDeleted).toHaveBeenCalledTimes(1);
    expect(mockHandleIntergroupSubscriptionDeleted).toHaveBeenCalledWith(
      subscription,
    );
  });

  // ----------------------------------------------------------------
  // Negative: intergroup handlers must NOT be called for unrelated events
  // ----------------------------------------------------------------

  it("does NOT call intergroup handlers for checkout.session.completed", async () => {
    const session = {
      id: "cs_test",
      metadata: {},
      subscription: "sub_1",
      customer: "cus_1",
    };
    const event = makeEvent("checkout.session.completed", session);
    mockConstructEvent.mockReturnValue(event);

    const req = makeReq(event);
    const res = makeRes();

    await stripeWebhook(req, res);

    expect(mockHandleIntergroupSubscriptionUpdated).not.toHaveBeenCalled();
    expect(mockHandleIntergroupSubscriptionDeleted).not.toHaveBeenCalled();
    expect(mockHandleCheckoutSessionCompleted).toHaveBeenCalledTimes(1);
  });

  it("does NOT call intergroup handlers for customer.subscription.trial_will_end", async () => {
    const subscription = makeSubscription("sub_trial");
    const event = makeEvent(
      "customer.subscription.trial_will_end",
      subscription,
    );
    mockConstructEvent.mockReturnValue(event);

    const req = makeReq(event);
    const res = makeRes();

    await stripeWebhook(req, res);

    expect(mockHandleIntergroupSubscriptionUpdated).not.toHaveBeenCalled();
    expect(mockHandleIntergroupSubscriptionDeleted).not.toHaveBeenCalled();
    expect(mockHandleTrialWillEnd).toHaveBeenCalledTimes(1);
  });

  // ----------------------------------------------------------------
  // Idempotency: already-processed events are skipped
  // ----------------------------------------------------------------

  it("skips processing and does not call handlers when event was already processed", async () => {
    // Simulate create() failing with ALREADY_EXISTS (gRPC code 6)
    mockDocCreate.mockRejectedValue({ code: 6 });

    const subscription = makeSubscription("sub_dup");
    const event = makeEvent("customer.subscription.updated", subscription);
    mockConstructEvent.mockReturnValue(event);

    const req = makeReq(event);
    const res = makeRes();

    await stripeWebhook(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ duplicate: true });
    expect(mockHandleSubscriptionUpdated).not.toHaveBeenCalled();
    expect(mockHandleIntergroupSubscriptionUpdated).not.toHaveBeenCalled();
  });
});

describe("stripeWebhook — fails closed when secret is missing", () => {
  let handleWebhookViaRequest: Function;

  beforeAll(async () => {
    jest.resetModules();
    const mod = await import("../http/stripeWebhook");
    handleWebhookViaRequest = mod.stripeWebhook as unknown as Function;
  });

  it("returns 500, not 200, when the webhook secret is not configured", async () => {
    // Re-mock ../utils/stripe with an undefined webhookSecret for this test only.
    jest.resetModules();
    jest.doMock("../utils/stripe", () => ({
      stripe: { webhooks: { constructEvent: mockConstructEvent } },
      webhookSecret: undefined,
      connectWebhookSecret: "whsec_connect_test",
      NonRetriableError: class NonRetriableError extends Error {},
    }));
    const mod = await import("../http/stripeWebhook");
    const stripeWebhookHandler = mod.stripeWebhook as unknown as Function;

    const req = makeReq(makeEvent("checkout.session.completed", {}));
    const res = makeRes();

    await stripeWebhookHandler(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({ processed: false });

    jest.dontMock("../utils/stripe");
  });
});
