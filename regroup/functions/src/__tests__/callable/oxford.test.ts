// src/__tests__/callable/oxford.test.ts

jest.mock("firebase-functions/v2/https", () => {
  const actual = jest.requireActual("firebase-functions/v2/https");
  return {
    ...actual,
    onCall: (_opts: any, handler?: Function) =>
      typeof _opts === "function" ? _opts : handler,
  };
});

jest.mock("firebase-functions", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockGetHouse = jest.fn();
const mockGetUser = jest.fn();
const mockBatchUpdate = jest.fn();
const mockBatchCommit = jest.fn();
const mockSwapSubscriptionItemPrice = jest.fn();

jest.mock("../../api/firestore", () => ({
  getHouse: mockGetHouse,
  getUser: mockGetUser,
  houseCollection: { doc: jest.fn(() => ({ id: "house-1" })) },
  userCollection: { doc: jest.fn(() => ({ id: "op-1" })) },
  ratsFirestore: {
    batch: jest.fn(() => ({
      update: mockBatchUpdate,
      commit: mockBatchCommit,
    })),
  },
}));

jest.mock("../../api/stripe", () => ({
  OXFORD_PRICE_ID: "price_oxford",
  HOUSE_PRICE_ID: "price_house",
  swapSubscriptionItemPrice: mockSwapSubscriptionItemPrice,
}));

jest.mock("../../config", () => ({
  STRIPE_SECRET_KEY: "STRIPE_SECRET_KEY",
}));

import { setOxfordEnabled } from "../../callable/oxford";
import { HttpsError } from "firebase-functions/v2/https";

const fakeAuth = { uid: "op-1" };
const call = (data: unknown, auth: object | null = fakeAuth) =>
  (setOxfordEnabled as unknown as Function)({ data, auth: auth ?? undefined });

const baseHouse = {
  houseType: "traditional",
  superAdminId: "op-1",
  adminId: "op-1",
};
const baseUser = {
  subscriptionMetadata: {
    items: { houseItemId: "si_abc123" },
    oxfordEnabled: false,
  },
};

beforeEach(() => jest.clearAllMocks());

describe("setOxfordEnabled — auth guards", () => {
  it("throws unauthenticated when no auth", async () => {
    await expect(
      call({ houseId: "house-1", enabled: true }, null),
    ).rejects.toThrow(HttpsError);
  });

  it("throws not-found when house does not exist", async () => {
    mockGetHouse.mockResolvedValue(undefined);
    await expect(
      call({ houseId: "house-1", enabled: true }),
    ).rejects.toMatchObject({
      code: "not-found",
    });
  });

  it("throws permission-denied when caller is not superAdminId", async () => {
    mockGetHouse.mockResolvedValue({
      ...baseHouse,
      superAdminId: "other-user",
    });
    await expect(
      call({ houseId: "house-1", enabled: true }),
    ).rejects.toMatchObject({
      code: "permission-denied",
    });
  });

  it("throws failed-precondition when user has no subscription", async () => {
    mockGetHouse.mockResolvedValue(baseHouse);
    mockGetUser.mockResolvedValue({ subscriptionMetadata: {} });
    await expect(
      call({ houseId: "house-1", enabled: true }),
    ).rejects.toMatchObject({
      code: "failed-precondition",
    });
  });
});

describe("setOxfordEnabled — no-op path", () => {
  it("returns changed:false when already in desired state", async () => {
    mockGetHouse.mockResolvedValue({ ...baseHouse, houseType: "traditional" });
    mockGetUser.mockResolvedValue(baseUser);
    const result = await call({ houseId: "house-1", enabled: false });
    expect(result).toEqual({ success: true, changed: false });
    expect(mockSwapSubscriptionItemPrice).not.toHaveBeenCalled();
    expect(mockBatchCommit).not.toHaveBeenCalled();
  });
});

describe("setOxfordEnabled — happy paths", () => {
  it("swaps Stripe to Oxford price and writes Firestore when enabling", async () => {
    mockGetHouse.mockResolvedValue(baseHouse);
    mockGetUser.mockResolvedValue(baseUser);
    mockSwapSubscriptionItemPrice.mockResolvedValue({});
    mockBatchCommit.mockResolvedValue(undefined);

    const result = await call({ houseId: "house-1", enabled: true });

    expect(mockSwapSubscriptionItemPrice).toHaveBeenCalledWith(
      "si_abc123",
      "price_oxford",
    );
    expect(mockBatchUpdate).toHaveBeenCalledTimes(2);
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ success: true, changed: true });
  });

  it("swaps Stripe to house price and writes Firestore when disabling", async () => {
    mockGetHouse.mockResolvedValue({ ...baseHouse, houseType: "oxford" });
    mockGetUser.mockResolvedValue({
      subscriptionMetadata: {
        items: { houseItemId: "si_abc123" },
        oxfordEnabled: true,
      },
    });
    mockSwapSubscriptionItemPrice.mockResolvedValue({});
    mockBatchCommit.mockResolvedValue(undefined);

    const result = await call({ houseId: "house-1", enabled: false });

    expect(mockSwapSubscriptionItemPrice).toHaveBeenCalledWith(
      "si_abc123",
      "price_house",
    );
    expect(result).toEqual({ success: true, changed: true });
  });
});

describe("setOxfordEnabled — rollback on Firestore failure", () => {
  it("rolls back Stripe and throws internal when Firestore batch fails", async () => {
    mockGetHouse.mockResolvedValue(baseHouse);
    mockGetUser.mockResolvedValue(baseUser);
    mockSwapSubscriptionItemPrice.mockResolvedValue({});
    mockBatchCommit.mockRejectedValue(new Error("Firestore unavailable"));

    await expect(
      call({ houseId: "house-1", enabled: true }),
    ).rejects.toMatchObject({
      code: "internal",
    });

    // First call: enable (house → oxford), second call: rollback (oxford → house)
    expect(mockSwapSubscriptionItemPrice).toHaveBeenCalledTimes(2);
    expect(mockSwapSubscriptionItemPrice).toHaveBeenNthCalledWith(
      1,
      "si_abc123",
      "price_oxford",
    );
    expect(mockSwapSubscriptionItemPrice).toHaveBeenNthCalledWith(
      2,
      "si_abc123",
      "price_house",
    );
  });

  it("does not touch Firestore when Stripe swap fails", async () => {
    mockGetHouse.mockResolvedValue(baseHouse);
    mockGetUser.mockResolvedValue(baseUser);
    mockSwapSubscriptionItemPrice.mockRejectedValue(new Error("Stripe error"));

    await expect(call({ houseId: "house-1", enabled: true })).rejects.toThrow(
      "Stripe error",
    );
    expect(mockBatchCommit).not.toHaveBeenCalled();
  });
});
