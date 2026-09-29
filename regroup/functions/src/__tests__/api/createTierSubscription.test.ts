// src/__tests__/api/createTierSubscription.test.ts
//
// NOTE (Task 0 deviation): The migration plan suggested
// `jest.mock("../../util/stripe")`, but api/stripe.ts does NOT import
// util/stripe.ts. Its `stripe` client is a lazy Proxy wrapping `new Stripe(...)`
// from the `stripe` npm package directly. So — matching the convention already
// used in stripeWebhook.test.ts and subscriptions.test.ts — we mock the `stripe`
// package itself and assert against the mocked `subscriptions.create`.

const mockSubscriptionsCreate = jest.fn();
const mockCustomersCreate = jest.fn();

jest.mock("stripe", () =>
  jest.fn().mockImplementation(() => ({
    subscriptions: {
      create: (...args: unknown[]) => mockSubscriptionsCreate(...args),
    },
    customers: {
      create: (...args: unknown[]) => mockCustomersCreate(...args),
    },
  })),
);

import {
  createTierSubscription,
  initializeTierCustomer,
} from "../../api/stripe";

describe("createTierSubscription", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = "sk_test";
    process.env.STRIPE_API_VERSION = "2026-01-28.clover";
    process.env.STRIPE_PRICE_TRAD_STARTER = "price_starter";
    mockSubscriptionsCreate.mockResolvedValue({
      id: "sub_1",
      items: { data: [{ id: "si_1" }] },
    });
  });

  afterEach(() => {
    delete process.env.STRIPE_PRICE_TRAD_STARTER;
  });

  it("creates a single-item subscription using the resolved tier price", async () => {
    await createTierSubscription("cus_1", "traditional", "starter", "uid_1");

    expect(mockSubscriptionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_1",
        items: [{ price: "price_starter", quantity: 1 }],
        trial_period_days: 30,
        metadata: {
          userId: "uid_1",
          houseType: "traditional",
          tier: "starter",
          billingInterval: "month",
        },
      }),
    );
  });

  it("uses the annual price + records the interval when billing yearly", async () => {
    process.env.STRIPE_PRICE_TRAD_STARTER_ANNUAL = "price_starter_annual";

    await createTierSubscription(
      "cus_1",
      "traditional",
      "starter",
      "uid_1",
      "year",
    );

    expect(mockSubscriptionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [{ price: "price_starter_annual", quantity: 1 }],
        trial_period_days: 30,
        metadata: {
          userId: "uid_1",
          houseType: "traditional",
          tier: "starter",
          billingInterval: "year",
        },
      }),
    );

    delete process.env.STRIPE_PRICE_TRAD_STARTER_ANNUAL;
  });
});

describe("initializeTierCustomer — oxfordEnabled", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = "sk_test";
    process.env.STRIPE_API_VERSION = "2026-01-28.clover";
    process.env.STRIPE_PRICE_OXFORD_STANDARD = "price_oxford_standard";
    process.env.STRIPE_PRICE_TRAD_STARTER = "price_starter";
    mockCustomersCreate.mockResolvedValue({ id: "cus_1" });
    mockSubscriptionsCreate.mockResolvedValue({
      id: "sub_1",
      status: "trialing",
      items: { data: [{ id: "si_1" }] },
    });
  });

  afterEach(() => {
    delete process.env.STRIPE_PRICE_OXFORD_STANDARD;
    delete process.env.STRIPE_PRICE_TRAD_STARTER;
  });

  it("sets oxfordEnabled true for an oxford house type", async () => {
    const meta = await initializeTierCustomer(
      "op@example.com",
      "pm_123",
      "oxford",
      "standard",
      "user_1",
      "month",
    );

    expect(meta.oxfordEnabled).toBe(true);
  });

  it("sets oxfordEnabled false for a traditional house type", async () => {
    const meta = await initializeTierCustomer(
      "op@example.com",
      "pm_123",
      "traditional",
      "starter",
      "user_1",
      "month",
    );

    expect(meta.oxfordEnabled).toBe(false);
  });
});
