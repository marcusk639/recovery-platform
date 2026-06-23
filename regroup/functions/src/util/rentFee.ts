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
  /** Whether this house is grandfathered on the legacy flat 2% fee (P-3). */
  isLegacyHouse: boolean;
}

const isBankTransfer = (type: RentPaymentMethodType): boolean =>
  type === "us_bank_account" || type === "ach";

/**
 * Compute the Stripe `application_fee_amount` (platform fee) for a rent payment,
 * in integer cents. Method-aware per the pricing revision plan (P-1/P-2/P-3):
 *
 * - Legacy house  → flat 2% of the rent (grandfathered until migration).
 * - ACH / bank    → flat per-transaction fee (or a capped percentage if a rate
 *                   is configured). Never exceeds the rent amount.
 * - Card          → a thin platform fee (default 0.75%); Stripe's processing
 *                   cost is borne by the resident as a disclosed convenience fee
 *                   and is not double-charged here.
 *
 * Always returns a non-negative integer (Stripe rejects floats / over-charges).
 */
export function computeApplicationFee(
  { amountCents, paymentMethodType, isLegacyHouse }: ComputeApplicationFeeParams,
  feeConfig: RentFeeConfig = RENT_FEE,
): number {
  if (isLegacyHouse) {
    return Math.round(amountCents * feeConfig.legacyRate);
  }

  if (isBankTransfer(paymentMethodType)) {
    const fee =
      feeConfig.achRate > 0
        ? Math.min(
            Math.round(amountCents * feeConfig.achRate),
            feeConfig.achCapCents,
          )
        : feeConfig.achFlatCents;
    // Never charge more than the rent itself (guards tiny amounts).
    return Math.min(fee, amountCents);
  }

  // card (default)
  return Math.round(amountCents * feeConfig.cardPlatformRate);
}
