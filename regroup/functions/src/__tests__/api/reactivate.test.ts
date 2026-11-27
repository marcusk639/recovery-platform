// src/__tests__/api/reactivate.test.ts
//
// Mocks the `stripe` npm package directly (same convention as
// createTierSubscription.test.ts) since api/stripe.ts wraps `new Stripe(...)`.

const mockSubscriptionsCreate = jest.fn();
const mockCustomersRetrieve = jest.fn();

jest.mock("stripe", () =>
  jest.fn().mockImplementation(() => ({
    subscriptions: {
      create: (...args: unknown[]) => mockSubscriptionsCreate(...args),
    },
    customers: {
      retrieve: (...args: unknown[]) => mockCustomersRetrieve(...args),
    },
  })),
);

import { logger } from "firebase-functions";
import { failedBeforeSubscription, reactivateSubscription } from "../../api/stripe";
import OperatorSubscription from "../../entities/OperatorSubscription";

const warn = jest.spyOn(logger, "warn").mockImplementation(() => undefined);

describe("reactivateSubscription", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = "sk_test";
    process.env.STRIPE_API_VERSION = "2026-01-28.clover";
    process.env.STRIPE_HOUSE_PRICE_ID = "price_house";
    process.env.STRIPE_GUEST_PRICE_ID = "price_guest";
    mockCustomersRetrieve.mockImplementation(async (id: string) => ({ id }));
    warn.mockClear();
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

  // The replacement replaces the whole plan: built fresh, it left oxfordEnabled
  // at its default false, which shut a paying Oxford operator out of Oxford.
  it.each([
    ["oxford", "standard", "STRIPE_PRICE_OXFORD_STANDARD", true],
    ["traditional", "starter", "STRIPE_PRICE_TRAD_STARTER", false],
  ])("restarts a %s plan with oxfordEnabled as the plan has it", async (houseType, tier, env, oxford) => {
    process.env[env] = "price_x";
    mockSubscriptionsCreate.mockResolvedValue({
      id: "sub_7",
      status: "active",
      trial_end: null,
      billing_cycle_anchor: 1893456000,
      items: { data: [{ id: "si_7", plan: { id: "price_x" } }] },
    });
    const meta = Object.assign(new OperatorSubscription(), {
      tier,
      houseType,
      customerId: "cus_7",
      houses: {},
    });

    const fresh = await reactivateSubscription("cus_7", meta, "uid_7");

    expect(fresh.oxfordEnabled).toBe(oxford);
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

  // Reactivate used to look up the monthly price whatever the stored plan was,
  // so an annual plan came back monthly.
  it("restarts an annual plan on the annual price, and records it as annual", async () => {
    process.env.STRIPE_PRICE_OXFORD_STANDARD = "price_oxford_std";
    process.env.STRIPE_PRICE_OXFORD_STANDARD_ANNUAL = "price_oxford_std_year";
    mockSubscriptionsCreate.mockResolvedValue({
      id: "sub_5",
      status: "active",
      trial_end: null,
      billing_cycle_anchor: 1893456000,
      items: { data: [{ id: "si_5", plan: { id: "price_oxford_std_year" } }] },
    });
    const meta = Object.assign(new OperatorSubscription(), {
      tier: "standard",
      houseType: "oxford",
      billingInterval: "year",
      customerId: "cus_5",
      houses: {},
    });

    const fresh = await reactivateSubscription("cus_5", meta, "uid_5");

    expect(mockSubscriptionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ items: [{ price: "price_oxford_std_year", quantity: 1 }] }),
      expect.anything(),
    );
    expect(fresh.billingInterval).toBe("year");
    delete process.env.STRIPE_PRICE_OXFORD_STANDARD_ANNUAL;
  });

  it("keys each restart by its attempt, so a later restart isn't handed the earlier one", async () => {
    process.env.STRIPE_PRICE_OXFORD_STANDARD = "price_oxford_std";
    mockSubscriptionsCreate.mockResolvedValue({
      id: "sub_6",
      status: "active",
      trial_end: null,
      billing_cycle_anchor: 1893456000,
      items: { data: [{ id: "si_6", plan: { id: "price_oxford_std" } }] },
    });
    const meta = () =>
      Object.assign(new OperatorSubscription(), {
        tier: "standard",
        houseType: "oxford",
        customerId: "cus_6",
        houses: {},
      });

    await reactivateSubscription("cus_6", meta(), "uid_6", { key: "1700000000000", beforeCreate: async () => undefined });
    await reactivateSubscription("cus_6", meta(), "uid_6", { key: "1700000060000", beforeCreate: async () => undefined });

    const [first, second] = mockSubscriptionsCreate.mock.calls.map((c) => c[1].idempotencyKey);
    expect(second).not.toBe(first);
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

    it("marks a refusal from the attempt check: Stripe is never called", async () => {
      process.env.STRIPE_PRICE_OXFORD_STANDARD = "price_oxford_std";
      const refusal = new Error("checkout lock lost");
      const error = await reactivateSubscription("cus_4", tierMeta(), "uid_4", {
        key: "1700000000000",
        beforeCreate: async () => {
          throw refusal;
        },
      }).catch((e: unknown) => e);
      expect(error).toBe(refusal);
      expect(mockSubscriptionsCreate).not.toHaveBeenCalled();
      expect(failedBeforeSubscription(error)).toBe(true);
    });

    // The replacement is created on the stored customer. If Stripe no longer has
    // it (deleted, say by support), the create would fail after the lookup with
    // an error not marked as before any subscription, holding the lock.
    it.each([
      ["deleted", async (id: string) => ({ id, deleted: true })],
      [
        "missing",
        async () => {
          throw Object.assign(new Error("No such customer"), {
            type: "StripeInvalidRequestError",
            code: "resource_missing",
          });
        },
      ],
    ])("refuses a stored customer Stripe has %s, before creating anything", async (_label, retrieve) => {
      process.env.STRIPE_PRICE_OXFORD_STANDARD = "price_oxford_std";
      mockCustomersRetrieve.mockImplementation(retrieve);
      const error = await reactivateSubscription("cus_4", tierMeta(), "uid_4").catch(
        (e: unknown) => e,
      );
      expect(error).toMatchObject({ code: "failed-precondition" });
      expect(mockSubscriptionsCreate).not.toHaveBeenCalled();
      expect(failedBeforeSubscription(error)).toBe(true);
      // The operator is told to contact support, so the server logs it.
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("no longer on file"),
        expect.objectContaining({ userId: "uid_4", customerId: "cus_4" }),
      );
    });

    it("reports a Stripe outage as itself, not as billing details gone", async () => {
      process.env.STRIPE_PRICE_OXFORD_STANDARD = "price_oxford_std";
      mockCustomersRetrieve.mockRejectedValue(new Error("stripe down"));
      const error = await reactivateSubscription("cus_4", tierMeta(), "uid_4").catch(
        (e: unknown) => e,
      );
      expect(error).not.toMatchObject({ code: "failed-precondition" });
      expect(error).toMatchObject({ message: "stripe down" });
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
