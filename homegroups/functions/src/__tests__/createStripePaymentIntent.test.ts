export {};

jest.mock("firebase-admin", () => ({
  apps: ["mock-app"],
  initializeApp: jest.fn(),
  firestore: Object.assign(jest.fn(), {
    FieldValue: { serverTimestamp: () => "__SERVER_TIMESTAMP__" },
  }),
}));

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

const mockCustomersCreate = jest.fn();
const mockPaymentIntentsCreate = jest.fn();

jest.mock("../utils/stripe", () => ({
  stripe: {
    customers: { create: mockCustomersCreate },
    paymentIntents: { create: mockPaymentIntentsCreate },
  },
  PLATFORM_FEE_PERCENT: 0.05,
}));

let docStore: Record<string, Record<string, any> | null> = {};
const mockUserUpdate = jest.fn().mockResolvedValue(undefined);
const mockDonationSet = jest.fn().mockResolvedValue(undefined);

function buildDocRef(collection: string, id: string): any {
  const key = `${collection}/${id}`;
  return {
    id,
    get: jest.fn().mockImplementation(async () => {
      const data = docStore[key];
      if (data == null) return { exists: false, data: () => null };
      return { exists: true, data: () => data };
    }),
    update: mockUserUpdate,
    collection: (_sub: string) => ({
      doc: () => ({ id: "donation-auto-id", set: mockDonationSet }),
    }),
  };
}

const mockDb = {
  collection: jest.fn().mockImplementation((name: string) => ({
    doc: (id: string) => buildDocRef(name, id),
  })),
};

jest.mock("../utils/firebase", () => ({ db: mockDb }));

function setDoc(
  collection: string,
  id: string,
  data: Record<string, any> | null,
) {
  docStore[`${collection}/${id}`] = data;
}

function makeRequest(
  uid: string | null,
  email: string | null,
  data: Record<string, any> = {},
): any {
  return { auth: uid ? { uid, token: { email } } : null, data };
}

describe("createStripePaymentIntent", () => {
  const groupId = "group-donate-1";
  const userId = "donor-1";
  const userEmail = "donor@example.com";

  beforeEach(() => {
    jest.clearAllMocks();
    docStore = {};
    setDoc("groups", groupId, { name: "Donation Group" });
    setDoc("users", userId, { displayName: "Donor One" });
    mockCustomersCreate.mockResolvedValue({ id: "cus_new_donor" });
    mockPaymentIntentsCreate.mockResolvedValue({
      id: "pi_test_1",
      client_secret: "pi_test_1_secret",
    });
  });

  it("throws unauthenticated if no auth", async () => {
    jest.resetModules();
    const { createStripePaymentIntent } =
      await import("../callable/createStripePaymentIntent");
    await expect(
      (createStripePaymentIntent as any)(
        makeRequest(null, null, { groupId, amount: 500 }),
      ),
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("throws invalid-argument when amount is below the $0.50 minimum", async () => {
    jest.resetModules();
    const { createStripePaymentIntent } =
      await import("../callable/createStripePaymentIntent");
    await expect(
      (createStripePaymentIntent as any)(
        makeRequest(userId, userEmail, { groupId, amount: 10 }),
      ),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("throws invalid-argument when amount exceeds the $1,000 maximum", async () => {
    jest.resetModules();
    const { createStripePaymentIntent } =
      await import("../callable/createStripePaymentIntent");
    await expect(
      (createStripePaymentIntent as any)(
        makeRequest(userId, userEmail, { groupId, amount: 200_000 }),
      ),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("throws not-found if the group does not exist", async () => {
    setDoc("groups", groupId, null);
    jest.resetModules();
    const { createStripePaymentIntent } =
      await import("../callable/createStripePaymentIntent");
    await expect(
      (createStripePaymentIntent as any)(
        makeRequest(userId, userEmail, { groupId, amount: 500 }),
      ),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("creates a Stripe customer for a first-time donor and persists stripeCustomerId", async () => {
    jest.resetModules();
    const { createStripePaymentIntent } =
      await import("../callable/createStripePaymentIntent");
    await (createStripePaymentIntent as any)(
      makeRequest(userId, userEmail, { groupId, amount: 500 }),
    );

    expect(mockCustomersCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        email: userEmail,
        metadata: { firebaseUID: userId },
      }),
    );
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ stripeCustomerId: "cus_new_donor" }),
    );
  });

  it("reuses an existing stripeCustomerId without calling customers.create", async () => {
    setDoc("users", userId, {
      displayName: "Donor One",
      stripeCustomerId: "cus_existing",
    });
    jest.resetModules();
    const { createStripePaymentIntent } =
      await import("../callable/createStripePaymentIntent");
    await (createStripePaymentIntent as any)(
      makeRequest(userId, userEmail, { groupId, amount: 500 }),
    );

    expect(mockCustomersCreate).not.toHaveBeenCalled();
    const piArgs = mockPaymentIntentsCreate.mock.calls[0][0];
    expect(piArgs.customer).toBe("cus_existing");
  });

  it("routes funds via transfer_data and computes application_fee_amount when group has a Connect account", async () => {
    setDoc("groups", groupId, {
      name: "Donation Group",
      stripeConnectAccountId: "acct_connected_1",
    });
    jest.resetModules();
    const { createStripePaymentIntent } =
      await import("../callable/createStripePaymentIntent");
    await (createStripePaymentIntent as any)(
      makeRequest(userId, userEmail, { groupId, amount: 1000 }),
    );

    const piArgs = mockPaymentIntentsCreate.mock.calls[0][0];
    expect(piArgs.transfer_data).toEqual({ destination: "acct_connected_1" });
    expect(piArgs.application_fee_amount).toBe(50); // 5% of 1000
  });

  it("omits transfer_data when the group has no Connect account", async () => {
    jest.resetModules();
    const { createStripePaymentIntent } =
      await import("../callable/createStripePaymentIntent");
    await (createStripePaymentIntent as any)(
      makeRequest(userId, userEmail, { groupId, amount: 1000 }),
    );

    const piArgs = mockPaymentIntentsCreate.mock.calls[0][0];
    expect(piArgs.transfer_data).toBeUndefined();
  });

  it("passes the pre-generated donation doc ID as the Stripe idempotency key", async () => {
    jest.resetModules();
    const { createStripePaymentIntent } =
      await import("../callable/createStripePaymentIntent");
    await (createStripePaymentIntent as any)(
      makeRequest(userId, userEmail, { groupId, amount: 500 }),
    );

    const [, opts] = mockPaymentIntentsCreate.mock.calls[0];
    expect(opts).toEqual({ idempotencyKey: "donation-auto-id" });
  });

  it("writes a pending donation doc and returns clientSecret + donationId", async () => {
    jest.resetModules();
    const { createStripePaymentIntent } =
      await import("../callable/createStripePaymentIntent");
    const result = await (createStripePaymentIntent as any)(
      makeRequest(userId, userEmail, { groupId, amount: 500 }),
    );

    expect(mockDonationSet).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        amount: 500,
        status: "pending",
        transactionId: "pi_test_1",
      }),
    );
    expect(result).toEqual({
      clientSecret: "pi_test_1_secret",
      donationId: "donation-auto-id",
    });
  });
});
