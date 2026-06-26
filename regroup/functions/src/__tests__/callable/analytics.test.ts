// src/__tests__/callable/analytics.test.ts

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
const mockGetGuestsForHouse = jest.fn();
const mockGetSuccessfulPaymentsForHouse = jest.fn();

jest.mock("../../api/firestore", () => ({
  getHouse: mockGetHouse,
  getUser: mockGetUser,
  getGuestsForHouse: mockGetGuestsForHouse,
  getSuccessfulPaymentsForHouse: mockGetSuccessfulPaymentsForHouse,
}));

import { rentRoiMetrics } from "../../callable/analytics";
import { HttpsError } from "firebase-functions/v2/https";

const fakeAuth = { uid: "op-1" };
const call = (data: unknown, auth: object | null = fakeAuth) =>
  (rentRoiMetrics as unknown as Function)({ data, auth: auth ?? undefined });

const baseHouse = { houseType: "traditional", superAdminId: "op-1" };

const userWithTier = (houseType: string, tier: string) => ({
  subscriptionMetadata: { houseType, tier },
});

// Yesterday / tomorrow relative to today, so overdue logic is deterministic.
const dayOffset = (days: number) =>
  new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

beforeEach(() => jest.clearAllMocks());

describe("rentRoiMetrics — auth guards", () => {
  it("throws unauthenticated when no auth", async () => {
    await expect(call({ houseId: "house-1" }, null)).rejects.toThrow(
      HttpsError,
    );
  });

  it("throws not-found when house does not exist", async () => {
    mockGetHouse.mockResolvedValue(undefined);
    await expect(call({ houseId: "house-1" })).rejects.toMatchObject({
      code: "not-found",
    });
  });

  it("throws permission-denied when caller is not the house owner", async () => {
    mockGetHouse.mockResolvedValue({ ...baseHouse, superAdminId: "other" });
    await expect(call({ houseId: "house-1" })).rejects.toMatchObject({
      code: "permission-denied",
    });
  });

  it("rejects invalid input (missing houseId)", async () => {
    await expect(call({})).rejects.toBeDefined();
  });
});

describe("rentRoiMetrics — tier gate (upgrade_required)", () => {
  it("returns upgrade_required for a traditional tier without analytics", async () => {
    mockGetHouse.mockResolvedValue(baseHouse);
    mockGetUser.mockResolvedValue(userWithTier("traditional", "starter"));
    const result = await call({ houseId: "house-1" });
    expect(result).toMatchObject({
      available: false,
      status: "upgrade_required",
      feature: "analytics",
      requiredTier: "Professional",
      spec: "RG-TRACK",
    });
  });

  it("returns upgrade_required for an oxford tier without analytics", async () => {
    mockGetHouse.mockResolvedValue({ ...baseHouse, houseType: "oxford" });
    mockGetUser.mockResolvedValue(userWithTier("oxford", "standard"));
    const result = await call({ houseId: "house-1" });
    expect(result).toMatchObject({
      status: "upgrade_required",
      requiredTier: "Plus",
    });
  });

  it("returns upgrade_required when the operator has no tier subscription", async () => {
    mockGetHouse.mockResolvedValue(baseHouse);
    mockGetUser.mockResolvedValue({ subscriptionMetadata: {} });
    const result = await call({ houseId: "house-1" });
    expect(result).toMatchObject({ status: "upgrade_required" });
  });

  it("returns upgrade_required (does not throw) for an unknown tier value", async () => {
    mockGetHouse.mockResolvedValue(baseHouse);
    mockGetUser.mockResolvedValue(userWithTier("traditional", "bogus"));
    const result = await call({ houseId: "house-1" });
    expect(result).toMatchObject({ status: "upgrade_required" });
  });
});

describe("rentRoiMetrics — entitled metrics", () => {
  const entitledTraditional = () => {
    mockGetHouse.mockResolvedValue(baseHouse);
    mockGetUser.mockResolvedValue(userWithTier("traditional", "professional"));
  };

  it("computes collected, outstanding, overdue and payment counts", async () => {
    entitledTraditional();
    mockGetSuccessfulPaymentsForHouse.mockResolvedValue([
      { amount: 500, createdAt: "2026-06-01T10:00:00.000Z" },
      { amount: 250, createdAt: "2026-06-05T10:00:00.000Z" },
    ]);
    mockGetGuestsForHouse.mockResolvedValue([
      // overdue: owes money + due date in the past
      { status: "active", rentOwed: 30000, rentDueDate: dayOffset(-5) },
      // not overdue: owes money but due date in the future
      { status: "active", rentOwed: 20000, rentDueDate: dayOffset(5) },
      // not overdue: no balance
      { status: "active", rentOwed: 0, rentDueDate: dayOffset(-5) },
      // inactive: excluded from outstanding + overdue
      { status: "inactive", rentOwed: 99999, rentDueDate: dayOffset(-5) },
    ]);

    const result = await call({ houseId: "house-1" });
    expect(result).toMatchObject({
      available: true,
      spec: "RG-TRACK",
      collectedGrossCents: 75000, // (500 + 250) * 100
      paymentCount: 2,
      outstandingCents: 50000, // 30000 + 20000 + 0 (active only)
      overdueResidentCount: 1,
    });
    expect(result.period).toEqual({ startDate: null, endDate: null });
    expect(Array.isArray(result.caveats)).toBe(true);
    expect(result.caveats.length).toBe(2);
  });

  it("treats a guest with missing status as active", async () => {
    entitledTraditional();
    mockGetSuccessfulPaymentsForHouse.mockResolvedValue([]);
    mockGetGuestsForHouse.mockResolvedValue([
      { rentOwed: 15000 }, // no status field
    ]);
    const result = await call({ houseId: "house-1" });
    expect(result.outstandingCents).toBe(15000);
  });

  it("filters payments outside the [startDate, endDate] window", async () => {
    entitledTraditional();
    mockGetGuestsForHouse.mockResolvedValue([]);
    mockGetSuccessfulPaymentsForHouse.mockResolvedValue([
      { amount: 100, createdAt: "2026-05-15T00:00:00.000Z" }, // before window
      { amount: 200, createdAt: "2026-06-10T00:00:00.000Z" }, // in window
      { amount: 300, createdAt: "2026-07-02T00:00:00.000Z" }, // after window
    ]);

    const result = await call({
      houseId: "house-1",
      startDate: "2026-06-01",
      endDate: "2026-06-30",
    });
    expect(result.paymentCount).toBe(1);
    expect(result.collectedGrossCents).toBe(20000); // 200 * 100
    expect(result.period).toEqual({
      startDate: "2026-06-01",
      endDate: "2026-06-30",
    });
  });

  it("rounds dollars→cents correctly for fractional amounts", async () => {
    entitledTraditional();
    mockGetGuestsForHouse.mockResolvedValue([]);
    mockGetSuccessfulPaymentsForHouse.mockResolvedValue([
      { amount: 99.99, createdAt: "2026-06-10T00:00:00.000Z" },
    ]);
    const result = await call({ houseId: "house-1" });
    expect(result.collectedGrossCents).toBe(9999); // round(99.99 * 100)
  });

  it("handles Firestore Timestamp createdAt (toDate + _seconds)", async () => {
    entitledTraditional();
    mockGetGuestsForHouse.mockResolvedValue([]);
    mockGetSuccessfulPaymentsForHouse.mockResolvedValue([
      {
        amount: 100,
        createdAt: { toDate: () => new Date("2026-06-10T00:00:00.000Z") },
      },
      { amount: 50, createdAt: { _seconds: 1750118400 } }, // 2025-06-17 (out of window)
    ]);
    const result = await call({
      houseId: "house-1",
      startDate: "2026-06-01",
      endDate: "2026-06-30",
    });
    expect(result.paymentCount).toBe(1);
    expect(result.collectedGrossCents).toBe(10000);
  });

  it("returns available:true for an entitled oxford tier", async () => {
    mockGetHouse.mockResolvedValue({ ...baseHouse, houseType: "oxford" });
    mockGetUser.mockResolvedValue(userWithTier("oxford", "plus"));
    mockGetSuccessfulPaymentsForHouse.mockResolvedValue([]);
    mockGetGuestsForHouse.mockResolvedValue([]);
    const result = await call({ houseId: "house-1" });
    expect(result).toMatchObject({ available: true, spec: "RG-TRACK" });
  });
});

describe("rentRoiMetrics — refund netting (#35)", () => {
  const entitledTraditional = () => {
    mockGetHouse.mockResolvedValue(baseHouse);
    mockGetUser.mockResolvedValue(userWithTier("traditional", "professional"));
  };

  it("nets refunds out of gross to produce collectedNetCents", async () => {
    entitledTraditional();
    mockGetGuestsForHouse.mockResolvedValue([]);
    mockGetSuccessfulPaymentsForHouse.mockResolvedValue([
      // $500, $100 refunded
      {
        amount: 500,
        createdAt: "2026-06-01T10:00:00.000Z",
        refundedAmountCents: 10000,
      },
      // $250, no refund field
      { amount: 250, createdAt: "2026-06-05T10:00:00.000Z" },
    ]);

    const result = await call({ houseId: "house-1" });
    expect(result.collectedGrossCents).toBe(75000); // (500 + 250) * 100
    expect(result.refundedCents).toBe(10000);
    expect(result.collectedNetCents).toBe(65000); // 75000 - 10000
  });

  it("floors collectedNetCents at 0 when refunds exceed gross", async () => {
    entitledTraditional();
    mockGetGuestsForHouse.mockResolvedValue([]);
    mockGetSuccessfulPaymentsForHouse.mockResolvedValue([
      {
        amount: 100,
        createdAt: "2026-06-01T10:00:00.000Z",
        refundedAmountCents: 50000, // refunded far more than collected
      },
    ]);

    const result = await call({ houseId: "house-1" });
    expect(result.collectedGrossCents).toBe(10000);
    expect(result.refundedCents).toBe(50000);
    expect(result.collectedNetCents).toBe(0);
  });

  it("collectedNetCents equals gross when there are no refunds", async () => {
    entitledTraditional();
    mockGetGuestsForHouse.mockResolvedValue([]);
    mockGetSuccessfulPaymentsForHouse.mockResolvedValue([
      { amount: 300, createdAt: "2026-06-01T10:00:00.000Z" },
    ]);

    const result = await call({ houseId: "house-1" });
    expect(result.refundedCents).toBe(0);
    expect(result.collectedNetCents).toBe(30000);
    expect(result.collectedNetCents).toBe(result.collectedGrossCents);
  });
});

describe("rentRoiMetrics — on-time rate (#34)", () => {
  const entitledTraditional = () => {
    mockGetHouse.mockResolvedValue(baseHouse);
    mockGetUser.mockResolvedValue(userWithTier("traditional", "professional"));
  };

  it("computes onTimeRatePct over only payments with a recorded dueDate", async () => {
    entitledTraditional();
    mockGetGuestsForHouse.mockResolvedValue([]);
    mockGetSuccessfulPaymentsForHouse.mockResolvedValue([
      // on-time: paid 2026-06-01, due 2026-06-05
      {
        amount: 100,
        createdAt: "2026-06-01T10:00:00.000Z",
        dueDate: "2026-06-05",
      },
      // on-time (boundary): paid exactly on the due date
      {
        amount: 100,
        createdAt: "2026-06-10T10:00:00.000Z",
        dueDate: "2026-06-10",
      },
      // late: paid 2026-06-20, due 2026-06-10
      {
        amount: 100,
        createdAt: "2026-06-20T10:00:00.000Z",
        dueDate: "2026-06-10",
      },
      // excluded: no dueDate
      { amount: 100, createdAt: "2026-06-15T10:00:00.000Z" },
    ]);

    const result = await call({ houseId: "house-1" });
    // 3 payments have a dueDate; 2 of them are on-time → round(2/3*100) = 67
    expect(result.duePaymentCount).toBe(3);
    expect(result.onTimeRatePct).toBe(67);
    expect(result.paymentCount).toBe(4);
    // Partial coverage (1 payment lacks a dueDate) → partial-coverage caveat present
    expect(
      result.caveats.some((c: string) => c.includes("recorded due date")),
    ).toBe(true);
  });

  it("returns onTimeRatePct null when no payment has a dueDate", async () => {
    entitledTraditional();
    mockGetGuestsForHouse.mockResolvedValue([]);
    mockGetSuccessfulPaymentsForHouse.mockResolvedValue([
      { amount: 100, createdAt: "2026-06-01T10:00:00.000Z" },
    ]);

    const result = await call({ houseId: "house-1" });
    expect(result.duePaymentCount).toBe(0);
    expect(result.onTimeRatePct).toBeNull();
  });

  it("omits the partial-coverage caveat when every payment has a dueDate", async () => {
    entitledTraditional();
    mockGetGuestsForHouse.mockResolvedValue([]);
    mockGetSuccessfulPaymentsForHouse.mockResolvedValue([
      {
        amount: 100,
        createdAt: "2026-06-01T10:00:00.000Z",
        dueDate: "2026-06-05",
      },
      {
        amount: 100,
        createdAt: "2026-06-09T10:00:00.000Z",
        dueDate: "2026-06-05",
      },
    ]);

    const result = await call({ houseId: "house-1" });
    expect(result.duePaymentCount).toBe(2);
    expect(result.onTimeRatePct).toBe(50); // 1 on-time of 2
    expect(
      result.caveats.some((c: string) => c.includes("recorded due date")),
    ).toBe(false);
    // hours-saved caveat always present
    expect(result.caveats.some((c: string) => c.includes("hours-saved"))).toBe(
      true,
    );
  });
});
