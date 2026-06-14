import { isTierBillingEnabled } from "../config";

describe("isTierBillingEnabled", () => {
  it("is false when unset", () => {
    delete process.env.TIER_BILLING_ENABLED;
    expect(isTierBillingEnabled()).toBe(false);
  });
  it("is true only for the exact string 'true'", () => {
    process.env.TIER_BILLING_ENABLED = "true";
    expect(isTierBillingEnabled()).toBe(true);
    process.env.TIER_BILLING_ENABLED = "1";
    expect(isTierBillingEnabled()).toBe(false);
  });
});
