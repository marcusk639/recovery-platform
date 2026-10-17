import type Stripe from "stripe";

/**
 * The ONE translation from a Stripe Accounts v2 recipient account to this
 * service's house-level Connect status.
 *
 * Houses are Accounts v2 *recipient* accounts: they only ever receive
 * /v1/transfers from the platform's destination charges. They never charge
 * anyone. The v1 fields `charges_enabled` and `payouts_enabled` are therefore
 * the wrong signal — a recipient can be fully able to receive transfers while
 * `charges_enabled` is false, and every site that gated on those fields could
 * block rent collection on a perfectly good house. The authoritative signal is
 *
 *   configuration.recipient.capabilities.stripe_balance.stripe_transfers.status
 *
 * which Stripe only returns when the retrieve asks for it via `include`.
 *
 * Every caller must go through here. The same mapping duplicated across call
 * sites is exactly what produced the bug this replaces.
 */

/** House status values derivable from a live Stripe account. */
export type ConnectStatus = "active" | "pending" | "restricted";

/**
 * Raw capability status, plus `absent` for the case where Stripe returned no
 * recipient configuration at all (a retrieve without `include`, or an account
 * that has no recipient configuration applied).
 */
export type TransfersCapabilityStatus =
  | "active"
  | "pending"
  | "restricted"
  | "unsupported"
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
    currentlyDue: requirementDescriptions(account, "currently_due"),
    pastDue: requirementDescriptions(account, "past_due"),
    eventuallyDue: requirementDescriptions(account, "eventually_due"),
  };
}

/** Retrieve + map, which is what every call site actually wants. */
export async function fetchConnectAccountStatus(
  stripe: Stripe,
  accountId: string,
): Promise<ConnectAccountStatus> {
  return mapRecipientAccountStatus(
    await retrieveRecipientAccount(stripe, accountId),
  );
}
