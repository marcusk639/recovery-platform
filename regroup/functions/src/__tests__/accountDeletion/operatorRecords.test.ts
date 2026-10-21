// closeOperatorBilling's ownership check is tested in api/stripe.guestCustomer.test.ts.
const mockCloseBilling = jest.fn();
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

jest.mock("../../api/stripeDeletion", () => ({
  closeOperatorBilling: (...a: unknown[]) => mockCloseBilling(...a),
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
  mockCloseBilling.mockResolvedValue(undefined);
  mockWhere.mockReturnValue({ get: mockGet });
  mockGet.mockResolvedValue({ docs: [] });
});

describe("closeOperatorAccount", () => {
  it("closes billing for the deleting uid with the stored ids", async () => {
    await closeOperatorAccount(
      { id: "u1", subscriptionMetadata: { subscriptionId: "sub_1", customerId: "cus_1" } },
      NOW,
    );
    expect(mockCloseBilling).toHaveBeenCalledWith("u1", "sub_1", "cus_1");
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

  it("still closes houses when billing resolves without acting (missing subscription)", async () => {
    mockGet.mockResolvedValue({ docs: [houseDoc("h1")] });
    const result = await closeOperatorAccount(
      { id: "u1", subscriptionMetadata: { subscriptionId: "sub_gone" } },
      NOW,
    );
    expect(result.housesClosed).toEqual(["h1"]);
    expect(mockCloseBilling).toHaveBeenCalledWith("u1", "sub_gone", undefined);
  });

  it("is a no-op for a user who owns nothing and has no subscription", async () => {
    const result = await closeOperatorAccount({ id: "u1" }, NOW);
    expect(result).toEqual({ housesClosed: [] });
    expect(mockCloseBilling).toHaveBeenCalledWith("u1", undefined, undefined);
    expect(mockUpdates).toHaveLength(0);
  });

  it("still cancels a subscription recorded as canceled (stored status may be stale)", async () => {
    mockGet.mockResolvedValue({ docs: [houseDoc("h1")] });
    const result = await closeOperatorAccount(
      {
        id: "u1",
        subscriptionMetadata: { subscriptionId: "sub_1", customerId: "cus_1", status: "canceled" },
      },
      NOW,
    );
    expect(mockCloseBilling).toHaveBeenCalledTimes(1);
    expect(mockCloseBilling).toHaveBeenCalledWith("u1", "sub_1", "cus_1");
    expect(result.housesClosed).toEqual(["h1"]);
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
