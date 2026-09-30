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
 * Compute the Stripe `application_fee_amount` (platform fee) for a rent payment,
 * in integer cents. Method-aware per the pricing revision plan (P-1/P-2):
 *
 * - ACH / bank    → flat per-transaction fee (or a capped percentage if a rate
 *                   is configured). Never exceeds the rent amount.
 * - Card          → a thin platform fee (default 0.75%); Stripe's processing
 *                   cost is borne by the resident as a disclosed convenience fee
 *                   and is not double-charged here.
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
    const fee =
      feeConfig.achRate > 0
        ? Math.min(
            Math.round(amount * feeConfig.achRate),
            feeConfig.achCapCents,
          )
        : feeConfig.achFlatCents;
    // Never charge more than the rent itself (guards tiny amounts).
    return Math.min(Math.round(fee), amount);
  }

  // card (default)
  return Math.min(Math.round(amount * feeConfig.cardPlatformRate), amount);
}
