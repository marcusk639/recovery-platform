// functions/src/tests/upgradeIntergroupTier.test.ts
const mockStripeCheckoutCreate = jest.fn();
const mockUpdate = jest.fn();
const mockDocGet = jest.fn();

jest.mock("firebase-admin", () => ({
  apps: [{ name: "[DEFAULT]" }],
  initializeApp: jest.fn(),
  firestore: Object.assign(
    jest.fn(() => ({
      collection: jest.fn(() => ({
        doc: jest.fn(() => ({ get: mockDocGet, update: mockUpdate })),
      })),
    })),
    {
      FieldValue: { serverTimestamp: jest.fn(() => "SERVER_TS") },
    },
  ),
}));

jest.mock("firebase-functions/v2", () => ({
  logger: { info: jest.fn(), error: jest.fn() },
}));

jest.mock("firebase-functions/v2/https", () => ({
  onCall: (_opts: any, handler: any) => handler,
  HttpsError: class HttpsError extends Error {
    constructor(
      public code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));

jest.mock("../utils/stripe", () => ({
  stripe: {
    checkout: { sessions: { create: mockStripeCheckoutCreate } },
  },
  productIdIntergroupB: "prod_tier_b",
  getDefaultPriceForProduct: jest.fn().mockResolvedValue("price_tier_b"),
}));

import { upgradeIntergroupTierHandler } from "../callable/upgradeIntergroupTier";

const makeRequest = (overrides: any = {}) => ({
  auth: { uid: "owner-1" },
  data: { intergroupId: "intergroup-1" },
  ...overrides,
});

describe("upgradeIntergroupTierHandler", () => {
  beforeEach(() => jest.clearAllMocks());

  it("throws unauthenticated when no auth", async () => {
    const req = makeRequest({ auth: null });
    await expect(upgradeIntergroupTierHandler(req)).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  it("throws invalid-argument when intergroupId is missing", async () => {
    const req = makeRequest({ data: {} });
    await expect(upgradeIntergroupTierHandler(req)).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  it("throws not-found when intergroup doc does not exist", async () => {
    mockDocGet.mockResolvedValueOnce({ exists: false });
    const req = makeRequest();
    await expect(upgradeIntergroupTierHandler(req)).rejects.toMatchObject({
      code: "not-found",
    });
  });

  it("throws permission-denied when caller is not in adminUids", async () => {
    mockDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ adminUids: ["someone-else"], tier: "tier_a" }),
    });
    const req = makeRequest();
    await expect(upgradeIntergroupTierHandler(req)).rejects.toMatchObject({
      code: "permission-denied",
    });
  });

  it("throws failed-precondition when already on tier_b", async () => {
    mockDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ adminUids: ["owner-1"], tier: "tier_b" }),
    });
    const req = makeRequest();
    await expect(upgradeIntergroupTierHandler(req)).rejects.toMatchObject({
      code: "failed-precondition",
    });
  });

  it("returns checkoutUrl when valid tier_a admin upgrades", async () => {
    mockDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        adminUids: ["owner-1"],
        tier: "tier_a",
        stripeCustomerId: "cus_abc",
      }),
    });
    mockUpdate.mockResolvedValueOnce(undefined);
    mockStripeCheckoutCreate.mockResolvedValueOnce({
      url: "https://checkout.stripe.com/pay/cs_test_abc",
    });
    const req = makeRequest();
    const result = await upgradeIntergroupTierHandler(req);
    expect(result).toEqual({
      checkoutUrl: "https://checkout.stripe.com/pay/cs_test_abc",
    });
    expect(mockUpdate).toHaveBeenCalledWith({
      pendingUpgradeSessionId: "pending",
    });
    expect(mockStripeCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_abc",
        metadata: expect.objectContaining({
          intergroupId: "intergroup-1",
          uid: "owner-1",
          upgradeFrom: "tier_a",
          upgradeTo: "tier_b",
        }),
      }),
    );
  });
});
