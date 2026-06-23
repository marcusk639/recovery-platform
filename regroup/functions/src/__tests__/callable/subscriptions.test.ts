// src/__tests__/callable/subscriptions.test.ts

// Full manual mock — do NOT use jest.requireActual for firebase-functions/v2/https
// because that module pulls in native crypto bindings (buffer-equal-constant-time)
// that crash in Node test environments.
class HttpsError extends Error {
  code: string;
  details?: unknown;
  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = "HttpsError";
  }
}

jest.mock("firebase-functions/v2/https", () => ({
  onCall: (_optsOrHandler: any, handler?: Function) =>
    typeof _optsOrHandler === "function" ? _optsOrHandler : handler,
  HttpsError,
}));

jest.mock("firebase-functions", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock("firebase-functions/params", () => ({
  defineSecret: jest.fn((name: string) => ({ name })),
}));

jest.mock("stripe", () => {
  return jest.fn().mockImplementation(() => ({}));
});

jest.mock("lodash/isNil", () => jest.fn((v: any) => v == null));

const mockInitializeCustomer = jest.fn();
const mockInitializeTierCustomer = jest.fn();
const mockUpdateSubscriptionItem = jest.fn();
const mockGetSubscriptionItem = jest.fn();
const mockRetrievePaymentMethod = jest.fn();
const mockUpdatePaymentMethod = jest.fn();
const mockCancelSubscription = jest.fn();
const mockReactivateSubscription = jest.fn();
const mockMapSubscriptionToMetadata = jest.fn();
const mockUncancelSubscription = jest.fn();
const mockUpdateSubscriptionMetadata = jest.fn();

const mockStripeSubscriptionsUpdate = jest.fn().mockResolvedValue({});
const mockApplyBundleDiscountToSubscription = jest
  .fn()
  .mockResolvedValue(undefined);

jest.mock("../../api/stripe", () => ({
  initializeCustomer: mockInitializeCustomer,
  initializeTierCustomer: mockInitializeTierCustomer,
  updateSubscriptionItem: mockUpdateSubscriptionItem,
  getSubscriptionItem: mockGetSubscriptionItem,
  updateSubscriptionMetadata: mockUpdateSubscriptionMetadata,
  retrievePaymentMethod: mockRetrievePaymentMethod,
  updatePaymentMethod: mockUpdatePaymentMethod,
  cancelSubscription: mockCancelSubscription,
  reactivateSubscription: mockReactivateSubscription,
  mapSubscriptionToMetadata: mockMapSubscriptionToMetadata,
  uncancelSubscription: mockUncancelSubscription,
  applyBundleDiscountToSubscription: (...args: any[]) =>
    mockApplyBundleDiscountToSubscription(...args),
  stripe: {
    subscriptions: {
      update: (...args: any[]) => mockStripeSubscriptionsUpdate(...args),
    },
  },
}));

const mockGetUser = jest.fn();
const mockUpdateUser = jest.fn();
const mockGetHousesByAttributes = jest.fn();
const mockUpsertSubscriptionDoc = jest.fn();

jest.mock("../../api/firestore", () => ({
  getUser: mockGetUser,
  updateUser: mockUpdateUser,
  getHousesByAttributes: mockGetHousesByAttributes,
  upsertSubscriptionDoc: mockUpsertSubscriptionDoc,
  app: {},
}));

jest.mock("../../util/email", () => ({
  sendEmail: jest.fn(),
  regroupEmail: "admin@regroup-app.com",
}));

jest.mock("../../util/invite", () => ({
  notifyAdminsIfTheyExist: jest.fn(),
}));

jest.mock("firebase-admin", () => ({
  firestore: Object.assign(
    jest.fn(() => ({})),
    {
      FieldValue: {
        arrayUnion: jest.fn((v: any) => v),
        arrayRemove: jest.fn((v: any) => v),
      },
    },
  ),
}));

import {
  createOperatorSubscription,
  reactivateOperatorSubscription,
  cancelUserSubscription,
  updateSubscriptionGuests,
  updateSubscriptionHouses,
  applyBundleDiscount,
  sendInviteEmails,
  sendConfirmationEmail,
} from "../../callable/subscriptions";

const fakeAuth = { uid: "user-1" };
const call = (fn: unknown, data: unknown, auth: object = fakeAuth) =>
  (fn as Function)({ data, auth });

const fakeUser = {
  id: "user-1",
  email: "user@test.com",
  subscriptionMetadata: {
    customerId: "cus_fake",
    subscriptionId: "sub_fake",
    items: { houseItemId: "si_house", guestItemId: "si_guest" },
    houses: { "house-1": { numberOfGuests: 2 } },
    status: "active",
  },
};

const fakeUserWith2Houses = {
  ...fakeUser,
  subscriptionMetadata: {
    ...fakeUser.subscriptionMetadata,
    subscriptionId: "sub_fake",
    houses: {
      "house-1": { numberOfGuests: 2 },
      "house-2": { numberOfGuests: 1 },
    },
  },
};
const fakeUserWith3Houses = {
  ...fakeUser,
  subscriptionMetadata: {
    ...fakeUser.subscriptionMetadata,
    subscriptionId: "sub_fake",
    houses: {
      "house-1": { numberOfGuests: 2 },
      "house-2": { numberOfGuests: 1 },
      "house-3": { numberOfGuests: 0 },
    },
  },
};
const fakeUserWith5Houses = {
  ...fakeUser,
  subscriptionMetadata: {
    ...fakeUser.subscriptionMetadata,
    subscriptionId: "sub_fake",
    houses: {
      "house-1": { numberOfGuests: 2 },
      "house-2": { numberOfGuests: 1 },
      "house-3": { numberOfGuests: 0 },
      "house-4": { numberOfGuests: 3 },
      "house-5": { numberOfGuests: 1 },
    },
  },
};

beforeEach(() => jest.clearAllMocks());

describe("createOperatorSubscription", () => {
  beforeEach(() => {
    process.env.STRIPE_PRICE_TRAD_PROFESSIONAL = "price_test_pro_existing";
  });
  afterEach(() => {
    delete process.env.STRIPE_PRICE_TRAD_PROFESSIONAL;
  });

  it("initializes customer with email and payment method", async () => {
    const fakeMeta = {
      customerId: "cus_new",
      subscriptionId: "sub_new",
      houses: {},
      items: { houseItemId: "", guestItemId: "" },
      currentPeriodEnd: Date.now() + 1000000,
    };
    mockGetUser.mockResolvedValue(fakeUser);
    mockInitializeCustomer.mockResolvedValue(fakeMeta);
    mockUpdateUser.mockResolvedValue(undefined);

    await call(createOperatorSubscription, {
      user: fakeUser,
      paymentMethod: "pm_test",
      houseType: "traditional",
      tier: "professional",
    });

    expect(mockInitializeCustomer).toHaveBeenCalledWith(
      fakeUser.email,
      "pm_test",
      false,
      fakeUser.id,
    );
  });

  it("reads oxfordEnabled from Firestore, not from request payload", async () => {
    // Security: billing tier must be server-authoritative (Firestore), not client-supplied.
    const oxfordFirestoreUser = {
      ...fakeUser,
      subscriptionMetadata: {
        ...fakeUser.subscriptionMetadata,
        oxfordEnabled: true,
      },
    };
    const fakeMeta = {
      customerId: "cus_oxford",
      subscriptionId: "sub_oxford",
      houses: {},
      items: { houseItemId: "", guestItemId: "" },
      currentPeriodEnd: Date.now() + 1000000,
      oxfordEnabled: true,
    };
    mockGetUser.mockResolvedValue(oxfordFirestoreUser);
    mockInitializeCustomer.mockResolvedValue(fakeMeta);
    mockUpdateUser.mockResolvedValue(undefined);

    // Request payload does NOT include oxfordEnabled — Firestore is the source of truth.
    await call(createOperatorSubscription, {
      user: fakeUser,
      paymentMethod: "pm_oxford",
      houseType: "traditional",
      tier: "professional",
    });

    expect(mockInitializeCustomer).toHaveBeenCalledWith(
      fakeUser.email,
      "pm_oxford",
      true,
      fakeUser.id,
    );
  });

  it("updates user subscription metadata using the status Stripe returns (B9)", async () => {
    // B9: status must come from Stripe, not be hardcoded to 'active'.
    // Stripe often returns 'trialing' for new subscriptions.
    const fakeMeta = {
      customerId: "cus_new",
      subscriptionId: "sub_new",
      houses: {},
      items: { houseItemId: "", guestItemId: "" },
      currentPeriodEnd: Date.now() + 1000000,
      status: "trialing",
    };
    mockGetUser.mockResolvedValue(fakeUser);
    mockInitializeCustomer.mockResolvedValue(fakeMeta);
    mockUpdateUser.mockResolvedValue(undefined);

    await call(createOperatorSubscription, {
      user: fakeUser,
      paymentMethod: "pm_test",
      houseType: "traditional",
      tier: "professional",
    });

    expect(mockUpdateUser).toHaveBeenCalledWith(
      fakeUser.id,
      expect.objectContaining({
        subscriptionMetadata: expect.objectContaining({
          status: "trialing", // from Stripe, not hardcoded 'active'
          lastUpdatedAt: expect.any(String),
        }),
      }),
    );
  });

  it("returns user with updated subscription metadata", async () => {
    const fakeMeta = {
      customerId: "cus_new",
      subscriptionId: "sub_new",
      houses: {},
      items: { houseItemId: "", guestItemId: "" },
      currentPeriodEnd: Date.now() + 1000000,
    };
    mockGetUser.mockResolvedValue(fakeUser);
    mockInitializeCustomer.mockResolvedValue(fakeMeta);
    mockUpdateUser.mockResolvedValue(undefined);

    const result = await call(createOperatorSubscription, {
      user: fakeUser,
      paymentMethod: "pm_test",
      houseType: "traditional",
      tier: "professional",
    });

    expect(result).toMatchObject({
      id: fakeUser.id,
      subscriptionMetadata: fakeMeta,
    });
  });

  it("seeds a subscriptions collection doc so webhook handlers can find the sub", async () => {
    // The subscriptions collection is read by 5 webhook paths but otherwise
    // written by nothing; seeding it here is what makes subscription.updated /
    // .deleted / invoice.* handlers resolve the sub instead of early-returning.
    const periodEnd = Date.now() + 1000000;
    const fakeMeta = {
      customerId: "cus_new",
      subscriptionId: "sub_new",
      houses: {},
      items: { houseItemId: "", guestItemId: "" },
      currentPeriodEnd: periodEnd,
      status: "active",
    };
    mockGetUser.mockResolvedValue(fakeUser);
    mockInitializeCustomer.mockResolvedValue(fakeMeta);
    mockUpdateUser.mockResolvedValue(undefined);

    await call(createOperatorSubscription, {
      user: fakeUser,
      paymentMethod: "pm_test",
      houseType: "traditional",
      tier: "professional",
    });

    expect(mockUpsertSubscriptionDoc).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeSubscriptionId: "sub_new",
        stripeCustomerId: "cus_new",
        status: "active",
        planId: "price_test_pro_existing",
        userId: fakeUser.id,
        currentPeriodEnd: new Date(periodEnd).toISOString(),
        guestCount: 0,
      }),
    );
  });
});

describe("cancelUserSubscription", () => {
  it("calls cancelSubscription with the subscriptionId from data", async () => {
    mockGetUser.mockResolvedValue(fakeUser);
    mockCancelSubscription.mockResolvedValue({ cancel_at_period_end: true });
    mockUpdateUser.mockResolvedValue(undefined);

    await call(cancelUserSubscription, {
      user: fakeUser,
      subscriptionId: "sub_fake",
    });

    expect(mockCancelSubscription).toHaveBeenCalledWith("sub_fake");
  });

  it("updates user with cancelling status after cancellation", async () => {
    mockGetUser.mockResolvedValue(fakeUser);
    mockCancelSubscription.mockResolvedValue({ cancel_at_period_end: true });
    mockUpdateUser.mockResolvedValue(undefined);

    await call(cancelUserSubscription, {
      user: fakeUser,
      subscriptionId: "sub_fake",
    });

    expect(mockUpdateUser).toHaveBeenCalledWith(
      fakeUser.id,
      expect.objectContaining({
        subscriptionMetadata: expect.objectContaining({ status: "cancelling" }),
      }),
    );
  });

  it("returns user with cancelling status", async () => {
    mockGetUser.mockResolvedValue(fakeUser);
    mockCancelSubscription.mockResolvedValue({ cancel_at_period_end: true });
    mockUpdateUser.mockResolvedValue(undefined);

    const result = await call(cancelUserSubscription, {
      user: fakeUser,
      subscriptionId: "sub_fake",
    });

    expect(result).toMatchObject({
      id: fakeUser.id,
      subscriptionMetadata: expect.objectContaining({ status: "cancelling" }),
    });
  });

  it("rejects cancellation of a subscription the caller does not own", async () => {
    mockGetUser.mockResolvedValue(fakeUser);

    await expect(
      call(cancelUserSubscription, {
        user: fakeUser,
        subscriptionId: "sub_other",
      }),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });
});

describe("updateSubscriptionGuests", () => {
  it("retrieves the user by ownerUserId", async () => {
    mockGetUser.mockResolvedValue(fakeUser);
    mockGetSubscriptionItem.mockResolvedValue({ quantity: 2 });
    mockUpdateSubscriptionItem.mockResolvedValue({});
    mockUpdateSubscriptionMetadata.mockReturnValue(
      fakeUser.subscriptionMetadata,
    );
    mockUpdateUser.mockResolvedValue(undefined);

    await call(updateSubscriptionGuests, {
      ownerUserId: "user-1",
      houseIds: ["house-1"],
      action: "add",
    });

    expect(mockGetUser).toHaveBeenCalledWith("user-1");
  });

  it("updates subscription item quantity when adding a guest", async () => {
    mockGetUser.mockResolvedValue(fakeUser);
    mockGetSubscriptionItem.mockResolvedValue({ quantity: 2 });
    mockUpdateSubscriptionItem.mockResolvedValue({});
    mockUpdateSubscriptionMetadata.mockReturnValue(
      fakeUser.subscriptionMetadata,
    );
    mockUpdateUser.mockResolvedValue(undefined);

    await call(updateSubscriptionGuests, {
      ownerUserId: "user-1",
      houseIds: ["house-1"],
      action: "add",
    });

    expect(mockUpdateSubscriptionItem).toHaveBeenCalledWith(
      "si_guest",
      "guest",
      3,
    );
  });

  it("decrements subscription item quantity when removing a guest", async () => {
    mockGetUser.mockResolvedValue(fakeUser);
    mockGetSubscriptionItem.mockResolvedValue({ quantity: 2 });
    mockUpdateSubscriptionItem.mockResolvedValue({});
    mockUpdateSubscriptionMetadata.mockReturnValue(
      fakeUser.subscriptionMetadata,
    );
    mockUpdateUser.mockResolvedValue(undefined);

    await call(updateSubscriptionGuests, {
      ownerUserId: "user-1",
      houseIds: ["house-1"],
      action: "remove",
    });

    expect(mockUpdateSubscriptionItem).toHaveBeenCalledWith(
      "si_guest",
      "guest",
      1,
    );
  });

  it("skips subscription update when user has no subscriptionMetadata", async () => {
    const userWithoutMeta = { ...fakeUser, subscriptionMetadata: undefined };
    mockGetUser.mockResolvedValue(userWithoutMeta);

    await call(updateSubscriptionGuests, {
      ownerUserId: "user-1",
      houseIds: ["house-1"],
      action: "add",
    });

    expect(mockUpdateSubscriptionItem).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Input validation tests
// ──────────────────────────────────────────────────────────────────────────────

const callFn = (fn: unknown, data: unknown, auth: object = fakeAuth) =>
  (fn as Function)({ data, auth });

describe("createOperatorSubscription — input validation", () => {
  it("throws invalid-argument when user.email is not an email", async () => {
    await expect(
      callFn(createOperatorSubscription, {
        user: {
          email: "not-an-email",
          subscriptionMetadata: { status: "active" },
        },
        paymentMethod: "pm_123",
      }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("throws invalid-argument when paymentMethod is missing", async () => {
    await expect(
      callFn(createOperatorSubscription, {
        user: {
          email: "test@test.com",
          subscriptionMetadata: { status: "active" },
        },
      }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });
});

describe("reactivateOperatorSubscription", () => {
  it("uses Firestore oxfordEnabled for Oxford reactivation billing", async () => {
    const oxfordFirestoreUser = {
      ...fakeUser,
      subscriptionMetadata: {
        ...fakeUser.subscriptionMetadata,
        status: "cancelled",
        oxfordEnabled: true,
      },
    };
    const freshMeta = {
      subscriptionId: "sub_reactivated",
      customerId: "cus_fake",
      items: { houseItemId: "si_new_house", guestItemId: "si_new_guest" },
      oxfordEnabled: true,
      status: "active",
    };
    mockGetUser.mockResolvedValue(oxfordFirestoreUser);
    mockReactivateSubscription.mockResolvedValue(freshMeta);
    mockUpdateUser.mockResolvedValue(undefined);

    const result = await call(reactivateOperatorSubscription, {
      user: fakeUser,
    });

    expect(mockReactivateSubscription).toHaveBeenCalledWith(
      oxfordFirestoreUser.subscriptionMetadata.customerId,
      expect.objectContaining({ oxfordEnabled: true }),
      fakeUser.id,
    );
    expect(result.subscriptionMetadata).toMatchObject({
      subscriptionId: "sub_reactivated",
      items: { houseItemId: "si_new_house", guestItemId: "si_new_guest" },
      status: "active",
    });
  });
});

describe("reactivateOperatorSubscription — input validation", () => {
  it("throws invalid-argument when user.id is missing", async () => {
    await expect(
      callFn(reactivateOperatorSubscription, {
        user: {
          subscriptionMetadata: {
            status: "active",
            subscriptionId: "sub_1",
            customerId: "cus_1",
          },
        },
      }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("throws invalid-argument when subscriptionId is missing from metadata", async () => {
    await expect(
      callFn(reactivateOperatorSubscription, {
        user: {
          id: "u1",
          subscriptionMetadata: { status: "active", customerId: "cus_1" },
        },
      }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("throws invalid-argument when customerId is missing from metadata", async () => {
    await expect(
      callFn(reactivateOperatorSubscription, {
        user: {
          id: "u1",
          subscriptionMetadata: { status: "active", subscriptionId: "sub_1" },
        },
      }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });
});

describe("cancelUserSubscription — input validation", () => {
  it("throws invalid-argument when subscriptionId is missing", async () => {
    await expect(
      callFn(cancelUserSubscription, {
        user: { subscriptionMetadata: { status: "active" } },
      }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });
});

describe("updateSubscriptionGuests — input validation", () => {
  it("throws invalid-argument when action is not add or remove", async () => {
    await expect(
      callFn(updateSubscriptionGuests, {
        ownerUserId: "u1",
        houseIds: ["h1"],
        action: "invalid",
      }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("throws invalid-argument when ownerUserId is missing", async () => {
    await expect(
      callFn(updateSubscriptionGuests, {
        houseIds: ["h1"],
        action: "add",
      }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });
});

describe("updateSubscriptionHouses — input validation", () => {
  it("throws invalid-argument when action is invalid", async () => {
    await expect(
      callFn(updateSubscriptionHouses, {
        ownerUserId: "u1",
        action: "delete",
        houseIds: ["h1"],
      }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });
});

describe("sendInviteEmails — input validation", () => {
  // sendInviteEmails requires the caller to be a house operator (admin claim)
  // before input is processed.
  const operatorAuth = { uid: "user-1", token: { admin: { "house-1": true } } };

  it("throws invalid-argument when payload is not an array", async () => {
    await expect(
      callFn(sendInviteEmails, { email: "not-an-array" }, operatorAuth),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("throws invalid-argument when email.to is not a valid email", async () => {
    await expect(
      callFn(
        sendInviteEmails,
        [
          {
            email: { to: "bad-email", from: "a", subject: "s", text: "t" },
            dynamicLink: "https://example.com",
            type: "guest",
          },
        ],
        operatorAuth,
      ),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("throws permission-denied when caller is not a house operator", async () => {
    await expect(
      callFn(sendInviteEmails, [
        {
          email: { to: "a@b.com", from: "a", subject: "s", text: "t" },
          dynamicLink: "https://regroup-app.com/x",
          type: "guest",
        },
      ]),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });
});

describe("sendConfirmationEmail — input validation", () => {
  it("throws invalid-argument when email is not a valid email", async () => {
    await expect(
      callFn(sendConfirmationEmail, {
        email: "not-an-email",
        dynamicLink: "https://example.com",
        name: "Alice",
      }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("throws invalid-argument when dynamicLink is missing", async () => {
    await expect(
      callFn(sendConfirmationEmail, {
        email: "test@test.com",
        name: "Alice",
      }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });
});

describe("applyBundleDiscount callable", () => {
  it("calls applyBundleDiscountToSubscription with correct houseCount for 3 houses", async () => {
    mockGetUser.mockResolvedValue(fakeUserWith3Houses);
    await call(applyBundleDiscount, { userId: "user-1" });
    expect(mockApplyBundleDiscountToSubscription).toHaveBeenCalledWith(
      "sub_fake",
      3,
    );
  });

  it("calls applyBundleDiscountToSubscription with correct houseCount for 5 houses", async () => {
    mockGetUser.mockResolvedValue(fakeUserWith5Houses);
    await call(applyBundleDiscount, { userId: "user-1" });
    expect(mockApplyBundleDiscountToSubscription).toHaveBeenCalledWith(
      "sub_fake",
      5,
    );
  });

  it("calls applyBundleDiscountToSubscription with correct houseCount for 2 houses (no discount)", async () => {
    mockGetUser.mockResolvedValue(fakeUserWith2Houses);
    await call(applyBundleDiscount, { userId: "user-1" });
    expect(mockApplyBundleDiscountToSubscription).toHaveBeenCalledWith(
      "sub_fake",
      2,
    );
  });

  it("skips Stripe call when user has no subscriptionId", async () => {
    const userWithoutSubId = {
      ...fakeUser,
      subscriptionMetadata: {
        ...fakeUser.subscriptionMetadata,
        subscriptionId: undefined,
      },
    };
    mockGetUser.mockResolvedValue(userWithoutSubId);
    await call(applyBundleDiscount, { userId: "user-1" });
    expect(mockApplyBundleDiscountToSubscription).not.toHaveBeenCalled();
  });

  it("does not apply a bundle coupon to a tier subscription", async () => {
    const tierUser = {
      ...fakeUser,
      subscriptionMetadata: {
        subscriptionId: "sub_tier",
        tier: "professional",
        houseType: "traditional",
        houses: { "house-1": { numberOfGuests: 0 } },
      },
    };
    mockGetUser.mockResolvedValue(tierUser);
    await call(applyBundleDiscount, { userId: "user-1" });
    expect(mockApplyBundleDiscountToSubscription).not.toHaveBeenCalled();
  });

  it("throws unauthenticated when no auth", async () => {
    await expect(
      call(applyBundleDiscount, { userId: "user-1" }, null as any),
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("throws invalid-argument when userId is missing", async () => {
    await expect(call(applyBundleDiscount, {})).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });
});

describe("createSubscription — tier routing", () => {
  const fakeMetaBase = {
    customerId: "cus_tier",
    subscriptionId: "sub_tier",
    houses: {},
    items: { houseItemId: "", guestItemId: "" },
    currentPeriodEnd: Date.now() + 1000000,
  };

  beforeEach(() => {
    process.env.STRIPE_PRICE_TRAD_PROFESSIONAL = "price_test_pro_123";
    mockGetUser.mockResolvedValue(fakeUser);
    mockInitializeCustomer.mockResolvedValue(fakeMetaBase);
    mockUpdateUser.mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete process.env.STRIPE_PRICE_TRAD_PROFESSIONAL;
    delete process.env.STRIPE_PRICE_TRAD_STARTER;
  });

  it("resolves priceId and persists tier metadata for a valid traditional/professional tier", async () => {
    await call(createOperatorSubscription, {
      user: fakeUser,
      paymentMethod: "pm_test",
      houseType: "traditional",
      tier: "professional",
    });

    expect(mockUpdateUser).toHaveBeenCalledWith(
      fakeUser.id,
      expect.objectContaining({
        subscriptionMetadata: expect.objectContaining({
          houseType: "traditional",
          tier: "professional",
          maxResidents: 20,
          maxProperties: 3,
        }),
      }),
    );
  });

  it("throws invalid-argument for an unrecognized tier string", async () => {
    await expect(
      call(createOperatorSubscription, {
        user: fakeUser,
        paymentMethod: "pm_test",
        houseType: "traditional",
        tier: "nonexistent",
      }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("throws internal when the env var for the tier is not set", async () => {
    delete process.env.STRIPE_PRICE_TRAD_STARTER;

    await expect(
      call(createOperatorSubscription, {
        user: fakeUser,
        paymentMethod: "pm_test",
        houseType: "traditional",
        tier: "starter",
      }),
    ).rejects.toMatchObject({ code: "internal" });
  });

  it("throws invalid-argument when houseType is not traditional or oxford", async () => {
    await expect(
      call(createOperatorSubscription, {
        user: fakeUser,
        paymentMethod: "pm_test",
        houseType: "unknown",
        tier: "starter",
      }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("throws invalid-argument when tier is missing", async () => {
    await expect(
      call(createOperatorSubscription, {
        user: fakeUser,
        paymentMethod: "pm_test",
        houseType: "traditional",
      }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });
});

describe("updateSubscriptionHouses — bundle discount integration", () => {
  it("calls applyBundleDiscountToSubscription after adding a house", async () => {
    mockGetUser.mockResolvedValue(fakeUserWith2Houses);
    mockGetHousesByAttributes.mockResolvedValue({});
    mockGetSubscriptionItem.mockResolvedValue({ quantity: 2 });
    mockUpdateSubscriptionItem.mockResolvedValue({});
    mockUpdateSubscriptionMetadata.mockReturnValue(
      fakeUserWith2Houses.subscriptionMetadata,
    );
    mockUpdateUser.mockResolvedValue(undefined);

    await call(updateSubscriptionHouses, {
      ownerUserId: "user-1",
      action: "add",
      houseIds: ["house-3"],
    });
    expect(mockApplyBundleDiscountToSubscription).toHaveBeenCalledWith(
      "sub_fake",
      expect.any(Number),
    );
  });

  it("does not throw if applyBundleDiscountToSubscription fails (non-fatal)", async () => {
    mockGetUser.mockResolvedValue(fakeUserWith3Houses);
    mockGetHousesByAttributes.mockResolvedValue({
      "house-3": { currentCapacity: 0 },
    });
    mockGetSubscriptionItem.mockResolvedValue({ quantity: 3 });
    mockUpdateSubscriptionItem.mockResolvedValue({});
    mockUpdateSubscriptionMetadata.mockReturnValue(
      fakeUserWith3Houses.subscriptionMetadata,
    );
    mockUpdateUser.mockResolvedValue(undefined);
    mockApplyBundleDiscountToSubscription.mockRejectedValueOnce(
      new Error("Stripe error"),
    );

    await expect(
      call(updateSubscriptionHouses, {
        ownerUserId: "user-1",
        action: "remove",
        houseIds: ["house-3"],
      }),
    ).resolves.not.toThrow();
  });
});

describe("tier subscriptions skip Stripe quantity updates", () => {
  const tierUserAtResidentCap = {
    ...fakeUser,
    subscriptionMetadata: {
      customerId: "cus_tier",
      subscriptionId: "sub_tier",
      subscriptionItemId: "si_tier",
      status: "trialing",
      houseType: "traditional",
      tier: "starter",
      maxResidents: 10,
      maxProperties: 1,
      houses: { "house-1": { numberOfGuests: 10 } },
    },
  };
  const tierUserUnderCap = {
    ...fakeUser,
    subscriptionMetadata: {
      ...tierUserAtResidentCap.subscriptionMetadata,
      maxResidents: 10,
      maxProperties: 3,
      houses: { "house-1": { numberOfGuests: 2 } },
    },
  };

  it("enforces the resident cap and does not call Stripe for a tier sub (guests add)", async () => {
    mockGetUser.mockResolvedValue(tierUserAtResidentCap);
    await expect(
      call(updateSubscriptionGuests, {
        ownerUserId: "user-1",
        houseIds: ["house-1"],
        action: "add",
      }),
    ).rejects.toMatchObject({ code: "failed-precondition" });
    expect(mockUpdateSubscriptionItem).not.toHaveBeenCalled();
  });

  it("persists occupancy without Stripe when adding a resident under cap", async () => {
    mockGetUser.mockResolvedValue(tierUserUnderCap);
    mockUpdateUser.mockResolvedValue(undefined);
    await call(updateSubscriptionGuests, {
      ownerUserId: "user-1",
      houseIds: ["house-1"],
      action: "add",
    });
    expect(mockUpdateSubscriptionItem).not.toHaveBeenCalled();
    expect(mockUpdateUser).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        subscriptionMetadata: expect.objectContaining({
          tier: "starter",
          houses: { "house-1": { numberOfGuests: 3 } },
        }),
      }),
    );
  });

  it("rejects adding a resident to a house not on the subscription (no implicit house creation)", async () => {
    mockGetUser.mockResolvedValue(tierUserUnderCap);
    mockUpdateUser.mockResolvedValue(undefined);
    await expect(
      call(updateSubscriptionGuests, {
        ownerUserId: "user-1",
        houseIds: ["house-unknown"],
        action: "add",
      }),
    ).rejects.toMatchObject({ code: "failed-precondition" });
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("enforces the property cap across a multi-house add (no batch bypass)", async () => {
    // maxProperties 3, 1 existing house; adding 3 more would total 4 > cap.
    mockGetUser.mockResolvedValue(tierUserUnderCap);
    mockUpdateUser.mockResolvedValue(undefined);
    await expect(
      call(updateSubscriptionHouses, {
        ownerUserId: "user-1",
        action: "add",
        houseIds: ["house-2", "house-3", "house-4"],
      }),
    ).rejects.toMatchObject({ code: "failed-precondition" });
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("enforces the property cap and does not call Stripe for a tier sub (houses add)", async () => {
    const atPropertyCap = {
      ...fakeUser,
      subscriptionMetadata: {
        ...tierUserUnderCap.subscriptionMetadata,
        maxProperties: 1,
        houses: { "house-1": { numberOfGuests: 0 } },
      },
    };
    mockGetUser.mockResolvedValue(atPropertyCap);
    await expect(
      call(updateSubscriptionHouses, {
        ownerUserId: "user-1",
        action: "add",
        houseIds: ["house-2"],
      }),
    ).rejects.toMatchObject({ code: "failed-precondition" });
    expect(mockUpdateSubscriptionItem).not.toHaveBeenCalled();
    expect(mockApplyBundleDiscountToSubscription).not.toHaveBeenCalled();
  });

  it("persists a new house without Stripe or bundle discount when under property cap", async () => {
    mockGetUser.mockResolvedValue(tierUserUnderCap);
    mockUpdateUser.mockResolvedValue(undefined);
    await call(updateSubscriptionHouses, {
      ownerUserId: "user-1",
      action: "add",
      houseIds: ["house-2"],
    });
    expect(mockUpdateSubscriptionItem).not.toHaveBeenCalled();
    expect(mockApplyBundleDiscountToSubscription).not.toHaveBeenCalled();
    expect(mockUpdateUser).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        subscriptionMetadata: expect.objectContaining({
          houses: expect.objectContaining({
            "house-2": { numberOfGuests: 0 },
          }),
        }),
      }),
    );
  });
});

describe("createOperatorSubscription — tier-billing flag branch", () => {
  afterEach(() => {
    delete process.env.TIER_BILLING_ENABLED;
    delete process.env.STRIPE_PRICE_TRAD_STARTER;
  });

  it("uses initializeTierCustomer (not legacy) when the flag is on", async () => {
    process.env.TIER_BILLING_ENABLED = "true";
    process.env.STRIPE_PRICE_TRAD_STARTER = "price_starter";
    mockGetUser.mockResolvedValue(fakeUser);
    mockInitializeTierCustomer.mockResolvedValue({
      customerId: "cus_tier",
      subscriptionId: "sub_tier",
      subscriptionItemId: "si_tier",
      status: "trialing",
      houseType: "traditional",
      tier: "starter",
    });
    mockUpdateUser.mockResolvedValue(undefined);

    await call(createOperatorSubscription, {
      user: fakeUser,
      paymentMethod: "pm_test",
      houseType: "traditional",
      tier: "starter",
    });

    expect(mockInitializeTierCustomer).toHaveBeenCalledWith(
      fakeUser.email,
      "pm_test",
      "traditional",
      "starter",
      fakeUser.id,
      "month",
    );
    expect(mockInitializeCustomer).not.toHaveBeenCalled();
    // Tier caps from SUBSCRIPTION_TIERS.traditional.starter are persisted.
    expect(mockUpdateUser).toHaveBeenCalledWith(
      fakeUser.id,
      expect.objectContaining({
        subscriptionMetadata: expect.objectContaining({
          subscriptionItemId: "si_tier",
          status: "trialing",
          maxResidents: 10,
          maxProperties: 1,
        }),
      }),
    );
  });

  it("forwards an annual billingInterval to initializeTierCustomer", async () => {
    process.env.TIER_BILLING_ENABLED = "true";
    process.env.STRIPE_PRICE_TRAD_STARTER = "price_starter";
    mockGetUser.mockResolvedValue(fakeUser);
    mockInitializeTierCustomer.mockResolvedValue({
      customerId: "cus_tier",
      subscriptionId: "sub_tier",
      subscriptionItemId: "si_tier",
      status: "trialing",
      houseType: "traditional",
      tier: "starter",
    });
    mockUpdateUser.mockResolvedValue(undefined);

    await call(createOperatorSubscription, {
      user: fakeUser,
      paymentMethod: "pm_test",
      houseType: "traditional",
      tier: "starter",
      billingInterval: "year",
    });

    expect(mockInitializeTierCustomer).toHaveBeenCalledWith(
      fakeUser.email,
      "pm_test",
      "traditional",
      "starter",
      fakeUser.id,
      "year",
    );
  });

  it("rejects an invalid billingInterval with invalid-argument", async () => {
    process.env.TIER_BILLING_ENABLED = "true";
    process.env.STRIPE_PRICE_TRAD_STARTER = "price_starter";
    mockGetUser.mockResolvedValue(fakeUser);

    await expect(
      call(createOperatorSubscription, {
        user: fakeUser,
        paymentMethod: "pm_test",
        houseType: "traditional",
        tier: "starter",
        billingInterval: "weekly",
      }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
    expect(mockInitializeTierCustomer).not.toHaveBeenCalled();
  });

  it("uses the legacy initializeCustomer when the flag is off", async () => {
    process.env.TIER_BILLING_ENABLED = "false";
    process.env.STRIPE_PRICE_TRAD_PROFESSIONAL = "price_pro";
    mockGetUser.mockResolvedValue(fakeUser);
    mockInitializeCustomer.mockResolvedValue({
      customerId: "cus_legacy",
      subscriptionId: "sub_legacy",
      houses: {},
      items: { houseItemId: "si_house", guestItemId: "si_guest" },
      currentPeriodEnd: Date.now() + 1000000,
      status: "trialing",
    });
    mockUpdateUser.mockResolvedValue(undefined);

    await call(createOperatorSubscription, {
      user: fakeUser,
      paymentMethod: "pm_test",
      houseType: "traditional",
      tier: "professional",
    });

    expect(mockInitializeCustomer).toHaveBeenCalled();
    expect(mockInitializeTierCustomer).not.toHaveBeenCalled();
    delete process.env.STRIPE_PRICE_TRAD_PROFESSIONAL;
  });
});
