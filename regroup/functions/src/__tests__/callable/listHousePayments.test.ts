/**
 * Unit tests for listHousePayments Cloud Function.
 *
 * We test the authorization and business logic in isolation by mocking:
 * - firebase-admin (Firestore reads)
 * - Stripe client
 * - assertHouseMemberFromClaims
 */

// Mock firebase-functions/v2/https so onCall returns { run: handler }
// which matches how we invoke the function under test.
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

// Stub api/firestore to prevent admin.app() being called at module load time
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

// Stub util/guest to avoid the deep firestore import chain
jest.mock("../../util/guest", () => ({
  transferStats: jest.fn(),
}));

jest.mock("../../util/houseAuth", () => ({
  ...jest.requireActual("../../util/houseAuth"),
  assertHouseMemberFromClaims: jest.fn(),
}));

jest.mock("../../util/stripe", () => ({
  createStripeClient: jest.fn(() => ({
    charges: {
      list: jest.fn().mockResolvedValue({
        data: [
          {
            id: "ch_001",
            amount: 50000,
            currency: "usd",
            status: "succeeded",
            description: "Rent payment",
            created: 1700000000,
            receipt_url: "https://stripe.com/receipts/001",
            metadata: { guestId: "guest1", houseId: "house1" },
          },
          {
            id: "ch_002",
            amount: 25000,
            currency: "usd",
            status: "pending",
            description: "Chore fee",
            created: 1699900000,
            receipt_url: null,
            metadata: { guestId: "guest2", houseId: "house1" },
          },
        ],
      }),
    },
  })),
  mapStripeError: jest.fn((e: any) => e),
  isAlreadyDeauthorized: jest.fn(() => false),
}));

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
    }
  ),
  app: jest.fn(() => ({})),
  initializeApp: jest.fn(),
}));

import { listHousePayments } from "../../callable/payments";
import * as houseAuth from "../../util/houseAuth";

const makeRequest = (overrides: Record<string, any> = {}) => ({
  auth: { uid: "admin1", token: { admin: { house1: true } } },
  data: { houseId: "house1", limit: 50 },
  ...overrides,
});

describe("listHousePayments", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue({
      exists: true,
      data: () => ({ stripeAccountId: "acct_test_123" }),
    });
  });

  it("throws unauthenticated when auth is missing", async () => {
    const req = makeRequest({ auth: null });
    await expect((listHousePayments as any).run(req)).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  it("throws invalid-argument when houseId is missing", async () => {
    const req = makeRequest({ data: {} });
    await expect((listHousePayments as any).run(req)).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  it("calls assertHouseMemberFromClaims with the token and houseId", async () => {
    await (listHousePayments as any).run(makeRequest());
    expect(houseAuth.assertHouseMemberFromClaims).toHaveBeenCalledWith(
      expect.objectContaining({ admin: { house1: true } }),
      "house1"
    );
  });

  it("returns empty payments when house has no stripeAccountId", async () => {
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({}),
    });
    const result = await (listHousePayments as any).run(makeRequest());
    expect(result.payments).toEqual([]);
  });

  it("returns mapped payment records from Stripe charges", async () => {
    const result = await (listHousePayments as any).run(makeRequest());
    expect(result.payments).toHaveLength(2);
    expect(result.payments[0]).toMatchObject({
      id: "ch_001",
      amount: 500,
      currency: "usd",
      status: "succeeded",
      guestId: "guest1",
    });
    expect(result.payments[1]).toMatchObject({
      id: "ch_002",
      amount: 250,
      guestId: "guest2",
    });
  });

  it("converts Stripe amount from cents to dollars", async () => {
    const result = await (listHousePayments as any).run(makeRequest());
    expect(result.payments[0].amount).toBe(500);
    expect(result.payments[1].amount).toBe(250);
  });
});
