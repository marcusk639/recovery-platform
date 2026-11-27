// src/__tests__/api/reactivate.test.ts
//
// Mocks the `stripe` npm package directly (same convention as
// createTierSubscription.test.ts) since api/stripe.ts wraps `new Stripe(...)`.

const mockSubscriptionsCreate = jest.fn();

jest.mock("stripe", () =>
  jest.fn().mockImplementation(() => ({
    subscriptions: {
      create: (...args: unknown[]) => mockSubscriptionsCreate(...args),
    },
  })),
);

import { failedBeforeSubscription, reactivateSubscription } from "../../api/stripe";
import OperatorSubscription from "../../entities/OperatorSubscription";

describe("reactivateSubscription", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = "sk_test";
    process.env.STRIPE_API_VERSION = "2026-01-28.clover";
    process.env.STRIPE_HOUSE_PRICE_ID = "price_house";
    process.env.STRIPE_GUEST_PRICE_ID = "price_guest";
  });

  it("recreates a single-item subscription for a tier subscription", async () => {
    process.env.STRIPE_PRICE_OXFORD_STANDARD = "price_oxford_std";
    mockSubscriptionsCreate.mockResolvedValue({
      id: "sub_2",
      status: "trialing",
      trial_end: 1893456000,
      billing_cycle_anchor: 1893456000,
      items: { data: [{ id: "si_2", plan: { id: "price_oxford_std" } }] },
    });
    const meta = Object.assign(new OperatorSubscription(), {
      tier: "standard",
      houseType: "oxford",
      customerId: "cus_2",
      houses: {},
    });

    const fresh = await reactivateSubscription("cus_2", meta, "uid_2");

    expect(mockSubscriptionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_2",
        items: [{ price: "price_oxford_std", quantity: 1 }],
      }),
      // reactivateSubscription creates unconditionally, so it is keyed.
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    );
    expect(fresh.subscriptionItemId).toBe("si_2");
    expect(fresh.tier).toBe("standard");
    expect(fresh.houseType).toBe("oxford");
  });

  it("records the status Stripe gave the replacement", async () => {
    process.env.STRIPE_PRICE_OXFORD_STANDARD = "price_oxford_std";
    mockSubscriptionsCreate.mockResolvedValue({
      id: "sub_3",
      status: "incomplete",
      trial_end: null,
      billing_cycle_anchor: 1893456000,
      items: { data: [{ id: "si_3", plan: { id: "price_oxford_std" } }] },
    });
    const meta = Object.assign(new OperatorSubscription(), {
      tier: "standard",
      houseType: "oxford",
      customerId: "cus_3",
      houses: {},
    });

    const fresh = await reactivateSubscription("cus_3", meta, "uid_3");

    expect(fresh.status).toBe("incomplete");
  });

  // The callable frees the checkout lock only for errors marked as happening
  // before any subscription could exist; nothing else proves there is none.
  describe("which errors it marks as before any subscription", () => {
    const tierMeta = () =>
      Object.assign(new OperatorSubscription(), {
        tier: "standard",
        houseType: "oxford",
        customerId: "cus_4",
        houses: {},
      });

    it("marks a tier with no configured price: Stripe is never called", async () => {
      delete process.env.STRIPE_PRICE_OXFORD_STANDARD;
      const error = await reactivateSubscription("cus_4", tierMeta(), "uid_4").catch(
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(Error);
      expect(mockSubscriptionsCreate).not.toHaveBeenCalled();
      expect(failedBeforeSubscription(error)).toBe(true);
    });

    it("does not mark a failed create, which may follow a subscription Stripe made", async () => {
      process.env.STRIPE_PRICE_OXFORD_STANDARD = "price_oxford_std";
      mockSubscriptionsCreate.mockRejectedValue(new Error("timeout"));
      const error = await reactivateSubscription("cus_4", tierMeta(), "uid_4").catch(
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(Error);
      expect(failedBeforeSubscription(error)).toBe(false);
    });
  });
});
