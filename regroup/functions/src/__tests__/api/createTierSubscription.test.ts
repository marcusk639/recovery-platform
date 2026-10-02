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
// initializeTierCustomer now confirms an off-session SetupIntent between
// customers.create and subscriptions.create (spec item 9 — card validation at
// signup), so the client mock has to expose setupIntents/customers.del too.
const mockSetupIntentsCreate = jest.fn();
const mockCustomersDel = jest.fn();

jest.mock("stripe", () =>
  jest.fn().mockImplementation(() => ({
    subscriptions: {
      create: (...args: unknown[]) => mockSubscriptionsCreate(...args),
    },
    customers: {
      create: (...args: unknown[]) => mockCustomersCreate(...args),
      del: (...args: unknown[]) => mockCustomersDel(...args),
    },
    setupIntents: {
      create: (...args: unknown[]) => mockSetupIntentsCreate(...args),
    },
  })),
);

import {
  createSubscription,
  createTierSubscription,
  initializeTierCustomer,
  TRIAL_PERIOD_DAYS,
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
        trial_period_days: TRIAL_PERIOD_DAYS,
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
        trial_period_days: 7,
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
    // Card validation must pass for these tests to reach subscription creation.
    mockSetupIntentsCreate.mockResolvedValue({ status: "succeeded" });
    mockCustomersDel.mockResolvedValue({ id: "cus_1", deleted: true });
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

  it("creates tier subscriptions with a 7-day trial", async () => {
    expect(TRIAL_PERIOD_DAYS).toBe(7);

    await initializeTierCustomer(
      "op@example.com",
      "pm_123",
      "traditional",
      "starter",
      "user_1",
      "month",
    );

    // initializeTierCustomer now also passes an idempotency key, so the call
    // carries a second argument.
    expect(mockSubscriptionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ trial_period_days: 7 }),
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    );
  });
});

describe("createSubscription (legacy two-item path)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = "sk_test";
    process.env.STRIPE_API_VERSION = "2026-01-28.clover";
    mockSubscriptionsCreate.mockResolvedValue({
      id: "sub_1",
      items: { data: [{ id: "si_1" }] },
    });
  });

  it("creates legacy subscriptions with a 7-day trial", async () => {
    await createSubscription("cus_1", false, "uid_1");

    expect(mockSubscriptionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_1",
        trial_period_days: 7,
      }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Stripe idempotency keys
//
// Without a key, a retry or double-submit creates a SECOND real customer and
// subscription. Firestore keeps only whichever finishes last, so the first
// becomes an orphan that bills forever with nothing pointing at it. Rent
// collection already passes keys; the subscription lifecycle did not.
// ─────────────────────────────────────────────────────────────────────────────
describe("subscription lifecycle idempotency keys", () => {
  const optionsOf = (mock: jest.Mock) => mock.mock.calls[0]?.[1];

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = "sk_test";
    process.env.STRIPE_API_VERSION = "2026-01-28.clover";
    process.env.STRIPE_PRICE_TRAD_STARTER = "price_starter";
    mockCustomersCreate.mockResolvedValue({ id: "cus_new" });
    mockSetupIntentsCreate.mockResolvedValue({ status: "succeeded" });
    mockSubscriptionsCreate.mockResolvedValue({
      id: "sub_1",
      items: { data: [{ id: "si_1" }] },
      status: "trialing",
    });
  });

  afterEach(() => {
    delete process.env.STRIPE_PRICE_TRAD_STARTER;
  });

  it("passes an idempotency key when creating a tier customer", async () => {
    await initializeTierCustomer(
      "op@example.com",
      "pm_1",
      "traditional",
      "starter",
      "uid_1",
    );

    expect(optionsOf(mockCustomersCreate)?.idempotencyKey).toBeTruthy();
  });

  it("passes an idempotency key when creating a tier subscription", async () => {
    await initializeTierCustomer(
      "op@example.com",
      "pm_1",
      "traditional",
      "starter",
      "uid_1",
    );

    expect(optionsOf(mockSubscriptionsCreate)?.idempotencyKey).toBeTruthy();
  });

  it("derives the same key for a repeated identical signup", async () => {
    await initializeTierCustomer(
      "op@example.com",
      "pm_1",
      "traditional",
      "starter",
      "uid_1",
    );
    const first = optionsOf(mockSubscriptionsCreate)?.idempotencyKey;

    jest.clearAllMocks();
    mockCustomersCreate.mockResolvedValue({ id: "cus_new" });
    mockSetupIntentsCreate.mockResolvedValue({ status: "succeeded" });
    mockSubscriptionsCreate.mockResolvedValue({
      id: "sub_1",
      items: { data: [{ id: "si_1" }] },
      status: "trialing",
    });

    await initializeTierCustomer(
      "op@example.com",
      "pm_1",
      "traditional",
      "starter",
      "uid_1",
    );

    // A retry must reuse the key, or Stripe cannot dedupe it.
    expect(optionsOf(mockSubscriptionsCreate)?.idempotencyKey).toBe(first);
  });

  it("derives a different key for a different tier", async () => {
    process.env.STRIPE_PRICE_TRAD_PROFESSIONAL = "price_pro";
    await initializeTierCustomer(
      "op@example.com",
      "pm_1",
      "traditional",
      "starter",
      "uid_1",
    );
    const starterKey = optionsOf(mockSubscriptionsCreate)?.idempotencyKey;

    jest.clearAllMocks();
    mockCustomersCreate.mockResolvedValue({ id: "cus_new" });
    mockSetupIntentsCreate.mockResolvedValue({ status: "succeeded" });
    mockSubscriptionsCreate.mockResolvedValue({
      id: "sub_1",
      items: { data: [{ id: "si_1" }] },
      status: "trialing",
    });

    await initializeTierCustomer(
      "op@example.com",
      "pm_1",
      "traditional",
      "professional",
      "uid_1",
    );

    // Choosing a different tier is a different operation, not a retry.
    expect(optionsOf(mockSubscriptionsCreate)?.idempotencyKey).not.toBe(
      starterKey,
    );
    delete process.env.STRIPE_PRICE_TRAD_PROFESSIONAL;
  });

  it("does not put the operator email in the key", async () => {
    // Keys end up in logs and Stripe request records; keep PII out of them.
    await initializeTierCustomer(
      "op@example.com",
      "pm_1",
      "traditional",
      "starter",
      "uid_1",
    );

    expect(optionsOf(mockCustomersCreate)?.idempotencyKey).not.toContain(
      "op@example.com",
    );
  });
});
