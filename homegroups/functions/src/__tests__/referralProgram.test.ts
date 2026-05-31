/**
 * Tests for Referral Program Cloud Functions:
 *   - generateReferralCode
 *   - getReferralStats
 *   - applyReferralCode
 *   - Stripe webhook referral conversion (via handleCheckoutSessionCompleted)
 */

// ---- Mocks must be defined before imports ----

const mockSet = jest.fn().mockResolvedValue(undefined);
const mockUpdate = jest.fn().mockResolvedValue(undefined);
const mockGet = jest.fn();
const mockAdd = jest.fn().mockResolvedValue({ id: "new-doc-id" });
const mockDocRef = {
  set: mockSet,
  update: mockUpdate,
  get: mockGet,
  id: "mock-doc-id",
};
const mockSendEachForMulticast = jest.fn().mockResolvedValue({
  successCount: 1,
  failureCount: 0,
  responses: [{ success: true }],
});
const mockSubscriptionsRetrieve = jest.fn();
const mockSubscriptionsUpdate = jest.fn().mockResolvedValue({});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockCollection = jest.fn() as jest.MockedFunction<(name: string) => any>;

jest.mock("firebase-admin", () => {
  const serverTimestamp = () => ({ _methodName: "FieldValue.serverTimestamp" });
  const increment = (n: number) => ({ _methodName: "FieldValue.increment", n });
  return {
    apps: [],
    initializeApp: jest.fn(),
    firestore: Object.assign(
      jest.fn().mockReturnValue({ collection: mockCollection }),
      {
        Timestamp: {
          fromDate: (date: Date) => ({
            toDate: () => date,
            seconds: Math.floor(date.getTime() / 1000),
            nanoseconds: 0,
          }),
          fromMillis: (ms: number) => ({
            toDate: () => new Date(ms),
            seconds: Math.floor(ms / 1000),
            nanoseconds: 0,
          }),
          now: () => ({
            toDate: () => new Date(),
            seconds: Math.floor(Date.now() / 1000),
            nanoseconds: 0,
          }),
        },
        FieldValue: {
          serverTimestamp,
          increment,
        },
      },
    ),
    app: jest.fn().mockReturnValue({}),
    auth: jest.fn().mockReturnValue({}),
  };
});

jest.mock("firebase-admin/messaging", () => ({
  getMessaging: jest.fn().mockReturnValue({
    sendEachForMulticast: mockSendEachForMulticast,
  }),
}));

jest.mock("firebase-functions", () => ({
  https: {
    onCall: jest.fn().mockImplementation((handler: Function) => handler),
  },
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock("firebase-functions/v1/https", () => ({
  HttpsError: class HttpsError extends Error {
    code: string;
    details?: unknown;
    constructor(code: string, message: string, details?: unknown) {
      super(message);
      this.code = code;
      this.details = details;
      this.name = "HttpsError";
    }
  },
}));

// v2/https + logger mocks come from functions/jest.setup.ts (shared)

jest.mock("../utils/firebase", () => ({
  db: { collection: mockCollection },
  messaging: { sendEachForMulticast: mockSendEachForMulticast },
}));

// Mock stripe (used by stripeUtils)
jest.mock("../utils/stripe", () => ({
  stripe: {
    subscriptions: {
      retrieve: (...args: unknown[]) => mockSubscriptionsRetrieve(...args),
      update: (...args: unknown[]) => mockSubscriptionsUpdate(...args),
    },
    products: {
      retrieve: jest
        .fn()
        .mockResolvedValue({ id: "prod_test", default_price: "price_test" }),
    },
  },
  webhookSecret: "test_webhook_secret",
  connectWebhookSecret: "test_connect_secret",
  productIdGroup: "prod_test",
  priceIdMember: "price_member_test",
  isTestMode: true,
  TRIAL_PERIOD_DAYS: 7,
  PLATFORM_FEE_PERCENT: 0.05,
  NonRetriableError: class NonRetriableError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "NonRetriableError";
    }
  },
  getDefaultPriceForProduct: jest.fn().mockResolvedValue("price_test"),
  STRIPE_TEST_SECRET_KEY_ENV: "STRIPE_TEST_SECRET_KEY",
  STRIPE_TEST_WEBHOOK_SECRET_ENV: "STRIPE_TEST_WEBHOOK_SECRET",
  STRIPE_TEST_CONNECT_WEBHOOK_SECRET_ENV: "STRIPE_TEST_CONNECT_WEBHOOK_SECRET",
  STRIPE_TEST_PRICE_ID_MEMBER_ENV: "STRIPE_TEST_PRICE_ID_MEMBER",
  STRIPE_TEST_PRODUCT_ID_GROUP_ENV: "STRIPE_TEST_PRODUCT_ID_GROUP",
  STRIPE_SECRET_KEY_ENV: "STRIPE_SECRET_KEY",
  STRIPE_WEBHOOK_SECRET_ENV: "STRIPE_WEBHOOK_SECRET",
  STRIPE_CONNECT_WEBHOOK_SECRET_ENV: "STRIPE_CONNECT_WEBHOOK_SECRET",
  STRIPE_PRICE_ID_MEMBER_ENV: "STRIPE_PRICE_ID_MEMBER",
  STRIPE_PRODUCT_ID_GROUP_ENV: "STRIPE_PRODUCT_ID_GROUP",
}));

// ---- Helpers ----
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createDoc = (id: string, data: Record<string, any>) => ({
  id,
  exists: true,
  data: () => data,
  ref: {
    set: mockSet,
    update: mockUpdate,
    get: mockGet,
    id,
  },
});

const emptySnap = {
  empty: true,
  size: 0,
  docs: [],
};

// ---- Tests ----

describe("generateReferralCode", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates a new code document and returns code when user has no existing code", async () => {
    const uid = "admin-user-1";
    const groupId = "group-1";

    mockCollection.mockImplementation((name: string) => {
      if (name === "groups") {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue(
              createDoc(groupId, {
                admins: [uid],
                name: "Test Group",
                subscriptionStatus: "active",
              }),
            ),
          }),
        };
      }
      if (name === "users") {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue(
              createDoc(uid, {
                displayName: "John Doe",
                email: "john@test.com",
              }),
            ),
            update: mockUpdate,
          }),
        };
      }
      if (name === "referral_codes") {
        return {
          where: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                get: jest.fn().mockResolvedValue(emptySnap), // no existing code
              }),
            }),
          }),
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ exists: false }),
            set: mockSet,
          }),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue(emptySnap),
      };
    });

    jest.resetModules();
    const { generateReferralCode } =
      await import("../callable/generateReferralCode");

    const result = await (generateReferralCode as Function)({
      data: { groupId },
      auth: { uid },
    });

    // Should have returned a code
    expect(result).toHaveProperty("code");
    expect(typeof result.code).toBe("string");
    expect(result.code.length).toBeGreaterThan(0);

    // Should have written the code document
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        code: result.code,
        creatorId: uid,
        creatorGroupId: groupId,
        uses: 0,
        isActive: true,
      }),
    );
  });

  it("returns existing code when user already has an active referral code", async () => {
    const uid = "admin-user-2";
    const groupId = "group-2";
    const existingCode = "JANE2024";

    mockCollection.mockImplementation((name: string) => {
      if (name === "groups") {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue(
              createDoc(groupId, {
                admins: [uid],
                name: "Group 2",
                subscriptionStatus: "active",
              }),
            ),
          }),
        };
      }
      if (name === "users") {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest
              .fn()
              .mockResolvedValue(createDoc(uid, { displayName: "Jane Smith" })),
            update: mockUpdate,
          }),
        };
      }
      if (name === "referral_codes") {
        return {
          where: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                get: jest.fn().mockResolvedValue({
                  empty: false,
                  size: 1,
                  docs: [
                    createDoc(existingCode, {
                      code: existingCode,
                      creatorId: uid,
                      isActive: true,
                    }),
                  ],
                }),
              }),
            }),
          }),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue(emptySnap),
      };
    });

    jest.resetModules();
    const { generateReferralCode } =
      await import("../callable/generateReferralCode");

    const result = await (generateReferralCode as Function)({
      data: { groupId },
      auth: { uid },
    });

    expect(result.code).toBe(existingCode);
    // Should NOT have written a new code document
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("throws unauthenticated when no auth", async () => {
    jest.resetModules();
    const { generateReferralCode } =
      await import("../callable/generateReferralCode");

    await expect(
      (generateReferralCode as Function)({
        data: { groupId: "group-1" },
        auth: null,
      }),
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("throws permission-denied when user is not a group admin", async () => {
    const uid = "non-admin-user";
    const groupId = "group-x";

    mockCollection.mockImplementation((name: string) => {
      if (name === "groups") {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest
              .fn()
              .mockResolvedValue(
                createDoc(groupId, { admins: ["other-user"], name: "Group X" }),
              ),
          }),
        };
      }
      if (name === "users") {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest
              .fn()
              .mockResolvedValue(createDoc(uid, { displayName: "Non Admin" })),
          }),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue(emptySnap),
      };
    });

    jest.resetModules();
    const { generateReferralCode } =
      await import("../callable/generateReferralCode");

    await expect(
      (generateReferralCode as Function)({
        data: { groupId },
        auth: { uid },
      }),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });
});

describe("applyReferralCode", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates a pending referral document when a valid code is applied", async () => {
    const uid = "new-user-1";
    const groupId = "new-group-1";
    const code = "JOHN2024";
    const referrerId = "referrer-admin-1";
    const referrerGroupId = "referrer-group-1";

    const newDocRef = {
      id: "referral-doc-1",
      set: mockSet,
    };

    mockCollection.mockImplementation((name: string) => {
      if (name === "referral_codes") {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue(
              createDoc(code, {
                code,
                creatorId: referrerId,
                creatorGroupId: referrerGroupId,
                isActive: true,
                uses: 0,
              }),
            ),
            update: mockUpdate,
          }),
        };
      }
      if (name === "referrals") {
        return {
          where: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                get: jest.fn().mockResolvedValue(emptySnap), // no existing referral
              }),
            }),
          }),
          doc: jest.fn().mockReturnValue(newDocRef),
        };
      }
      if (name === "groups") {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest
              .fn()
              .mockResolvedValue(createDoc(groupId, { name: "New Group" })),
            update: mockUpdate,
          }),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue(emptySnap),
      };
    });

    jest.resetModules();
    const { applyReferralCode } = await import("../callable/applyReferralCode");

    const result = await (applyReferralCode as Function)({
      data: { code, groupId },
      auth: { uid },
    });

    expect(result).toMatchObject({ success: true });

    // Should have created a pending referral document
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        code,
        referrerId,
        referrerGroupId,
        referredUserId: uid,
        referredGroupId: groupId,
        status: "pending",
        rewardApplied: false,
      }),
    );
  });

  it("throws not-found when code does not exist", async () => {
    const uid = "user-1";

    mockCollection.mockImplementation((name: string) => {
      if (name === "referral_codes") {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest
              .fn()
              .mockResolvedValue({ exists: false, data: () => null }),
          }),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue(emptySnap),
      };
    });

    jest.resetModules();
    const { applyReferralCode } = await import("../callable/applyReferralCode");

    await expect(
      (applyReferralCode as Function)({
        data: { code: "INVALID", groupId: "group-1" },
        auth: { uid },
      }),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("throws failed-precondition when code is inactive", async () => {
    const uid = "user-2";

    mockCollection.mockImplementation((name: string) => {
      if (name === "referral_codes") {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue(
              createDoc("INACTIVE", {
                code: "INACTIVE",
                creatorId: "other-user",
                isActive: false,
              }),
            ),
          }),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue(emptySnap),
      };
    });

    jest.resetModules();
    const { applyReferralCode } = await import("../callable/applyReferralCode");

    await expect(
      (applyReferralCode as Function)({
        data: { code: "INACTIVE", groupId: "group-1" },
        auth: { uid },
      }),
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("throws already-exists when user already used this code", async () => {
    const uid = "user-3";
    const code = "USED2024";

    mockCollection.mockImplementation((name: string) => {
      if (name === "referral_codes") {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue(
              createDoc(code, {
                code,
                creatorId: "other-user",
                isActive: true,
              }),
            ),
          }),
        };
      }
      if (name === "referrals") {
        return {
          where: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                get: jest.fn().mockResolvedValue({
                  empty: false,
                  size: 1,
                  docs: [createDoc("ref-1", { code, referredUserId: uid })],
                }),
              }),
            }),
          }),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue(emptySnap),
      };
    });

    jest.resetModules();
    const { applyReferralCode } = await import("../callable/applyReferralCode");

    await expect(
      (applyReferralCode as Function)({
        data: { code, groupId: "group-2" },
        auth: { uid },
      }),
    ).rejects.toMatchObject({ code: "already-exists" });
  });
});

describe("Webhook referral conversion", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("marks referral as converted and applies reward when group has a referral code", async () => {
    const groupId = "referred-group-1";
    const referralCode = "JOHN2024";
    const referrerId = "referrer-admin-1";
    const referrerSubscriptionId = "sub_referrer_123";
    const currentPeriodEnd = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // 30 days from now

    const referralDocRef = {
      id: "referral-doc-1",
      update: mockUpdate,
    };

    mockSubscriptionsRetrieve
      // First call: retrieve referred group's subscription (for checkout handler)
      .mockResolvedValueOnce({
        id: "sub_checkout_123",
        status: "active",
        current_period_end: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
        items: {
          data: [
            { id: "si_1", price: { id: "price_test", product: "prod_test" } },
          ],
        },
      })
      // Second call: retrieve referrer's subscription (for extension)
      .mockResolvedValueOnce({
        id: referrerSubscriptionId,
        status: "active",
        current_period_end: currentPeriodEnd,
      });

    mockSubscriptionsUpdate.mockResolvedValue({ id: referrerSubscriptionId });

    mockCollection.mockImplementation((name: string) => {
      if (name === "groups") {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue(
              createDoc(groupId, {
                name: "Referred Group",
                referralCode,
                admins: ["other-admin"],
              }),
            ),
            update: mockUpdate,
          }),
          where: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                get: jest.fn().mockResolvedValue({
                  empty: false,
                  size: 1,
                  docs: [
                    createDoc("referrer-group-1", {
                      stripeSubscriptionId: referrerSubscriptionId,
                      admins: [referrerId],
                      subscriptionStatus: "active",
                    }),
                  ],
                }),
              }),
            }),
          }),
        };
      }
      if (name === "referrals") {
        return {
          where: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                limit: jest.fn().mockReturnValue({
                  get: jest.fn().mockResolvedValue({
                    empty: false,
                    size: 1,
                    docs: [
                      {
                        id: referralDocRef.id,
                        data: () => ({
                          code: referralCode,
                          referrerId,
                          referredGroupId: groupId,
                          status: "pending",
                        }),
                        ref: referralDocRef,
                      },
                    ],
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (name === "users") {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue(
              createDoc(referrerId, {
                fcmTokens: ["token-referrer"],
                notificationSettings: { allowPushNotifications: true },
              }),
            ),
          }),
          where: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              docs: [
                createDoc(referrerId, {
                  fcmTokens: ["token-referrer"],
                  notificationSettings: { allowPushNotifications: true },
                }),
              ],
            }),
          }),
        };
      }
      if (name === "processed_stripe_events") {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ exists: false }),
            set: mockSet,
          }),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue(emptySnap),
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ exists: false }),
          set: mockSet,
          update: mockUpdate,
        }),
      };
    });

    jest.resetModules();
    const { handleCheckoutSessionCompleted } =
      await import("../utils/stripeUtils");

    const mockSession = {
      id: "cs_test_123",
      metadata: { groupId },
      subscription: "sub_checkout_123",
      customer: "cus_test_123",
    } as any;

    await handleCheckoutSessionCompleted(mockSession);

    // Referral should be marked as converted
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "converted",
        rewardApplied: true,
      }),
    );

    // Subscription extension should have been called
    expect(mockSubscriptionsUpdate).toHaveBeenCalledWith(
      referrerSubscriptionId,
      expect.objectContaining({
        trial_end: expect.any(Number),
        proration_behavior: "none",
      }),
    );
  });

  it("completes normally without referral processing when group has no referral code", async () => {
    const groupId = "no-referral-group-1";

    mockSubscriptionsRetrieve.mockResolvedValue({
      id: "sub_no_ref_123",
      status: "active",
      current_period_end: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
      items: {
        data: [
          { id: "si_1", price: { id: "price_test", product: "prod_test" } },
        ],
      },
    });

    mockCollection.mockImplementation((name: string) => {
      if (name === "groups") {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue(
              createDoc(groupId, {
                name: "Normal Group",
                admins: ["admin-user"],
                // No referralCode field
              }),
            ),
            update: mockUpdate,
          }),
        };
      }
      if (name === "processed_stripe_events") {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ exists: false }),
            set: mockSet,
          }),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue(emptySnap),
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ exists: false }),
          set: mockSet,
          update: mockUpdate,
        }),
      };
    });

    jest.resetModules();
    const { handleCheckoutSessionCompleted } =
      await import("../utils/stripeUtils");

    const mockSession = {
      id: "cs_no_ref_456",
      metadata: { groupId },
      subscription: "sub_no_ref_123",
      customer: "cus_no_ref_123",
    } as any;

    // Should not throw
    await expect(
      handleCheckoutSessionCompleted(mockSession),
    ).resolves.toBeUndefined();

    // No referral update should have been called for referral conversion specifically
    // (mockUpdate is still called for the group itself, but NOT with {status: 'converted'})
    const conversionCalls = mockUpdate.mock.calls.filter(
      (call) => call[0] && call[0].status === "converted",
    );
    expect(conversionCalls).toHaveLength(0);
  });
});
