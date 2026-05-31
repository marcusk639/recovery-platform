/**
 * Unit tests for handleCheckoutSessionCompleted — tier-upgrade branch.
 *
 * The tier-upgrade branch (metadata.upgradeFrom === "tier_a", upgradeTo === "tier_b"):
 *   1. If payment_status !== "paid" → skip all writes
 *   2. Read intergroup doc to find existing subscription id
 *   3. Write new tier (tier_b) to Firestore BEFORE cancelling old subscription
 *      (ordering matters: a failed cancel must not leave the user without any plan)
 *   4. Clear pendingUpgradeSessionId via FieldValue.delete()
 *   5. Cancel old subscription only if it exists and differs from the new one
 */

// ============================================================
// Mocks — must be defined before any module imports
// ============================================================

// Track call ordering across mocks. Each push records a tag.
const callOrder: string[] = [];

const mockUpdate = jest.fn().mockImplementation(async () => {
  callOrder.push("firestore.update");
});
const mockGet = jest.fn();
const mockDoc = jest.fn();
const mockCollection = jest.fn();
const mockFirestoreFn = jest.fn();

const mockSubscriptionsRetrieve = jest.fn();
const mockSubscriptionsCancel = jest.fn().mockImplementation(async () => {
  callOrder.push("stripe.cancel");
  return { id: "sub_cancelled", status: "canceled" };
});

const mockFieldValueDelete = jest.fn(() => ({ __sentinel: "delete" }));
const mockServerTimestamp = jest.fn(() => "__SERVER_TIMESTAMP__");
const mockTimestampFromMillis = jest.fn((ms: number) => ({ ms }));

jest.mock("firebase-admin", () => ({
  firestore: Object.assign(
    (...args: unknown[]) => {
      mockFirestoreFn(...args);
      return { collection: mockCollection };
    },
    {
      FieldValue: {
        delete: mockFieldValueDelete,
        serverTimestamp: mockServerTimestamp,
      },
      Timestamp: {
        fromMillis: mockTimestampFromMillis,
      },
    },
  ),
  apps: ["mock-app"],
  initializeApp: jest.fn(),
}));

// logger mock comes from functions/jest.setup.ts (shared)

jest.mock("../utils/stripe", () => ({
  stripe: {
    subscriptions: {
      retrieve: mockSubscriptionsRetrieve,
      cancel: mockSubscriptionsCancel,
    },
  },
  NonRetriableError: class NonRetriableError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "NonRetriableError";
    }
  },
  TRIAL_PERIOD_DAYS: 14,
  productIdGroup: "prod_group_test",
  productIdIntergroupA: "prod_intergroup_a",
  productIdIntergroupB: "prod_intergroup_b",
}));

// `db` and `messaging` are imported from utils/firebase by stripeUtils.ts;
// the tier-upgrade branch never touches them, but the import must resolve.
jest.mock("../utils/firebase", () => ({
  db: { collection: jest.fn() },
  messaging: { sendEachForMulticast: jest.fn() },
}));

// ============================================================
// Imports (after mocks)
// ============================================================

import { handleCheckoutSessionCompleted } from "../utils/stripeUtils";

// ============================================================
// Helpers
// ============================================================

interface UpgradeSessionOptions {
  intergroupId?: string;
  subscriptionId?: string | null;
  customerId?: string | null;
  paymentStatus?: "paid" | "unpaid" | "no_payment_required";
  sessionId?: string;
}

function makeUpgradeSession(opts: UpgradeSessionOptions = {}): any {
  return {
    id: opts.sessionId ?? "cs_test_upgrade",
    subscription: opts.subscriptionId ?? "sub_new_tier_b",
    customer: opts.customerId ?? "cus_test",
    payment_status: opts.paymentStatus ?? "paid",
    metadata: {
      intergroupId: opts.intergroupId ?? "ig_test_123",
      upgradeFrom: "tier_a",
      upgradeTo: "tier_b",
    },
  };
}

function setupIntergroupDoc(
  existingSubscriptionId: string | null = "sub_old_tier_a",
) {
  const docSnap = {
    exists: true,
    data: () => ({
      stripeSubscriptionId: existingSubscriptionId,
    }),
  };
  mockGet.mockResolvedValue(docSnap);
  mockDoc.mockReturnValue({ get: mockGet, update: mockUpdate });
  mockCollection.mockReturnValue({ doc: mockDoc });
}

function setupNewSubscription(
  id = "sub_new_tier_b",
  priceId = "price_tier_b",
  itemId = "si_tier_b",
  periodEnd = 1_700_000_000,
) {
  mockSubscriptionsRetrieve.mockResolvedValue({
    id,
    items: {
      data: [
        { id: itemId, price: { id: priceId, product: "prod_intergroup_b" } },
      ],
    },
    current_period_end: periodEnd,
  });
}

// ============================================================
// Tests
// ============================================================

describe("handleCheckoutSessionCompleted — tier-upgrade branch (P2-12)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    callOrder.length = 0;
  });

  it("happy path: writes new tier to Firestore, cancels old subscription, clears pendingUpgradeSessionId", async () => {
    setupIntergroupDoc("sub_old_tier_a");
    setupNewSubscription(
      "sub_new_tier_b",
      "price_tier_b",
      "si_tier_b",
      1_700_000_000,
    );

    const session = makeUpgradeSession({ subscriptionId: "sub_new_tier_b" });

    await handleCheckoutSessionCompleted(session);

    // 1. New subscription retrieved
    expect(mockSubscriptionsRetrieve).toHaveBeenCalledWith("sub_new_tier_b", {
      expand: ["items"],
    });

    // 2. Firestore update called with tier_b fields
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const updatePayload = mockUpdate.mock.calls[0][0];
    expect(updatePayload).toMatchObject({
      tier: "tier_b",
      subscriptionStatus: "active",
      stripeSubscriptionId: "sub_new_tier_b",
      stripeCustomerId: "cus_test",
      stripePriceIdIntergroup: "price_tier_b",
      stripeSubscriptionItemId: "si_tier_b",
    });
    // pendingUpgradeSessionId is cleared via FieldValue.delete()
    expect(mockFieldValueDelete).toHaveBeenCalled();
    expect(updatePayload).toHaveProperty("pendingUpgradeSessionId");
    expect(updatePayload.pendingUpgradeSessionId).toEqual({
      __sentinel: "delete",
    });
    // updatedAt is a server timestamp
    expect(updatePayload.updatedAt).toBe("__SERVER_TIMESTAMP__");

    // 3. Old subscription cancelled
    expect(mockSubscriptionsCancel).toHaveBeenCalledTimes(1);
    expect(mockSubscriptionsCancel).toHaveBeenCalledWith("sub_old_tier_a");

    // 4. Ordering: Firestore update happens BEFORE Stripe cancel
    expect(callOrder).toEqual(["firestore.update", "stripe.cancel"]);
  });

  it("skips all writes when payment_status is not 'paid'", async () => {
    setupIntergroupDoc("sub_old_tier_a");
    setupNewSubscription();

    const session = makeUpgradeSession({ paymentStatus: "unpaid" });

    await handleCheckoutSessionCompleted(session);

    // No Firestore reads/writes, no Stripe calls
    expect(mockSubscriptionsRetrieve).not.toHaveBeenCalled();
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockSubscriptionsCancel).not.toHaveBeenCalled();
  });

  it("skips all writes when payment_status is 'no_payment_required'", async () => {
    setupIntergroupDoc("sub_old_tier_a");
    setupNewSubscription();

    const session = makeUpgradeSession({
      paymentStatus: "no_payment_required",
    });

    await handleCheckoutSessionCompleted(session);

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockSubscriptionsCancel).not.toHaveBeenCalled();
  });

  it("does NOT cancel old subscription when intergroup has no existing subscription id", async () => {
    setupIntergroupDoc(null);
    setupNewSubscription();

    const session = makeUpgradeSession();

    await handleCheckoutSessionCompleted(session);

    // Firestore was still updated for the new tier
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    // But no cancel was attempted because the old subscription id was null
    expect(mockSubscriptionsCancel).not.toHaveBeenCalled();
  });

  it("does NOT cancel when existing subscription id matches the new one (idempotent)", async () => {
    // The old subscription id on the doc is the same as the new one in the session;
    // cancelling it would destroy the very subscription we just activated.
    setupIntergroupDoc("sub_same_id");
    setupNewSubscription("sub_same_id");

    const session = makeUpgradeSession({ subscriptionId: "sub_same_id" });

    await handleCheckoutSessionCompleted(session);

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockSubscriptionsCancel).not.toHaveBeenCalled();
  });

  it("ordering: writes Firestore even if Stripe cancel fails afterwards", async () => {
    setupIntergroupDoc("sub_old_tier_a");
    setupNewSubscription();

    mockSubscriptionsCancel.mockImplementationOnce(async () => {
      callOrder.push("stripe.cancel");
      throw new Error("Stripe API down");
    });

    const session = makeUpgradeSession();

    // The handler swallows cancel errors via .catch() and should not throw
    await expect(
      handleCheckoutSessionCompleted(session),
    ).resolves.toBeUndefined();

    // Firestore update completed BEFORE the failing cancel attempt
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(callOrder[0]).toBe("firestore.update");
    expect(callOrder[1]).toBe("stripe.cancel");
  });
});
