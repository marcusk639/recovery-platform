export {};

jest.mock("firebase-admin", () => ({
  apps: ["mock-app"],
  initializeApp: jest.fn(),
  firestore: Object.assign(jest.fn(), {
    FieldValue: {
      serverTimestamp: () => "__SERVER_TIMESTAMP__",
      delete: () => "__FIELD_DELETE__",
    },
    Timestamp: { fromMillis: (ms: number) => ({ toMillis: () => ms }) },
  }),
}));

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

const mockCustomersRetrieve = jest.fn();
const mockCustomersCreate = jest.fn();
const mockCustomersUpdate = jest.fn();
const mockSubscriptionsRetrieve = jest.fn();
const mockSubscriptionsUpdate = jest.fn();
const mockSubscriptionsCreate = jest.fn();
const mockPaymentMethodsAttach = jest.fn();
const mockGetDefaultPriceForProduct = jest
  .fn()
  .mockResolvedValue("price_group_annual");

jest.mock("../utils/stripe", () => ({
  stripe: {
    customers: {
      retrieve: mockCustomersRetrieve,
      create: mockCustomersCreate,
      update: mockCustomersUpdate,
    },
    subscriptions: {
      retrieve: mockSubscriptionsRetrieve,
      update: mockSubscriptionsUpdate,
      create: mockSubscriptionsCreate,
    },
    paymentMethods: { attach: mockPaymentMethodsAttach },
  },
  productIdGroup: "prod_group",
  getDefaultPriceForProduct: mockGetDefaultPriceForProduct,
}));

let docStore: Record<string, Record<string, any> | null> = {};
const mockDocUpdate = jest.fn().mockResolvedValue(undefined);

function buildDocRef(collection: string, id: string): any {
  const key = `${collection}/${id}`;
  return {
    id,
    get: jest.fn().mockImplementation(async () => {
      const data = docStore[key];
      if (data == null) return { exists: false, data: () => null };
      return { exists: true, data: () => data };
    }),
    update: mockDocUpdate,
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

function makeRequest(uid: string | null, data: Record<string, any> = {}): any {
  return { auth: uid ? { uid } : null, data };
}

describe("reactivateGroupSubscription", () => {
  const groupId = "group-reactivate-1";
  const userId = "admin-1";

  beforeEach(() => {
    jest.clearAllMocks();
    docStore = {};
    mockGetDefaultPriceForProduct.mockResolvedValue("price_group_annual");
  });

  it("throws unauthenticated if no auth", async () => {
    jest.resetModules();
    const { reactivateGroupSubscription } =
      await import("../callable/reactivateGroupSubscription");
    await expect(
      (reactivateGroupSubscription as any)(makeRequest(null, { groupId })),
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("throws invalid-argument if groupId is missing", async () => {
    jest.resetModules();
    const { reactivateGroupSubscription } =
      await import("../callable/reactivateGroupSubscription");
    await expect(
      (reactivateGroupSubscription as any)(makeRequest(userId, {})),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("throws not-found if group does not exist", async () => {
    setDoc("groups", groupId, null);
    jest.resetModules();
    const { reactivateGroupSubscription } =
      await import("../callable/reactivateGroupSubscription");
    await expect(
      (reactivateGroupSubscription as any)(makeRequest(userId, { groupId })),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("throws permission-denied if caller is not an admin", async () => {
    setDoc("groups", groupId, { admins: ["someone-else"] });
    jest.resetModules();
    const { reactivateGroupSubscription } =
      await import("../callable/reactivateGroupSubscription");
    await expect(
      (reactivateGroupSubscription as any)(makeRequest(userId, { groupId })),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("resumes a subscription that is cancel_at_period_end instead of creating a new one", async () => {
    setDoc("groups", groupId, {
      admins: [userId],
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      subscriptionStatus: "active",
    });
    mockCustomersRetrieve.mockResolvedValue({
      id: "cus_1",
      deleted: false,
      invoice_settings: { default_payment_method: "pm_1" },
    });
    mockSubscriptionsRetrieve.mockResolvedValue({
      id: "sub_1",
      status: "active",
      cancel_at_period_end: true,
    });
    mockSubscriptionsUpdate.mockResolvedValue({
      id: "sub_1",
      status: "active",
    });
    jest.resetModules();
    const { reactivateGroupSubscription } =
      await import("../callable/reactivateGroupSubscription");
    const result = await (reactivateGroupSubscription as any)(
      makeRequest(userId, { groupId }),
    );

    expect(mockSubscriptionsUpdate).toHaveBeenCalledWith("sub_1", {
      cancel_at_period_end: false,
    });
    expect(mockSubscriptionsCreate).not.toHaveBeenCalled();
    expect(result).toMatchObject({ success: true, action: "resumed" });
  });

  it("throws failed-precondition when no customer and no paymentMethodId are available", async () => {
    setDoc("groups", groupId, { admins: [userId] });
    jest.resetModules();
    const { reactivateGroupSubscription } =
      await import("../callable/reactivateGroupSubscription");
    await expect(
      (reactivateGroupSubscription as any)(makeRequest(userId, { groupId })),
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("creates a brand-new subscription when the old one is fully canceled, using the day-stamped idempotency key", async () => {
    setDoc("groups", groupId, {
      admins: [userId],
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_old",
      subscriptionStatus: "canceled",
    });
    mockCustomersRetrieve.mockResolvedValue({
      id: "cus_1",
      deleted: false,
      invoice_settings: { default_payment_method: "pm_1" },
    });
    mockSubscriptionsCreate.mockResolvedValue({
      id: "sub_new",
      status: "active",
      items: { data: [{ id: "si_1" }] },
      current_period_end: 1750000000,
    });
    jest.resetModules();
    const { reactivateGroupSubscription } =
      await import("../callable/reactivateGroupSubscription");
    const result = await (reactivateGroupSubscription as any)(
      makeRequest(userId, { groupId }),
    );

    expect(mockSubscriptionsRetrieve).not.toHaveBeenCalled();
    const [, opts] = mockSubscriptionsCreate.mock.calls[0];
    expect(opts.idempotencyKey).toContain(
      `reactivate-${groupId}-${userId}-subscription-`,
    );
    expect(result).toMatchObject({
      success: true,
      action: "created",
      subscriptionId: "sub_new",
    });
  });
});
