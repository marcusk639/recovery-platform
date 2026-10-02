// Mock config so importing the helper does not pull in Secret Manager
// definitions; the production-default rent-fee model is supplied explicitly.
jest.mock("../../config", () => ({
  RENT_FEE: {
    achFlatCents: 200,
    achRate: 0,
    achCapCents: 300,
    cardPlatformRate: 0.0075,
  },
}));

import { computeApplicationFee, RentFeeConfig } from "../rentFee";

// Production-default model (flat $2 ACH, 0.75% card).
const DEFAULT_FEES: RentFeeConfig = {
  achFlatCents: 200,
  achRate: 0,
  achCapCents: 300,
  cardPlatformRate: 0.0075,
};

describe("computeApplicationFee", () => {
  it("card: applies the 0.75% platform fee, rounded to integer cents", () => {
    // 0.75% of 15000 = 112.5 -> 113
    expect(
      computeApplicationFee(
        { amountCents: 15000, paymentMethodType: "card" },
        DEFAULT_FEES,
      ),
    ).toBe(113);
  });

  it("ach / us_bank_account: applies the flat $2 fee regardless of amount", () => {
    expect(
      computeApplicationFee(
        {
          amountCents: 15000,
          paymentMethodType: "us_bank_account",
        },
        DEFAULT_FEES,
      ),
    ).toBe(200);
    expect(
      computeApplicationFee(
        { amountCents: 90000, paymentMethodType: "ach" },
        DEFAULT_FEES,
      ),
    ).toBe(200);
  });

  it("clamps the flat ACH fee to the rent amount for tiny amounts", () => {
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
    // 0.5% of 100000 = 500 -> capped at 300
    expect(
      computeApplicationFee(
        { amountCents: 100000, paymentMethodType: "ach" },
        ratedFees,
      ),
    ).toBe(300);
    // 0.5% of 40000 = 200 -> under cap
    expect(
      computeApplicationFee(
        { amountCents: 40000, paymentMethodType: "ach" },
        ratedFees,
      ),
    ).toBe(200);
  });

  it("falls back to the imported RENT_FEE when no config is passed", () => {
    // Uses the mocked config above (card 0.75% of 20000 = 150).
    expect(
      computeApplicationFee({
        amountCents: 20000,
        paymentMethodType: "card",
      }),
    ).toBe(150);
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
});
