import type Stripe from "stripe";
import { logger } from "firebase-functions";
import { isResourceMissing } from "./stripe";

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
 * than failing the caller's request a second time. It is logged with the id
 * because nothing else references that account any more.
 */
export async function closeOrphanedAccount(
  stripe: Stripe,
  accountId: string,
): Promise<void> {
  try {
    await closeRecipientAccount(stripe, accountId);
  } catch (err) {
    logger.error("Failed to close orphaned Stripe recipient account", {
      accountId,
      err,
    });
  }
}

/** True when Stripe reports the account as closed. Throws on a failed read. */
export async function isRecipientAccountClosed(
  stripe: Stripe,
  accountId: string,
): Promise<boolean> {
  const account = await stripe.v2.core.accounts.retrieve(accountId);
  return account.closed === true;
}

/**
 * Closes a house's account, succeeding if Stripe already has it gone or closed.
 *
 * A closed v2 account still exists, so closing it again is refused with an
 * error that is not resource_missing. Re-reading the account is the only
 * reliable way to tell "already closed" from a genuine refusal. Without it, a
 * disconnect whose Firestore clear failed after a successful close could never
 * be retried, and neither could one for an account closed in the Dashboard.
 *
 * Any other failure rethrows the original close error.
 */
export async function closeHouseAccount(
  stripe: Stripe,
  accountId: string,
): Promise<void> {
  try {
    await closeRecipientAccount(stripe, accountId);
  } catch (err) {
    // Only the machine-readable code counts as "gone". Message text is not
    // evidence: v2 reports an inaccessible id as 403 forbidden, never as
    // "No such account", so a wording match could only misread a refusal.
    if (isResourceMissing(err)) {
      logger.warn("Stripe account already gone; treating close as done", {
        accountId,
      });
      return;
    }
    const closed = await isRecipientAccountClosed(stripe, accountId).catch(
      () => false,
    );
    if (!closed) throw err;
    logger.warn("Stripe account already closed; treating close as done", {
      accountId,
    });
  }
}
