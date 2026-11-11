import type Stripe from "stripe";
import { periodEndSeconds } from "../../util/subscriptionPeriod";

const sub = (fields: Record<string, unknown>) => fields as unknown as Stripe.Subscription;

describe("periodEndSeconds", () => {
  it("is the trial end while trialing", () => {
    expect(
      periodEndSeconds(
        sub({ status: "trialing", trial_end: 100, items: { data: [{ id: "si_1", current_period_end: 200 }] } }),
      ),
    ).toBe(100);
  });

  it("is the item's period end otherwise, not the cycle's start", () => {
    expect(
      periodEndSeconds(
        sub({
          status: "active",
          trial_end: null,
          billing_cycle_anchor: 50,
          items: { data: [{ id: "si_1", current_period_end: 200 }] },
        }),
      ),
    ).toBe(200);
  });

  it("reads the named item when there is more than one", () => {
    expect(
      periodEndSeconds(
        sub({
          status: "active",
          items: {
            data: [
              { id: "si_other", current_period_end: 300 },
              { id: "si_tier", current_period_end: 200 },
            ],
          },
        }),
        "si_tier",
      ),
    ).toBe(200);
  });

  it("is null when Stripe sent no period end", () => {
    expect(periodEndSeconds(sub({ status: "active", items: { data: [{ id: "si_1" }] } }))).toBeNull();
  });
});
