/**
 * Unit tests for createPaymentIntent — focuses on the authorization layer added
 * in P1.A: caller must be either the resident (guest.userId === uid) or a house
 * admin. The Stripe interaction is mocked throughout.
 */

jest.mock("firebase-functions/v2/https", () => {
  const actual = jest.requireActual("firebase-functions/v2/https");
  return {
    ...actual,
    onCall: (_optsOrHandler: any, handler?: Function) => ({
      run: typeof _optsOrHandler === "function" ? _optsOrHandler : handler,
    }),
  };
});

jest.mock("firebase-functions", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock("firebase-functions/params", () => ({
  defineSecret: jest.fn((name: string) => ({ name })),
}));

jest.mock("../../api/firestore", () => ({
  app: {},
  ratsFirestore: {},
  guestCollection: {},
  houseCollection: {},
  weekSummariesCollection: {},
  userCollection: {},
  notificationCollection: {},
  meetingCollection: {},
}));

jest.mock("../../util/guest", () => ({ transferStats: jest.fn() }));

jest.mock("../../util/stripe", () => ({
  createStripeClient: jest.fn(() => ({
    paymentIntents: {
      create: jest.fn().mockResolvedValue({ client_secret: "pi_secret_abc" }),
    },
  })),
  mapStripeError: jest.fn((e: any) => e),
}));

// ── Firestore mock ─────────────────────────────────────────────────────────────
// mockGet is used for all db.collection().doc().get() calls.
// Tests control return values via mockResolvedValueOnce ordering:
//   First call  → house doc
//   Second call → guest doc (only for non-admin paths)
const mockGet = jest.fn();

// No house-roles record for any caller here: only the resident or the house's
// owner fields authorize, as before.
jest.mock("../../util/houseRoleStore", () => ({
  ...jest.requireActual("../../util/houseRoleStore"),
  readRoleTier: jest.fn(() => Promise.resolve(null)),
}));
jest.mock("firebase-admin", () => ({
  firestore: Object.assign(
    jest.fn(() => ({
      collection: jest.fn(() => ({
        doc: jest.fn(() => ({ get: mockGet })),
      })),
    })),
    {
      FieldValue: {
        delete: jest.fn(() => "DELETE"),
        arrayUnion: jest.fn((v: any) => v),
        arrayRemove: jest.fn((v: any) => v),
      },
    },
  ),
  app: jest.fn(() => ({})),
  initializeApp: jest.fn(),
}));

import { createPaymentIntent } from "../../callable/payments";

const HOUSE_WITH_STRIPE = {
  stripeAccountId: "acct_test_123",
  stripeStatus: "active",
  adminId: "admin-user",
  adminIds: ["admin-user"],
  superAdminIds: [],
  ownerId: "admin-user",
};

const makeRequest = (overrides: Partial<Record<string, any>> = {}) => ({
  auth: { uid: "resident-uid", token: {} },
  data: {
    amount: 100000,
    houseId: "house-1",
    guestId: "guest-doc-1",
  },
  ...overrides,
});

const run = (req: any) => (createPaymentIntent as any).run(req);

beforeEach(() => jest.clearAllMocks());

// ── Auth guard ─────────────────────────────────────────────────────────────────
describe("createPaymentIntent — unauthenticated", () => {
  it("refuses a non-USD currency instead of letting the client pick one", async () => {
    // currency was `z.string().optional()` and passed straight to Stripe, while the
    // webhook decrements rentOwed by paymentIntent.amount with no currency check.
    // {amount: 50000, currency: 'jpy'} charges ~¥50,000 (about $335) and clears a
    // $500 balance. The unit of `amount` is only meaningful alongside its currency.
    await expect(
      run(
        makeRequest({
          data: {
            amount: 50000,
            currency: "jpy",
            houseId: "house-1",
            guestId: "guest-doc-1",
          },
        }),
      ),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("refuses an amount above the server-side cap", async () => {
    // The $100k bound lived only in the mobile client (MAX_PAYMENT_CENTS), so a
    // direct callable invocation had no upper limit at all.
    await expect(
      run(
        makeRequest({
          data: {
            amount: 10000001,
            houseId: "house-1",
            guestId: "guest-doc-1",
          },
        }),
      ),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("throws unauthenticated when auth is missing", async () => {
    await expect(run(makeRequest({ auth: null }))).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });
});

// ── House validation ───────────────────────────────────────────────────────────
describe("createPaymentIntent — house validation", () => {
  it("throws not-found when house does not exist", async () => {
    mockGet.mockResolvedValueOnce({ exists: false });
    await expect(run(makeRequest())).rejects.toMatchObject({
      code: "not-found",
    });
  });

  it("throws failed-precondition when house has no active Stripe account", async () => {
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ stripeStatus: "pending" }),
    });
    await expect(run(makeRequest())).rejects.toMatchObject({
      code: "failed-precondition",
    });
  });
});

// ── Authorization: admin bypass ────────────────────────────────────────────────
describe("createPaymentIntent — house admin is authorized without guest lookup", () => {
  it("succeeds for a house admin, and still reads the guest doc to confirm the house", async () => {
    // This test previously asserted the opposite — that admins skip the guest
    // lookup (expect(mockGet).toHaveBeenCalledTimes(1)) — which is what allowed
    // an admin of one house to name a guest belonging to another. The guest doc
    // is now read on every path, because it is the only authority on which house
    // a guest belongs to.
    mockGet
      .mockResolvedValueOnce({ exists: true, data: () => HOUSE_WITH_STRIPE })
      .mockResolvedValueOnce({
        exists: true,
        data: () => ({ userId: "some-resident", houseId: "house-1", rentOwed: 100000 }),
      });

    const result = await run(
      makeRequest({ auth: { uid: "admin-user", token: {} } }),
    );

    expect(result).toHaveProperty("clientSecret");
    // Two reads now: the house doc, then the guest doc.
    expect(mockGet).toHaveBeenCalledTimes(2);
  });
});

// ── Authorization: resident self-payment ───────────────────────────────────────
describe("createPaymentIntent — resident authorization", () => {
  const houseSnap = {
    exists: true,
    // House with no admins so caller is never an admin
    data: () => ({
      ...HOUSE_WITH_STRIPE,
      adminId: "",
      adminIds: [],
      ownerId: "",
    }),
  };

  it("succeeds when caller's uid matches guest.userId", async () => {
    mockGet.mockResolvedValueOnce(houseSnap).mockResolvedValueOnce({
      exists: true,
      data: () => ({ userId: "resident-uid", houseId: "house-1", rentOwed: 100000 }),
    });

    const result = await run(makeRequest());
    expect(result).toHaveProperty("clientSecret");
  });

  it("throws permission-denied when caller's uid does not match guest.userId", async () => {
    mockGet.mockResolvedValueOnce(houseSnap).mockResolvedValueOnce({
      exists: true,
      data: () => ({ userId: "other-resident", houseId: "house-1" }),
    });

    await expect(run(makeRequest())).rejects.toMatchObject({
      code: "permission-denied",
    });
  });

  it("throws not-found when guest doc does not exist", async () => {
    mockGet
      .mockResolvedValueOnce(houseSnap)
      .mockResolvedValueOnce({ exists: false });

    await expect(run(makeRequest())).rejects.toMatchObject({
      code: "not-found",
    });
  });
});

// ── Happy path: returns clientSecret ──────────────────────────────────────────
describe("createPaymentIntent — guest must belong to the supplied house", () => {
  // The suite's global beforeEach uses jest.clearAllMocks(), which clears call
  // records but NOT queued mockResolvedValueOnce values. A test that queues a
  // value the code never consumes therefore leaks it into the next test. Reset
  // the queue after each of these so that cannot happen.
  afterEach(() => mockGet.mockReset());

  // Regression cover for a cross-tenant payment misdirection. The callable took
  // houseId from the client and only checked that the caller owned the guest doc,
  // never that the guest belonged to that house. A resident of house-1 could pass
  // houseId: "house-2", and transfer_data.destination then sent the money to
  // house-2's Stripe account while the webhook credited rentOwed on the resident's
  // own guest doc — house-1's books showed rent collected that it never received.
  it("throws permission-denied when the guest belongs to a different house", async () => {
    mockGet
      // The supplied house: a real, Stripe-active house the caller has no claim to.
      .mockResolvedValueOnce({
        exists: true,
        data: () => ({
          ...HOUSE_WITH_STRIPE,
          adminId: "",
          adminIds: [],
          stripeAccountId: "acct_other_house",
        }),
      })
      // The caller genuinely owns this guest doc, so the userId check passes.
      // It is the houseId that does not match.
      .mockResolvedValueOnce({
        exists: true,
        data: () => ({ userId: "resident-uid", houseId: "house-1", rentOwed: 100000 }),
      });

    await expect(
      run(
        makeRequest({
          data: { amount: 100000, houseId: "house-2", guestId: "guest-doc-1" },
        }),
      ),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("throws permission-denied for an admin of the supplied house when the guest belongs elsewhere", async () => {
    // The admin path previously skipped the guest lookup entirely, so an admin of
    // house-2 could name any guest in the system.
    mockGet
      .mockResolvedValueOnce({ exists: true, data: () => HOUSE_WITH_STRIPE })
      .mockResolvedValueOnce({
        exists: true,
        data: () => ({ userId: "someone-else", houseId: "house-99" }),
      });

    await expect(
      run(
        makeRequest({
          auth: { uid: "admin-user", token: {} },
          data: { amount: 100000, houseId: "house-1", guestId: "guest-doc-1" },
        }),
      ),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });
});

describe("createPaymentIntent — happy path", () => {
  it("returns clientSecret on successful payment intent creation", async () => {
    mockGet
      .mockResolvedValueOnce({ exists: true, data: () => HOUSE_WITH_STRIPE })
      // The guest doc is read on every path now, admin included, to confirm the
      // guest belongs to the house being paid.
      .mockResolvedValueOnce({
        exists: true,
        data: () => ({ userId: "some-resident", houseId: "house-1", rentOwed: 100000 }),
      });

    const result = await run(
      makeRequest({ auth: { uid: "admin-user", token: {} } }),
    );

    expect(result).toEqual({ clientSecret: "pi_secret_abc" });
  });
});

// Owner decision D3: refuse a payment above the balance when it starts, because a
// card charge can't be undone by the ledger later.
describe("createPaymentIntent — amount against the balance", () => {
  const start = (amount: number, guest: Record<string, unknown>) => {
    mockGet
      .mockResolvedValueOnce({ exists: true, data: () => HOUSE_WITH_STRIPE })
      .mockResolvedValueOnce({
        exists: true,
        data: () => ({ userId: "resident-uid", houseId: "house-1", ...guest }),
      });
    return (createPaymentIntent as any).run({
      auth: { uid: "resident-uid", token: {} },
      data: { amount, guestId: "guest-doc-1", houseId: "house-1" },
    });
  };

  it("accepts exactly the balance", async () => {
    await expect(start(5000, { rentOwed: 5000 })).resolves.toEqual(
      expect.objectContaining({ clientSecret: expect.any(String) }),
    );
  });

  it("counts chore fees as owed", async () => {
    await expect(start(6000, { rentOwed: 5000, choreFees: 1000 })).resolves.toEqual(
      expect.objectContaining({ clientSecret: expect.any(String) }),
    );
  });

  it("accepts less than the balance", async () => {
    await expect(start(100, { rentOwed: 5000 })).resolves.toEqual(
      expect.objectContaining({ clientSecret: expect.any(String) }),
    );
  });

  it("refuses one cent over, and says how much is owed", async () => {
    await expect(start(5001, { rentOwed: 5000 })).rejects.toMatchObject({
      code: "failed-precondition",
      message: expect.stringContaining("$50.00"),
    });
  });

  it.each([
    ["nothing owed", { rentOwed: 0 }],
    ["no balance fields at all", {}],
    ["null balance fields", { rentOwed: null, choreFees: null }],
    ["a credit balance", { rentOwed: -2000 }],
  ])("says nothing is owed with %s", async (_name, guest) => {
    await expect(start(100, guest)).rejects.toMatchObject({
      code: "failed-precondition",
      message: expect.stringContaining("Nothing is owed"),
    });
  });

  // A bad value must never widen the cap: amount > NaN is false, and "5000" + 0
  // is the string "50000". Nothing guarantees these types on old documents.
  it.each([
    ["NaN", { rentOwed: NaN }],
    ["Infinity", { rentOwed: Infinity }],
    ["text", { rentOwed: "abc" }],
    ["a number stored as text", { rentOwed: "5000" }],
    ["an object", { rentOwed: {} }],
    ["bad chore fees on a good balance", { rentOwed: 5000, choreFees: "1000" }],
  ])("refuses and logs when the balance is %s", async (_name, guest) => {
    const { logger } = require("firebase-functions");
    await expect(start(100, guest)).rejects.toMatchObject({
      code: "failed-precondition",
      message: expect.stringContaining("contact your house manager"),
    });
    expect(logger.error).toHaveBeenCalledWith(
      "createPaymentIntent: malformed balance",
      { guestId: "guest-doc-1" },
    );
  });

  it("lets a fractional legacy balance be paid in full, as the app rounds it up", async () => {
    await expect(start(1001, { rentOwed: 1000.6 })).resolves.toEqual(
      expect.objectContaining({ clientSecret: expect.any(String) }),
    );
  });

  it("makes no Stripe call when it refuses", async () => {
    await expect(start(9999, { rentOwed: 1 })).rejects.toMatchObject({
      code: "failed-precondition",
    });
    const { createStripeClient } = require("../../util/stripe");
    for (const client of createStripeClient.mock.results) {
      expect(client.value.paymentIntents.create).not.toHaveBeenCalled();
    }
  });
});
