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

import { reactivateSubscription } from "../../api/stripe";
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
});
