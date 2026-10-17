import { RENT_FEE } from "../config";

/**
 * Stripe payment-method types relevant to rent collection. `ach` is accepted as
 * an alias for `us_bank_account` for callers that use the friendlier label.
 */
export type RentPaymentMethodType = "card" | "us_bank_account" | "ach";

/** Shape of the rent application-fee model (see `RENT_FEE` in config). */
export type RentFeeConfig = typeof RENT_FEE;

export interface ComputeApplicationFeeParams {
  /** Rent amount in integer US cents. */
  amountCents: number;
  /** The method the resident is paying with. */
  paymentMethodType: RentPaymentMethodType;
}

const isBankTransfer = (type: RentPaymentMethodType): boolean =>
  type === "us_bank_account" || type === "ach";

/**
 * Read a configured fee component, coercing anything unusable to 0.
 *
 * Every component feeds the fee, and Stripe rejects an `application_fee_amount`
 * that is not a non-negative integer — a rejected PaymentIntent is a resident's
 * rent payment failing outright, platform-wide, until the config is corrected.
 * So this rejects three shapes, each of which was reachable:
 *
 *  - undefined / null — a partial config (older deployment, or a test mock);
 *  - NaN / Infinity — `Number("abc")`, or an arithmetic slip upstream;
 *  - negative — a sign typo. `cardPlatformRate: -1` produced a fee of -941c.
 *
 * Degrading to 0 means the platform absorbs that part of the cost, which is the
 * safe direction: a config mistake must cost margin, not stop rent collection.
 *
 * Fractional values are NOT coerced here — a rate is legitimately fractional
 * (0.029). Integrality is enforced once, on the way out of
 * computeApplicationFee, which is the only value Stripe ever sees.
 */
const num = (value: number | undefined): number =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;

/**
 * Compute the Stripe `application_fee_amount` for a rent payment, in integer
 * cents. It is the platform margin PLUS the estimated Stripe processing cost:
 *
 *   ACH  → flat margin (or capped percentage) + min(amount * 0.8%, $5)
 *   Card → amount * 0.75% + (amount * 2.9% + 30c)
 *
 * Including the processing cost is what makes the house bear it. These are
 * destination charges, so Stripe debits processing from the platform; a
 * margin-only fee meant the platform paid ~2.9% to collect 0.75%. See RENT_FEE
 * in config for why this rather than `on_behalf_of`, and for the estimate's
 * trade-off.
 *
 * Capped at the rent amount: Stripe rejects an application fee larger than the
 * charge, and the cap is reachable on very small amounts where the 30c fixed
 * component dominates.
 *
 * Always returns a non-negative integer (Stripe rejects floats / over-charges).
 */

export function computeApplicationFee(
  { amountCents, paymentMethodType }: ComputeApplicationFeeParams,
  feeConfig: RentFeeConfig = RENT_FEE,
): number {
  // Normalize the rent amount to a non-negative integer cents value up front.
  // Callers may pass a float (legacy data) or a non-positive amount; Stripe
  // rejects a non-integer or negative `application_fee_amount`, which would
  // fail the entire PaymentIntent. Every branch below derives from `amount`,
  // so the returned fee is always a non-negative integer.
  const amount =
    Number.isFinite(amountCents) && amountCents > 0
      ? Math.round(amountCents)
      : 0;
  if (amount === 0) {
    return 0;
  }

  if (isBankTransfer(paymentMethodType)) {
    const achRate = num(feeConfig.achRate);
    const margin =
      achRate > 0
        ? Math.min(
            Math.round(amount * achRate),
            num(feeConfig.achCapCents),
          )
        : num(feeConfig.achFlatCents);
    // Cap applied unconditionally: zeroing the cap zeroes the recovery, which
    // is what the documented rollback expects. A zero cap meaning "uncapped"
    // would be a trap.
    const stripeCost = Math.min(
      Math.round(amount * num(feeConfig.stripeAchRate)),
      num(feeConfig.stripeAchCapCents),
    );
    // Never charge more than the rent itself (guards tiny amounts). Rounded
    // last: a fractional *_CENTS config (RENT_FEE_STRIPE_ACH_CAP_CENTS=500.5,
    // the dollars-for-cents slip) otherwise reached Stripe as a non-integer
    // and failed the charge.
    return Math.round(Math.min(margin + stripeCost, amount));
  }

  // card (default)
  const margin = Math.round(amount * num(feeConfig.cardPlatformRate));
  const stripeCost =
    Math.round(amount * num(feeConfig.stripeCardRate)) +
    num(feeConfig.stripeCardFixedCents);
  // Rounded last, for the same reason as the ACH branch above: a fractional
  // RENT_FEE_STRIPE_CARD_FIXED_CENTS=0.30 produced 1825.3 on a $500 charge.
  return Math.round(Math.min(margin + stripeCost, amount));
}
