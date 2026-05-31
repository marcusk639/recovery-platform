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
  isAlreadyDeauthorized: jest.fn(() => false),
}));

// ── Firestore mock ─────────────────────────────────────────────────────────────
// mockGet is used for all db.collection().doc().get() calls.
// Tests control return values via mockResolvedValueOnce ordering:
//   First call  → house doc
//   Second call → guest doc (only for non-admin paths)
const mockGet = jest.fn();

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
  it("succeeds and does NOT fetch the guest doc when caller is adminId", async () => {
    // House doc returned on first get(); no second get() should be called
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => HOUSE_WITH_STRIPE,
    });

    const result = await run(
      makeRequest({ auth: { uid: "admin-user", token: {} } }),
    );

    expect(result).toHaveProperty("clientSecret");
    // Only one Firestore read: the house doc. Guest doc is NOT fetched for admins.
    expect(mockGet).toHaveBeenCalledTimes(1);
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
      data: () => ({ userId: "resident-uid" }),
    });

    const result = await run(makeRequest());
    expect(result).toHaveProperty("clientSecret");
  });

  it("throws permission-denied when caller's uid does not match guest.userId", async () => {
    mockGet.mockResolvedValueOnce(houseSnap).mockResolvedValueOnce({
      exists: true,
      data: () => ({ userId: "other-resident" }),
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
describe("createPaymentIntent — happy path", () => {
  it("returns clientSecret on successful payment intent creation", async () => {
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => HOUSE_WITH_STRIPE,
    });

    const result = await run(
      makeRequest({ auth: { uid: "admin-user", token: {} } }),
    );

    expect(result).toEqual({ clientSecret: "pi_secret_abc" });
  });
});
