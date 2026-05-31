// Set the env var before requireActual loads stripe.ts so the startup guard passes.
jest.mock("../utils/stripe", () => {
  process.env.STRIPE_TEST_SECRET_KEY = "sk_test_fake";
  process.env.RATS_API_KEY = "test-rats-api-key";
  return jest.requireActual("../utils/stripe");
});

import { assertGroupPriceIsAnnual } from "../utils/stripe";

// Tests the pure helper directly with plain objects — no Stripe SDK mock needed.
describe("assertGroupPriceIsAnnual", () => {
  it("does not throw when the price interval is year", () => {
    const price = { id: "price_abc", recurring: { interval: "year" } } as any;
    expect(() => assertGroupPriceIsAnnual(price)).not.toThrow();
  });

  it("throws when the price interval is month", () => {
    const price = { id: "price_xyz", recurring: { interval: "month" } } as any;
    expect(() => assertGroupPriceIsAnnual(price)).toThrow(/price_xyz.*annual/i);
  });

  it("throws when recurring is null", () => {
    const price = { id: "price_abc", recurring: null } as any;
    expect(() => assertGroupPriceIsAnnual(price)).toThrow(/annual/i);
  });
});
