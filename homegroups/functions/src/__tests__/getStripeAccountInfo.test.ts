export {};

jest.mock("firebase-functions/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock("firebase-functions/v2/https", () => ({
  onCall: (optsOrHandler: any, maybeHandler?: (req: any) => Promise<any>) =>
    typeof maybeHandler === "function" ? maybeHandler : optsOrHandler,
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

jest.mock("../utils/stripe", () => ({
  stripe: {
    accounts: { retrieve: mockAccountsRetrieve },
    balance: { retrieve: mockBalanceRetrieve },
    charges: { list: mockChargesList },
    customers: { list: mockCustomersList },
    subscriptions: { list: mockSubscriptionsList },
  },
}));

function makeRequest(
  uid: string | null,
  superAdmin: boolean,
  data: Record<string, any> = {},
): any {
  return { auth: uid ? { uid, token: { superAdmin } } : null, data };
}

describe("getStripeAccountInfo", () => {
  const userId = "admin-uid";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("throws unauthenticated if no auth", async () => {
    jest.resetModules();
    const { getStripeAccountInfo } =
      await import("../callable/getStripeAccountInfo");
    await expect(
      (getStripeAccountInfo as any)(makeRequest(null, false)),
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("throws permission-denied without superAdmin claim", async () => {
    jest.resetModules();
    const { getStripeAccountInfo } =
      await import("../callable/getStripeAccountInfo");
    await expect(
      (getStripeAccountInfo as any)(makeRequest(userId, false)),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("aggregates account, balance, and recentActivity on success", async () => {
    mockAccountsRetrieve.mockResolvedValue({
      id: "acct_platform",
      capabilities: {},
      requirements: {},
    });
    mockBalanceRetrieve.mockResolvedValue({
      available: [],
      pending: [],
      instant_available: [],
    });
    mockChargesList.mockResolvedValue({ data: [] });
    mockCustomersList.mockResolvedValue({ data: [] });
    mockSubscriptionsList.mockResolvedValue({ data: [] });
    jest.resetModules();
    const { getStripeAccountInfo } =
      await import("../callable/getStripeAccountInfo");
    const result = await (getStripeAccountInfo as any)(
      makeRequest(userId, true, {}),
    );
    expect(result.success).toBe(true);
    expect(result.account.id).toBe("acct_platform");
    expect(result.recentActivity).toEqual({
      charges: [],
      customers: [],
      subscriptions: [],
    });
  });
});
