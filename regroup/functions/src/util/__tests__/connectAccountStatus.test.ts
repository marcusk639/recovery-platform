/**
 * connectAccountStatus.test.ts
 *
 * The one place the v2 recipient capability is translated into this service's
 * `active | pending | restricted` house status. These tests pin the translation
 * itself; the call sites are tested where they live.
 */

import type Stripe from "stripe";
import {
  RECIPIENT_ACCOUNT_INCLUDE,
  fetchConnectAccountStatus,
  mapRecipientAccountStatus,
} from "../connectAccountStatus";

type TransfersStatus = "active" | "pending" | "restricted" | "unsupported";

/** Minimal v2 account with the recipient transfers capability at `status`. */
function accountWithTransfers(
  status: TransfersStatus,
  statusDetails: Array<Record<string, unknown>> = [],
): Stripe.V2.Core.Account {
  return {
    id: "acct_v2_1",
    object: "v2.core.account",
    applied_configurations: ["recipient"],
    created: "2026-01-01T00:00:00Z",
    livemode: false,
    configuration: {
      recipient: {
        applied: true,
        capabilities: {
          stripe_balance: {
            stripe_transfers: { status, status_details: statusDetails },
          },
        },
      },
    },
  } as unknown as Stripe.V2.Core.Account;
}

/** v2 account with no `configuration` — what a retrieve without `include` returns. */
function accountWithoutConfiguration(): Stripe.V2.Core.Account {
  return {
    id: "acct_v2_bare",
    object: "v2.core.account",
    applied_configurations: ["recipient"],
    created: "2026-01-01T00:00:00Z",
    livemode: false,
  } as unknown as Stripe.V2.Core.Account;
}

function withRequirementEntries(
  account: Stripe.V2.Core.Account,
  entries: Array<{ description: string; deadline: string }>,
): Stripe.V2.Core.Account {
  return {
    ...account,
    requirements: {
      entries: entries.map((e) => ({
        awaiting_action_from: "user",
        description: e.description,
        errors: [],
        impact: {},
        minimum_deadline: { status: e.deadline },
        requested_reasons: [],
      })),
    },
  } as unknown as Stripe.V2.Core.Account;
}

describe("mapRecipientAccountStatus", () => {
  it("maps an active stripe_transfers capability to active and transfersEnabled", () => {
    const result = mapRecipientAccountStatus(accountWithTransfers("active"));

    expect(result.status).toBe("active");
    expect(result.transfersStatus).toBe("active");
    expect(result.transfersEnabled).toBe(true);
  });

  it("maps a pending capability to pending and not enabled", () => {
    const result = mapRecipientAccountStatus(accountWithTransfers("pending"));

    expect(result.status).toBe("pending");
    expect(result.transfersEnabled).toBe(false);
  });

  it("maps a restricted capability to restricted", () => {
    const result = mapRecipientAccountStatus(
      accountWithTransfers("restricted", [
        { code: "requirements_past_due", resolution: "provide_info" },
      ]),
    );

    expect(result.status).toBe("restricted");
    expect(result.transfersEnabled).toBe(false);
  });

  it("maps an unsupported capability to restricted, never to active", () => {
    const result = mapRecipientAccountStatus(
      accountWithTransfers("unsupported"),
    );

    expect(result.status).toBe("restricted");
    expect(result.transfersEnabled).toBe(false);
  });

  it("reports pending, not active, when the configuration is absent", () => {
    // A retrieve that forgot `include` returns no configuration at all. The
    // fail-safe direction is to withhold `active`: a wrongly-active house gets
    // a failed transfer, a wrongly-pending house is merely blocked and recovers
    // on the next sync.
    const result = mapRecipientAccountStatus(accountWithoutConfiguration());

    expect(result.status).toBe("pending");
    expect(result.transfersStatus).toBe("absent");
    expect(result.transfersEnabled).toBe(false);
  });

  it("splits requirement entries by minimum_deadline status", () => {
    const result = mapRecipientAccountStatus(
      withRequirementEntries(accountWithTransfers("restricted"), [
        { description: "Business address", deadline: "currently_due" },
        { description: "Government ID", deadline: "past_due" },
        { description: "Bank account", deadline: "eventually_due" },
      ]),
    );

    expect(result.currentlyDue).toEqual(["Business address"]);
    expect(result.pastDue).toEqual(["Government ID"]);
    expect(result.eventuallyDue).toEqual(["Bank account"]);
  });

  it("returns empty requirement lists when the account has no requirements", () => {
    const result = mapRecipientAccountStatus(accountWithTransfers("active"));

    expect(result.currentlyDue).toEqual([]);
    expect(result.pastDue).toEqual([]);
    expect(result.eventuallyDue).toEqual([]);
  });

  it("reports an open account as not closed", () => {
    const result = mapRecipientAccountStatus(accountWithTransfers("active"));

    expect(result.closed).toBe(false);
  });

  it("never reports a closed account as active, whatever its capability says", () => {
    // A closed v2 account is still retrievable (closed: true) rather than
    // resource_missing, and Stripe permits no operations on it. Its last
    // capability status is history, not a promise that transfers will land.
    const result = mapRecipientAccountStatus({
      ...accountWithTransfers("active"),
      closed: true,
    } as Stripe.V2.Core.Account);

    expect(result.closed).toBe(true);
    expect(result.status).not.toBe("active");
    expect(result.transfersEnabled).toBe(false);
  });
});

describe("fetchConnectAccountStatus", () => {
  it("retrieves through v2.core.accounts with the recipient configuration included", async () => {
    // Without `include` Stripe omits `configuration`, which is the only place
    // the capability status lives — so the include is load-bearing, not cosmetic.
    const retrieve = jest
      .fn()
      .mockResolvedValue(accountWithTransfers("active"));
    const stripe = {
      v2: { core: { accounts: { retrieve } } },
    } as unknown as Stripe;

    const result = await fetchConnectAccountStatus(stripe, "acct_v2_1");

    expect(retrieve).toHaveBeenCalledWith("acct_v2_1", {
      include: RECIPIENT_ACCOUNT_INCLUDE,
    });
    expect(RECIPIENT_ACCOUNT_INCLUDE).toEqual(
      expect.arrayContaining(["configuration.recipient", "requirements"]),
    );
    expect(result.status).toBe("active");
  });

  it("does not fall back to the v1 accounts resource", async () => {
    const v1Retrieve = jest.fn();
    const stripe = {
      accounts: { retrieve: v1Retrieve },
      v2: {
        core: {
          accounts: {
            retrieve: jest.fn().mockResolvedValue(accountWithTransfers("active")),
          },
        },
      },
    } as unknown as Stripe;

    await fetchConnectAccountStatus(stripe, "acct_v2_1");

    expect(v1Retrieve).not.toHaveBeenCalled();
  });
});
