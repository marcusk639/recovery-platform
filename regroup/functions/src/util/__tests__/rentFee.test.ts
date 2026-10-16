// Mock config so importing the helper does not pull in Secret Manager
// definitions; the production-default rent-fee model is supplied explicitly.
jest.mock("../../config", () => ({
  RENT_FEE: {
    achFlatCents: 200,
    achRate: 0,
    achCapCents: 300,
    cardPlatformRate: 0.0075,
    stripeCardRate: 0.029,
    stripeCardFixedCents: 30,
    stripeAchRate: 0.008,
    stripeAchCapCents: 500,
  },
}));

import { computeApplicationFee, RentFeeConfig } from "../rentFee";

// Production-default model: platform margin (flat $2 ACH, 0.75% card) PLUS the
// estimated Stripe cost recovered from the house (2.9% + 30c card, 0.8% capped
// at $5 ACH).
const DEFAULT_FEES: RentFeeConfig = {
  achFlatCents: 200,
  achRate: 0,
  achCapCents: 300,
  cardPlatformRate: 0.0075,
  stripeCardRate: 0.029,
  stripeCardFixedCents: 30,
  stripeAchRate: 0.008,
  stripeAchCapCents: 500,
};

/** What Stripe actually charges, mirroring DEFAULT_FEES, for net assertions. */
const stripeCost = (amountCents: number, card: boolean): number =>
  card
    ? Math.round(amountCents * 0.029) + 30
    : Math.min(Math.round(amountCents * 0.008), 500);

describe("computeApplicationFee", () => {
  it("card: margin plus recovered Stripe cost", () => {
    // margin 0.75% of 15000 = 112.5 -> 113; Stripe 2.9% = 435, +30 fixed = 465
    expect(
      computeApplicationFee(
        { amountCents: 15000, paymentMethodType: "card" },
        DEFAULT_FEES,
      ),
    ).toBe(578);
  });

  it("ach / us_bank_account: flat $2 margin plus recovered Stripe cost", () => {
    expect(
      computeApplicationFee(
        {
          amountCents: 15000,
          paymentMethodType: "us_bank_account",
        },
        DEFAULT_FEES,
      ),
    ).toBe(320);
    expect(
      computeApplicationFee(
        { amountCents: 90000, paymentMethodType: "ach" },
        DEFAULT_FEES,
      ),
    ).toBe(700);
  });

  it("clamps the total fee to the rent amount for tiny amounts", () => {
    expect(
      computeApplicationFee(
        { amountCents: 100, paymentMethodType: "ach" },
        DEFAULT_FEES,
      ),
    ).toBe(100);
  });

  it("always returns an integer (Stripe rejects float amounts)", () => {
    const fee = computeApplicationFee(
      { amountCents: 12345, paymentMethodType: "card" },
      DEFAULT_FEES,
    );
    expect(Number.isInteger(fee)).toBe(true);
  });

  it("uses min(rate, cap) when an ACH percentage rate is configured", () => {
    const ratedFees: RentFeeConfig = { ...DEFAULT_FEES, achRate: 0.005 }; // 0.5%
    // margin: 0.5% of 100000 = 500 -> capped at 300; Stripe: 800 -> capped at 500
    expect(
      computeApplicationFee(
        { amountCents: 100000, paymentMethodType: "ach" },
        ratedFees,
      ),
    ).toBe(800);
    // margin: 0.5% of 40000 = 200 under cap; Stripe: 0.8% = 320 under cap
    expect(
      computeApplicationFee(
        { amountCents: 40000, paymentMethodType: "ach" },
        ratedFees,
      ),
    ).toBe(520);
  });

  it("falls back to the imported RENT_FEE when no config is passed", () => {
    // Mocked config above: margin 150 + Stripe (580 + 30) = 760.
    expect(
      computeApplicationFee({
        amountCents: 20000,
        paymentMethodType: "card",
      }),
    ).toBe(760);
  });

  describe("integer / non-negative invariant (Stripe rejects floats & negatives)", () => {
    const methods: ("card" | "ach" | "us_bank_account")[] = [
      "card",
      "ach",
      "us_bank_account",
    ];

    it("returns an integer fee for a fractional amountCents on every path", () => {
      for (const method of methods) {
        const fee = computeApplicationFee(
          {
            amountCents: 150.5,
            paymentMethodType: method,
          },
          DEFAULT_FEES,
        );
        expect(Number.isInteger(fee)).toBe(true);
        expect(fee).toBeGreaterThanOrEqual(0);
        expect(fee).toBeLessThanOrEqual(151);
      }
    });

    it("returns 0 for a zero or negative amountCents (no charge to fee)", () => {
      for (const amountCents of [0, -1, -15000]) {
        for (const method of methods) {
          expect(
            computeApplicationFee(
              { amountCents, paymentMethodType: method },
              DEFAULT_FEES,
            ),
          ).toBe(0);
        }
      }
    });

    it("returns 0 for a non-finite amountCents (NaN/Infinity)", () => {
      for (const amountCents of [NaN, Infinity, -Infinity]) {
        expect(
          computeApplicationFee(
            { amountCents, paymentMethodType: "ach" },
            DEFAULT_FEES,
          ),
        ).toBe(0);
      }
    });

    it("never charges a flat ACH fee exceeding the (rounded) rent amount", () => {
      // Flat $2 (200c) but rent is only 150.5c -> clamp to rounded amount 151.
      expect(
        computeApplicationFee(
          {
            amountCents: 150.5,
            paymentMethodType: "ach",
          },
          DEFAULT_FEES,
        ),
      ).toBe(151);
    });
  });

  describe("house bears processing (the point of including Stripe cost)", () => {
    it("leaves the platform its margin after Stripe takes its cut", () => {
      // This is the invariant the change exists for. Before it, a $500 card
      // payment collected 375 and paid Stripe 1480 — a loss of 1105.
      for (const amountCents of [1000, 50000, 100000, 250000]) {
        const cardFee = computeApplicationFee(
          { amountCents, paymentMethodType: "card" },
          DEFAULT_FEES,
        );
        expect(cardFee - stripeCost(amountCents, true)).toBe(
          Math.round(amountCents * 0.0075),
        );

        const achFee = computeApplicationFee(
          { amountCents, paymentMethodType: "ach" },
          DEFAULT_FEES,
        );
        expect(achFee - stripeCost(amountCents, false)).toBe(200);
      }
    });

    it("degrades to margin-only rather than NaN when config is incomplete", () => {
      // A partial config (an older deployment, or a test mock) must not poison
      // the fee: NaN reaches Stripe as an invalid application_fee_amount and
      // fails the whole PaymentIntent, i.e. the resident's rent payment.
      const partial = {
        achFlatCents: 200,
        achRate: 0,
        achCapCents: 300,
        cardPlatformRate: 0.0075,
      } as unknown as RentFeeConfig;

      const card = computeApplicationFee(
        { amountCents: 15000, paymentMethodType: "card" },
        partial,
      );
      const ach = computeApplicationFee(
        { amountCents: 15000, paymentMethodType: "ach" },
        partial,
      );
      expect(Number.isFinite(card)).toBe(true);
      expect(Number.isFinite(ach)).toBe(true);
      expect(card).toBe(113);
      expect(ach).toBe(200);
    });

    it("reverts to margin-only when the Stripe-cost values are zeroed", () => {
      // The documented rollback: config change, no code change.
      const marginOnly: RentFeeConfig = {
        ...DEFAULT_FEES,
        stripeCardRate: 0,
        stripeCardFixedCents: 0,
        stripeAchRate: 0,
        stripeAchCapCents: 0,
      };
      expect(
        computeApplicationFee(
          { amountCents: 15000, paymentMethodType: "card" },
          marginOnly,
        ),
      ).toBe(113);
      expect(
        computeApplicationFee(
          { amountCents: 15000, paymentMethodType: "ach" },
          marginOnly,
        ),
      ).toBe(200);
    });
  });
});
