const mockCancelNow = jest.fn();
const mockDeleteCustomer = jest.fn();
const mockWhere = jest.fn();
const mockGet = jest.fn();
const mockUpdates: Array<{ id: string; data: Record<string, unknown> }> = [];

const DELETE_SENTINEL = { sentinel: "delete" };

jest.mock("firebase-admin", () => {
  const firestore = () => ({});
  firestore.FieldValue = { delete: () => DELETE_SENTINEL };
  return { firestore };
});

jest.mock("firebase-functions/v2", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock("../../api/stripe", () => ({
  cancelSubscriptionNow: (...a: unknown[]) => mockCancelNow(...a),
  deleteCustomer: (...a: unknown[]) => mockDeleteCustomer(...a),
}));

jest.mock("../../api/firestore", () => ({
  houseCollection: { where: (...a: unknown[]) => mockWhere(...a) },
}));

import { closeOperatorAccount } from "../../accountDeletion/operatorRecords";

const NOW = "2026-10-20T00:00:00.000Z";

const houseDoc = (id: string) => ({
  id,
  ref: {
    update: jest.fn(async (data: Record<string, unknown>) => {
      mockUpdates.push({ id, data });
    }),
  },
});

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdates.length = 0;
  mockCancelNow.mockResolvedValue(undefined);
  mockDeleteCustomer.mockResolvedValue(undefined);
  mockWhere.mockReturnValue({ get: mockGet });
  mockGet.mockResolvedValue({ docs: [] });
});

describe("closeOperatorAccount", () => {
  it("cancels the subscription now and deletes the customer", async () => {
    await closeOperatorAccount(
      { id: "u1", subscriptionMetadata: { subscriptionId: "sub_1", customerId: "cus_1" } },
      NOW,
    );
    expect(mockCancelNow).toHaveBeenCalledWith("sub_1");
    expect(mockDeleteCustomer).toHaveBeenCalledWith("cus_1");
  });

  it("closes every owned house and unlinks Connect", async () => {
    mockGet
      .mockResolvedValueOnce({ docs: [houseDoc("h1"), houseDoc("h2")] })
      .mockResolvedValueOnce({ docs: [] });
    const result = await closeOperatorAccount({ id: "u1" }, NOW);
    expect(mockWhere).toHaveBeenCalledWith("ownerId", "==", "u1");
    expect(mockWhere).toHaveBeenCalledWith("superAdminId", "==", "u1");
    expect(result).toEqual({ housesClosed: ["h1", "h2"] });
    expect(mockUpdates).toHaveLength(2);
    for (const u of mockUpdates) {
      expect(u.data).toEqual({
        subscriptionStatus: "canceled",
        closedAt: NOW,
        stripeAccountId: DELETE_SENTINEL,
        stripeStatus: "disconnected",
      });
    }
  });

  it("treats a missing Stripe subscription as already cancelled", async () => {
    // The helper resolves when the subscription is already gone.
    mockCancelNow.mockResolvedValue(undefined);
    mockGet.mockResolvedValue({ docs: [houseDoc("h1")] });
    const result = await closeOperatorAccount(
      { id: "u1", subscriptionMetadata: { subscriptionId: "sub_gone" } },
      NOW,
    );
    expect(result.housesClosed).toEqual(["h1"]);
    expect(mockDeleteCustomer).not.toHaveBeenCalled();
  });

  it("is a no-op for a user who owns nothing and has no subscription", async () => {
    const result = await closeOperatorAccount({ id: "u1" }, NOW);
    expect(result).toEqual({ housesClosed: [] });
    expect(mockCancelNow).not.toHaveBeenCalled();
    expect(mockDeleteCustomer).not.toHaveBeenCalled();
    expect(mockUpdates).toHaveLength(0);
  });

  it("skips the cancel for a subscription already recorded as canceled", async () => {
    await closeOperatorAccount(
      {
        id: "u1",
        subscriptionMetadata: { subscriptionId: "sub_1", customerId: "cus_1", status: "canceled" },
      },
      NOW,
    );
    expect(mockCancelNow).not.toHaveBeenCalled();
    expect(mockDeleteCustomer).toHaveBeenCalledWith("cus_1");
  });

  it("closes superAdminId houses too, once each", async () => {
    mockGet
      .mockResolvedValueOnce({ docs: [houseDoc("h1")] })
      .mockResolvedValueOnce({ docs: [houseDoc("h1"), houseDoc("h2")] });
    const result = await closeOperatorAccount({ id: "u1" }, NOW);
    expect(result.housesClosed).toEqual(["h1", "h2"]);
    expect(mockUpdates.map((u) => u.id)).toEqual(["h1", "h2"]);
  });
});
