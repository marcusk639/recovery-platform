import type Stripe from "stripe";
import { logger } from "firebase-functions";
import type { ConnectAccountsApi } from "../config";

/**
 * The ONE translation from a house's Stripe connected account to this
 * service's house-level Connect status, for both Accounts APIs.
 *
 * Houses only ever receive transfers from the platform's destination charges
 * (no on_behalf_of); they never charge anyone. So the signal that decides
 * whether rent can land is the transfers capability, not `charges_enabled`:
 *
 *   v2: configuration.recipient.capabilities.stripe_balance.stripe_transfers.status
 *       (only returned when the retrieve asks for it via `include`)
 *   v1: capabilities.transfers
 *
 * A house's account is read with the API that created it
 * (`houses.stripeAccountApi`). This platform rejects v1 accounts on v2
 * endpoints (v1_account_instead_of_v2_account) while Accounts v2 is not
 * enabled for it, so the version cannot be guessed or mixed.
 *
 * Every caller must go through here. The same mapping duplicated across call
 * sites is exactly what produced the bug this replaces.
 */

/** House status values derivable from a live Stripe account. */
export type ConnectStatus = "active" | "pending" | "restricted";

/**
 * Raw transfers capability status from either API, plus `absent`.
 *   v2 (stripe_balance.stripe_transfers): active | pending | restricted | unsupported
 *   v1 (capabilities.transfers):          active | pending | inactive
 * `absent` means the capability was not in the response: on v2, no recipient
 * configuration (a retrieve without `include`, or none applied); on v1, the
 * account has no transfers capability.
 */
export type TransfersCapabilityStatus =
  | "active"
  | "pending"
  | "restricted"
  | "unsupported"
  | "inactive"
  | "absent";

export interface ConnectAccountStatus {
  /**
   * True when Stripe has closed the account. A closed v2 account is still
   * retrievable — it is NOT resource_missing — but accepts no operations, so
   * callers must treat it as gone: mark the house disconnected and never reuse
   * its id. `status` is only `pending` here to keep the type closed; it is not
   * a state the house can recover from.
   */
  closed: boolean;
  /** Mapped house status. */
  status: ConnectStatus;
  /** The capability status this was derived from, for logging and diagnosis. */
  transfersStatus: TransfersCapabilityStatus;
  /** True only when the account can actually receive transfers right now. */
  transfersEnabled: boolean;
  /**
   * Display only — getStripeAccountStatus returns both to the mobile client,
   * which renders a row from each; neither gates rent. v1 reports Stripe's own charges_enabled / payouts_enabled. v2 has no
   * charges of its own and its payouts capability is not read here, so both
   * mirror transfersEnabled.
   */
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  /** Requirement descriptions, split by Stripe's own deadline buckets. */
  currentlyDue: string[];
  pastDue: string[];
  eventuallyDue: string[];
}

/**
 * Fields a recipient-status retrieve must ask for. Fields not named in
 * `include` come back null, so without `configuration.recipient` the
 * capability is unreadable.
 */
export const RECIPIENT_ACCOUNT_INCLUDE: Array<
  "configuration.recipient" | "requirements"
> = ["configuration.recipient", "requirements"];

/** Retrieves a v2 account with the fields the status mapping needs. */
export async function retrieveRecipientAccount(
  stripe: Stripe,
  accountId: string,
): Promise<Stripe.V2.Core.Account> {
  return stripe.v2.core.accounts.retrieve(accountId, {
    include: RECIPIENT_ACCOUNT_INCLUDE,
  });
}

function requirementDescriptions(
  account: Stripe.V2.Core.Account,
  deadline: "currently_due" | "past_due" | "eventually_due",
): string[] {
  const entries = account.requirements?.entries ?? [];
  return entries
    .filter((entry) => entry.minimum_deadline?.status === deadline)
    .map((entry) => entry.description)
    .filter((description): description is string => !!description);
}

/**
 * Maps a retrieved v2 account onto the house status model.
 *
 * The capability status is trusted on its own. Stripe already distinguishes
 * "waiting on Stripe" (`pending`) from "waiting on the operator"
 * (`restricted`) through it, which the old requirements-based heuristic only
 * approximated. Requirements are carried through for display, not to decide
 * the status.
 *
 * `absent` and anything unrecognised map to `pending`, never to `active`: a
 * wrongly-active house produces a failed transfer, a wrongly-pending house is
 * blocked and recovers on the next sync.
 */
export function mapRecipientAccountStatus(
  account: Stripe.V2.Core.Account,
): ConnectAccountStatus {
  const transfersStatus: TransfersCapabilityStatus =
    account.configuration?.recipient?.capabilities?.stripe_balance
      ?.stripe_transfers?.status ?? "absent";

  // Stripe keeps a closed account's last capability status, which can still
  // read `active`. It is history, so it must never decide the status.
  const closed = account.closed === true;

  let status: ConnectStatus;
  switch (closed ? "absent" : transfersStatus) {
    case "active":
      status = "active";
      break;
    case "restricted":
    case "unsupported":
      status = "restricted";
      break;
    default:
      status = "pending";
      break;
  }

  return {
    closed,
    status,
    transfersStatus,
    transfersEnabled: !closed && transfersStatus === "active",
    chargesEnabled: !closed && transfersStatus === "active",
    payoutsEnabled: !closed && transfersStatus === "active",
    currentlyDue: requirementDescriptions(account, "currently_due"),
    pastDue: requirementDescriptions(account, "past_due"),
    eventuallyDue: requirementDescriptions(account, "eventually_due"),
  };
}

/**
 * v1 disabled reasons that mean Stripe, not the operator, holds the next step.
 * Treating them as `restricted` would tell an operator who has submitted
 * everything that Stripe needs more information.
 */
const STRIPE_REVIEW_REASONS: ReadonlySet<string> = new Set([
  "requirements.pending_verification",
  "under_review",
  // Stripe is checking the account against prohibited lists and will enable or
  // reject it; the operator has nothing to submit.
  "listed",
]);

/**
 * Maps a retrieved v1 account onto the house status model.
 *
 * `transfers` active is the only route to `active`. Otherwise the account is
 * `restricted` when the operator owes information or Stripe has disabled it
 * for a reason the operator must act on — card_payments and transfers are
 * coupled (if either is inactive Stripe disables both), so disabled_reason is
 * the cue whichever one failed — and `pending` while Stripe itself is
 * reviewing. A missing capability is never active. v1 has no closed state; a
 * deleted account fails to retrieve.
 */
export function mapV1AccountStatus(account: Stripe.Account): ConnectAccountStatus {
  const transfersStatus: TransfersCapabilityStatus =
    account.capabilities?.transfers ?? "absent";
  const requirements = account.requirements;
  const currentlyDue = requirements?.currently_due ?? [];
  const pastDue = requirements?.past_due ?? [];
  const eventuallyDue = requirements?.eventually_due ?? [];

  const disabledReason = requirements?.disabled_reason;
  const operatorOwes =
    currentlyDue.length > 0 ||
    pastDue.length > 0 ||
    (!!disabledReason && !STRIPE_REVIEW_REASONS.has(disabledReason));

  let status: ConnectStatus;
  if (transfersStatus === "active") {
    status = "active";
  } else if (operatorOwes) {
    status = "restricted";
  } else {
    status = "pending";
  }

  return {
    closed: false,
    status,
    transfersStatus,
    transfersEnabled: transfersStatus === "active",
    chargesEnabled: account.charges_enabled === true,
    payoutsEnabled: account.payouts_enabled === true,
    currentlyDue,
    pastDue,
    eventuallyDue,
  };
}

/**
 * The API a house's account was created with. Houses connected before the
 * field existed were all created on v1, so anything but exactly "v2" is v1.
 */
export function houseAccountApi(stored: unknown): ConnectAccountsApi {
  if (stored !== undefined && stored !== "v1" && stored !== "v2") {
    // Firestore rules keep clients out, so this is a server-side bug or a bad
    // backfill. Read as v1 regardless, but a v2 house mis-recorded here would
    // be unlinked without being closed, so make it visible.
    logger.warn("houses.stripeAccountApi has an unexpected value; reading as v1", {
      stored,
    });
  }
  return stored === "v2" ? "v2" : "v1";
}

/** Retrieve + map with the house's own API, which is what every call site wants. */
export async function fetchConnectAccountStatus(
  stripe: Stripe,
  accountId: string,
  api: ConnectAccountsApi,
): Promise<ConnectAccountStatus> {
  if (api === "v1") {
    return mapV1AccountStatus(await stripe.accounts.retrieve(accountId));
  }
  return mapRecipientAccountStatus(
    await retrieveRecipientAccount(stripe, accountId),
  );
}
