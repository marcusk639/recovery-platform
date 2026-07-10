export {};

jest.mock("firebase-functions/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock("firebase-functions/v2/https", () => ({
  onCall: (opts: any, handler: (req: any) => Promise<any>) => handler,
  HttpsError: class HttpsError extends Error {
    code: string;
    details?: any;
    constructor(code: string, message: string, details?: any) {
      super(message);
      this.code = code;
      this.details = details;
      this.name = "HttpsError";
    }
  },
}));

const mockAccountsRetrieve = jest.fn();
const mockBalanceRetrieve = jest.fn();
const mockChargesList = jest.fn();
const mockCustomersList = jest.fn();
const mockSubscriptionsList = jest.fn();
const mockProductsList = jest.fn();
const mockPricesList = jest.fn();

jest.mock("../utils/stripe", () => ({
  stripe: {
    accounts: { retrieve: mockAccountsRetrieve },
    balance: { retrieve: mockBalanceRetrieve },
    charges: { list: mockChargesList },
    customers: { list: mockCustomersList },
    subscriptions: { list: mockSubscriptionsList },
    products: { list: mockProductsList },
    prices: { list: mockPricesList },
  },
}));

function makeRequest(
  uid: string | null,
  superAdmin: boolean,
  data: Record<string, any> = {},
): any {
  return { auth: uid ? { uid, token: { superAdmin } } : null, data };
}

describe("getStripeAccountMetrics", () => {
  const userId = "admin-uid";

  beforeEach(() => {
    jest.clearAllMocks();
    mockAccountsRetrieve.mockResolvedValue({
      id: "acct_platform",
      capabilities: {},
      requirements: {},
    });
    mockBalanceRetrieve.mockResolvedValue({});
    mockChargesList.mockResolvedValue({
      data: [
        { id: "ch_1", status: "succeeded", amount: 1200 },
        { id: "ch_2", status: "failed", amount: 500 },
      ],
    });
    mockCustomersList.mockResolvedValue({ data: [{ id: "cus_1" }] });
    mockSubscriptionsList.mockResolvedValue({
      data: [
        { id: "sub_1", status: "active" },
        { id: "sub_2", status: "trialing" },
        { id: "sub_3", status: "canceled" },
      ],
    });
    mockProductsList.mockResolvedValue({ data: [] });
    mockPricesList.mockResolvedValue({ data: [] });
  });

  it("throws unauthenticated if no auth", async () => {
    jest.resetModules();
    const { getStripeAccountMetrics } =
      await import("../callable/getStripeAccountMetrics");
    await expect(
      (getStripeAccountMetrics as any)(makeRequest(null, false)),
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("throws permission-denied without superAdmin claim", async () => {
    jest.resetModules();
    const { getStripeAccountMetrics } =
      await import("../callable/getStripeAccountMetrics");
    await expect(
      (getStripeAccountMetrics as any)(makeRequest(userId, false)),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("throws invalid-argument for a malformed startDate", async () => {
    jest.resetModules();
    const { getStripeAccountMetrics } =
      await import("../callable/getStripeAccountMetrics");
    await expect(
      (getStripeAccountMetrics as any)(
        makeRequest(userId, true, { startDate: "not-a-date" }),
      ),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("throws invalid-argument when startDate is after endDate", async () => {
    jest.resetModules();
    const { getStripeAccountMetrics } =
      await import("../callable/getStripeAccountMetrics");
    await expect(
      (getStripeAccountMetrics as any)(
        makeRequest(userId, true, {
          startDate: "2026-06-01",
          endDate: "2026-01-01",
        }),
      ),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("defaults to a 30-day window when no dates are given", async () => {
    jest.resetModules();
    const { getStripeAccountMetrics } =
      await import("../callable/getStripeAccountMetrics");
    const result = await (getStripeAccountMetrics as any)(
      makeRequest(userId, true, {}),
    );

    const range = result.data.summary.dateRange;
    const spanDays =
      (new Date(range.end).getTime() - new Date(range.start).getTime()) /
      (24 * 60 * 60 * 1000);
    expect(spanDays).toBeCloseTo(30, 0);
  });

  it("computes charge success/failure counts and total revenue from successful charges only", async () => {
    jest.resetModules();
    const { getStripeAccountMetrics } =
      await import("../callable/getStripeAccountMetrics");
    const result = await (getStripeAccountMetrics as any)(
      makeRequest(userId, true, {}),
    );

    expect(result.data.charges).toMatchObject({
      total: 2,
      successful: 1,
      failed: 1,
      totalAmount: 1200,
    });
    expect(result.data.summary.totalRevenue).toBe(1200);
    expect(result.data.summary.successRate).toBe(50);
  });

  it("splits subscriptions into active/trialing/canceled buckets", async () => {
    jest.resetModules();
    const { getStripeAccountMetrics } =
      await import("../callable/getStripeAccountMetrics");
    const result = await (getStripeAccountMetrics as any)(
      makeRequest(userId, true, {}),
    );

    expect(result.data.subscriptions).toMatchObject({
      total: 3,
      active: 1,
      trialing: 1,
      canceled: 1,
    });
  });

  it("scopes every Stripe list call to the given accountId", async () => {
    jest.resetModules();
    const { getStripeAccountMetrics } =
      await import("../callable/getStripeAccountMetrics");
    await (getStripeAccountMetrics as any)(
      makeRequest(userId, true, { accountId: "acct_XYZ789" }),
    );

    expect(mockChargesList).toHaveBeenCalledWith(
      expect.objectContaining({ stripeAccount: "acct_XYZ789" }),
    );
    expect(mockCustomersList).toHaveBeenCalledWith(
      expect.objectContaining({ stripeAccount: "acct_XYZ789" }),
    );
  });
});
