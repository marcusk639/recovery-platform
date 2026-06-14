import {
  getTier,
  getTierAmountCents,
  resolveTierPriceId,
} from "../../util/tierPricing";

describe("tierPricing", () => {
  it("returns the tier config for a valid houseType + tier", () => {
    const tier = getTier("traditional", "professional");
    expect(tier.label).toBe("Traditional Professional");
    expect(tier.maxResidents).toBe(20);
  });

  it("exposes the strategy amount in cents", () => {
    expect(getTierAmountCents("traditional", "starter")).toBe(6900);
    expect(getTierAmountCents("oxford", "network")).toBe(29900);
  });

  it("throws on an unknown tier", () => {
    expect(() => getTier("traditional", "platinum" as never)).toThrow(
      /Unknown tier/,
    );
  });

  it("resolves the price ID from the environment variable", () => {
    process.env.STRIPE_PRICE_TRAD_STARTER = "price_test_123";
    expect(resolveTierPriceId("traditional", "starter")).toBe("price_test_123");
  });

  it("throws when the price env var is unset", () => {
    delete process.env.STRIPE_PRICE_OXFORD_PLUS;
    expect(() => resolveTierPriceId("oxford", "plus")).toThrow(
      /not configured/,
    );
  });
});
