import type Stripe from "stripe";
import { isAlreadyDeauthorized, isResourceMissing } from "./stripe";

/**
 * Create and close for a house's Stripe Accounts v2 recipient account.
 *
 * Kept beside the status helper and out of callable/payments.ts so the v2
 * account lifecycle lives in one place: the create parameters, the close
 * parameters, and the "already gone" tolerance all have to agree, and they used
 * to be spread across the callable.
 */

/**
 * The configurations a house account carries. `close` rejects unless every one
 * of them is named, and a house is a recipient and nothing else — it receives
 * transfers and never charges anyone.
 */
const HOUSE_CONFIGURATIONS: Array<"customer" | "merchant" | "recipient"> = [
  "recipient",
];

/**
 * Creates the recipient account for a house.
 *
 * Deliberately NOT a merchant: requesting `configuration.merchant` or
 * card_payments would demand verification a house never needs and lengthen
 * onboarding for nothing.
 *
 * `losses_collector: 'application'` is a constraint rather than a preference —
 * 'stripe' is a blocked combination with destination charges, and is rejected
 * outright alongside the Express dashboard.
 */
export async function createRecipientAccount(
  stripe: Stripe,
  houseId: string,
): Promise<Stripe.V2.Core.Account> {
  return stripe.v2.core.accounts.create({
    // Express dashboard: Stripe hosts the operator-facing views.
    dashboard: "express",
    defaults: {
      responsibilities: {
        fees_collector: "application",
        losses_collector: "application",
      },
    },
    configuration: {
      recipient: {
        capabilities: {
          stripe_balance: { stripe_transfers: { requested: true } },
        },
      },
    },
    metadata: { houseId },
  });
}

/**
 * Closes a house's account. v2 has no `delete`; close is its analogue, and it
 * removes access while leaving history retrievable.
 */
export async function closeRecipientAccount(
  stripe: Stripe,
  accountId: string,
): Promise<void> {
  await stripe.v2.core.accounts.close(accountId, {
    applied_configurations: HOUSE_CONFIGURATIONS,
  });
}

/**
 * Closes an account we created but could not persist. Best-effort: a failure
 * here leaves an unreferenced account on the platform, which is strictly better
 * than failing the caller's request a second time.
 */
export async function closeOrphanedAccount(
  stripe: Stripe,
  accountId: string,
): Promise<void> {
  await closeRecipientAccount(stripe, accountId).catch(() => undefined);
}

/**
 * True when Stripe is telling us the account is already gone, so a disconnect
 * can be treated as idempotent and local state brought in sync anyway.
 *
 * `resource_missing` is the machine-readable form and is what a v2 close
 * returns; the message matching in isAlreadyDeauthorized is a v1 artefact kept
 * because the wording is not something we control.
 */
export function isAccountAlreadyGone(err: unknown): boolean {
  return isResourceMissing(err) || isAlreadyDeauthorized(err);
}
