import type Stripe from "stripe";
import { logger } from "firebase-functions";
import type { ConnectAccountsApi } from "../config";
import { isResourceMissing } from "./stripe";

/**
 * Create and close for a house's Stripe connected account, on either Accounts
 * API.
 *
 * Kept beside the status helper and out of callable/payments.ts so the account
 * lifecycle lives in one place: the create parameters, the close parameters,
 * and the "already gone" tolerance all have to agree, and they used to be
 * spread across the callable.
 *
 * v1 is the live path: Accounts v2 needs Stripe to enable it for the platform.
 * The v2 functions stay so that switching CONNECT_ACCOUNTS_API to "v2" works
 * once it does.
 */

/**
 * Creates a house's v1 account from controller properties — Stripe's
 * replacement for the legacy `type: "express"` — configured like the v2
 * recipient account below, except that v1 also requests card_payments (see
 * below): Express dashboard, platform pays fees and
 * carries losses (destination charges need platform loss liability), Stripe
 * collects requirements (required with the Express dashboard).
 *
 * card_payments is requested alongside transfers because a v1 platform needs
 * Stripe's approval to request transfers on its own. The two are coupled:
 * if either goes inactive Stripe disables both, which the status mapping
 * accounts for. `country` is fixed to US: requesting capabilities locks it
 * anyway, and regroup only operates in the US.
 */
export async function createV1HouseAccount(
  stripe: Stripe,
  houseId: string,
): Promise<Stripe.Account> {
  return stripe.accounts.create({
    country: "US",
    controller: {
      stripe_dashboard: { type: "express" },
      fees: { payer: "application" },
      losses: { payments: "application" },
      requirement_collection: "stripe",
    },
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    metadata: { houseId },
  });
}

/** Creates a house's account with the given API. Only the id is used. */
export async function createHouseAccount(
  stripe: Stripe,
  houseId: string,
  api: ConnectAccountsApi,
): Promise<{ id: string }> {
  return api === "v1"
    ? createV1HouseAccount(stripe, houseId)
    : createRecipientAccount(stripe, houseId);
}

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
 * `losses_collector: 'application'`: rent is collected with destination
 * charges, which need the platform to carry loss liability. Stripe-managed
 * losses ('stripe') require direct charges instead.
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
 * Closes a house's v2 account. v2 has no `delete`; close is its analogue, and
 * it removes access while leaving history retrievable. v2 only: this platform
 * rejects v1 accounts on v2 endpoints.
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
  api: ConnectAccountsApi,
): Promise<void> {
  try {
    if (api === "v1") {
      // Deleting is safe here and only here: the account was created moments
      // ago, has never received a transfer, and holds no balance.
      await stripe.accounts.del(accountId);
    } else {
      await closeRecipientAccount(stripe, accountId);
    }
  } catch (err) {
    logger.error("Failed to close orphaned Stripe account", {
      accountId,
      api,
      err,
    });
  }
}

/**
 * True when Stripe reports a v2 account as closed. Throws on a failed read.
 * v2 only — v1 has no closed state.
 */
export async function isRecipientAccountClosed(
  stripe: Stripe,
  accountId: string,
): Promise<boolean> {
  const account = await stripe.v2.core.accounts.retrieve(accountId);
  return account.closed === true;
}

/**
 * Closes a house's v2 account, succeeding if Stripe already has it gone or
 * closed. v2 only; a v1 house is unlinked without a Stripe call instead.
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
