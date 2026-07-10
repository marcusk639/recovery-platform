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

describe("getStripeAccountDetails", () => {
  const userId = "admin-uid";

  beforeEach(() => {
    jest.clearAllMocks();
    mockAccountsRetrieve.mockResolvedValue({
      id: "acct_platform",
      type: "standard",
      country: "US",
      default_currency: "usd",
      email: "ops@homegroups-app.com",
      business_type: "company",
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
      created: 1700000000,
      capabilities: {},
      requirements: {},
    });
    mockBalanceRetrieve.mockResolvedValue({ available: [], pending: [] });
  });

  it("throws unauthenticated if no auth", async () => {
    jest.resetModules();
    const { getStripeAccountDetails } =
      await import("../callable/getStripeAccountDetails");
    await expect(
      (getStripeAccountDetails as any)(makeRequest(null, false)),
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("throws permission-denied if caller is not a super admin", async () => {
    jest.resetModules();
    const { getStripeAccountDetails } =
      await import("../callable/getStripeAccountDetails");
    await expect(
      (getStripeAccountDetails as any)(makeRequest(userId, false)),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("throws invalid-argument for a malformed accountId", async () => {
    jest.resetModules();
    const { getStripeAccountDetails } =
      await import("../callable/getStripeAccountDetails");
    await expect(
      (getStripeAccountDetails as any)(
        makeRequest(userId, true, { accountId: "not-a-stripe-id" }),
      ),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("returns only the platform account by default (includeBalance defaults true, rest false)", async () => {
    jest.resetModules();
    const { getStripeAccountDetails } =
      await import("../callable/getStripeAccountDetails");
    const result = await (getStripeAccountDetails as any)(
      makeRequest(userId, true, {}),
    );

    expect(mockAccountsRetrieve).toHaveBeenCalledWith();
    expect(mockBalanceRetrieve).toHaveBeenCalledTimes(1);
    expect(mockChargesList).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.data.account.id).toBe("acct_platform");
  });

  it("projects only safe account fields (no raw Stripe object leakage)", async () => {
    mockAccountsRetrieve.mockResolvedValue({
      id: "acct_platform",
      type: "standard",
      country: "US",
      default_currency: "usd",
      email: "ops@homegroups-app.com",
      business_type: "company",
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
      created: 1700000000,
      capabilities: {},
      requirements: {},
      individual: { ssn_last_4_provided: true, id_number_provided: true },
      tos_acceptance: { ip: "1.2.3.4" },
    });
    jest.resetModules();
    const { getStripeAccountDetails } =
      await import("../callable/getStripeAccountDetails");
    const result = await (getStripeAccountDetails as any)(
      makeRequest(userId, true, {}),
    );

    expect(result.data.account.individual).toBeUndefined();
    expect(result.data.account.tos_acceptance).toBeUndefined();
  });

  it("fetches charges when includeCharges is true, scoped to accountId via stripeAccount", async () => {
    mockChargesList.mockResolvedValue({ data: [] });
    jest.resetModules();
    const { getStripeAccountDetails } =
      await import("../callable/getStripeAccountDetails");
    await (getStripeAccountDetails as any)(
      makeRequest(userId, true, {
        accountId: "acct_ABC123",
        includeCharges: true,
      }),
    );

    expect(mockChargesList).toHaveBeenCalledWith(
      expect.objectContaining({ stripeAccount: "acct_ABC123" }),
    );
  });
});
