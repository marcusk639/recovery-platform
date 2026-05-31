/**
 * Tests for scheduledSubscriptionReconciler Cloud Function
 *
 * Run with:
 *   cd functions && npx jest src/tests/scheduledSubscriptionReconciler.test.ts --no-coverage
 */

const mockStripeSubscriptionsRetrieve = jest.fn();
const mockUpdate = jest.fn();

const mockDb: any = {
  collection: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  get: jest.fn(),
};

jest.mock("firebase-admin", () => ({
  apps: [{ name: "[DEFAULT]" }],
  initializeApp: jest.fn(),
  firestore: Object.assign(
    jest.fn(() => mockDb),
    {
      Timestamp: {
        now: jest.fn(() => ({ toMillis: () => Date.now() })),
        fromMillis: jest.fn((ms: number) => ({ _ms: ms })),
      },
      FieldValue: {
        serverTimestamp: jest.fn(() => "SERVER_TS"),
        delete: jest.fn(() => "FIELD_DELETE_SENTINEL"),
      },
    },
  ),
}));

jest.mock("firebase-functions/v1", () => ({
  pubsub: {
    schedule: jest.fn(() => ({
      timeZone: jest.fn(() => ({
        onRun: (handler: any) => handler,
      })),
    })),
  },
}));

jest.mock("firebase-functions", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock("../utils/stripe", () => ({
  stripe: {
    subscriptions: {
      retrieve: mockStripeSubscriptionsRetrieve,
    },
  },
}));

import { reconcileSubscriptions } from "../triggers/pubsub/scheduledSubscriptionReconciler";

describe("reconcileSubscriptions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does nothing when no groups have expired subscriptions", async () => {
    mockDb.get.mockResolvedValueOnce({ docs: [] });

    await reconcileSubscriptions();

    expect(mockStripeSubscriptionsRetrieve).not.toHaveBeenCalled();
  });

  it("marks group as canceled when stripeSubscriptionId is null", async () => {
    const groupRef = { update: mockUpdate };
    mockDb.get.mockResolvedValueOnce({
      docs: [
        {
          id: "group-1",
          ref: groupRef,
          data: () => ({
            subscriptionStatus: "trialing",
            stripeSubscriptionId: null,
          }),
        },
      ],
    });

    await reconcileSubscriptions();

    expect(mockStripeSubscriptionsRetrieve).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionStatus: "canceled" }),
    );
  });

  it("syncs group status when Stripe returns a different status", async () => {
    const groupRef = { update: mockUpdate };
    mockDb.get.mockResolvedValueOnce({
      docs: [
        {
          id: "group-2",
          ref: groupRef,
          data: () => ({
            subscriptionStatus: "trialing",
            stripeSubscriptionId: "sub_abc123",
          }),
        },
      ],
    });

    mockStripeSubscriptionsRetrieve.mockResolvedValueOnce({
      status: "canceled",
      current_period_end: 1700000000,
    });

    await reconcileSubscriptions();

    expect(mockStripeSubscriptionsRetrieve).toHaveBeenCalledWith("sub_abc123");
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionStatus: "canceled" }),
    );
  });

  it("does not update when Stripe status matches Firestore status", async () => {
    const groupRef = { update: mockUpdate };
    mockDb.get.mockResolvedValueOnce({
      docs: [
        {
          id: "group-3",
          ref: groupRef,
          data: () => ({
            subscriptionStatus: "active",
            stripeSubscriptionId: "sub_xyz789",
          }),
        },
      ],
    });

    mockStripeSubscriptionsRetrieve.mockResolvedValueOnce({
      status: "active",
      current_period_end: 1800000000,
    });

    await reconcileSubscriptions();

    expect(mockStripeSubscriptionsRetrieve).toHaveBeenCalledWith("sub_xyz789");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("uses FieldValue.delete when Stripe subscription has no current_period_end", async () => {
    const groupRef = { update: mockUpdate };
    mockDb.get.mockResolvedValueOnce({
      docs: [
        {
          id: "group-5",
          ref: groupRef,
          data: () => ({
            subscriptionStatus: "trialing",
            stripeSubscriptionId: "sub_no_period",
          }),
        },
      ],
    });

    mockStripeSubscriptionsRetrieve.mockResolvedValueOnce({
      status: "canceled",
      // deliberately omit current_period_end
    });

    await reconcileSubscriptions();

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionStatus: "canceled",
        subscriptionExpiresAt: "FIELD_DELETE_SENTINEL",
      }),
    );
  });

  it("logs a warning and continues when Stripe API call fails for one group", async () => {
    const groupRef = { update: mockUpdate };
    mockDb.get.mockResolvedValueOnce({
      docs: [
        {
          id: "group-4",
          ref: groupRef,
          data: () => ({
            subscriptionStatus: "trialing",
            stripeSubscriptionId: "sub_fail",
          }),
        },
      ],
    });

    mockStripeSubscriptionsRetrieve.mockRejectedValueOnce(
      new Error("No such subscription"),
    );

    await expect(reconcileSubscriptions()).resolves.not.toThrow();
  });
});
