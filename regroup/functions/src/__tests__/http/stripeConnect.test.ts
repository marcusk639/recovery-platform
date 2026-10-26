/**
 * Unit tests for src/http/stripeConnect.ts and src/http/universal.ts
 *
 * Mock strategy:
 *   - stripe: mocked at module level — handlers instantiate `new Stripe(...)` inline,
 *     so the constructor mock intercepts them.
 *   - firebase-admin: lightweight Firestore mock.
 *   - firebase-functions/v2/https: onRequest unwrapped to return the raw handler.
 *   - firebase-functions/params: defineSecret is a no-op string stub.
 *   - firebase-functions: logger is silenced.
 */

// ---------------------------------------------------------------------------
// Stripe mock state
// ---------------------------------------------------------------------------
const mockAccountLinksCreate = jest.fn();
const mockAccountsRetrieve = jest.fn();
const mockV2AccountsRetrieve = jest.fn();

jest.mock("stripe", () => {
  return jest.fn().mockImplementation(() => ({
    accountLinks: { create: mockAccountLinksCreate },
    accounts: { retrieve: mockAccountsRetrieve },
    v2: { core: { accounts: { retrieve: mockV2AccountsRetrieve } } },
  }));
});

/** A v2 recipient account with the transfers capability at `status`. */
function v2RecipientAccount(
  id: string,
  transfersStatus: "active" | "pending" | "restricted" | "unsupported",
  requirementEntries: Array<{ description: string; deadline: string }> = [],
): Record<string, unknown> {
  return {
    id,
    object: "v2.core.account",
    applied_configurations: ["recipient"],
    configuration: {
      recipient: {
        applied: true,
        capabilities: {
          stripe_balance: {
            stripe_transfers: { status: transfersStatus, status_details: [] },
          },
        },
      },
    },
    requirements: {
      entries: requirementEntries.map((e) => ({
        awaiting_action_from: "user",
        description: e.description,
        errors: [],
        minimum_deadline: { status: e.deadline },
        requested_reasons: [],
      })),
    },
  };
}

// ---------------------------------------------------------------------------
// firebase-admin mock
// ---------------------------------------------------------------------------
const mockFirestoreUpdate = jest.fn().mockResolvedValue(undefined);
const mockFirestoreDocRef = {
  update: mockFirestoreUpdate,
  set: jest.fn().mockResolvedValue(undefined),
};

let mockQuerySnap: {
  empty: boolean;
  docs: Array<{
    id: string;
    ref: typeof mockFirestoreDocRef;
    data: () => Record<string, any>;
  }>;
} = { empty: true, docs: [] };

const mockCollectionFn = jest.fn();

jest.mock("firebase-admin", () => ({
  initializeApp: jest.fn(),
  firestore: jest.fn(() => ({
    collection: mockCollectionFn,
  })),
}));

// ---------------------------------------------------------------------------
// firebase-functions/v2/https mock — unwrap onRequest
// ---------------------------------------------------------------------------
jest.mock("firebase-functions/v2/https", () => {
  const actual = jest.requireActual("firebase-functions/v2/https");
  return {
    ...actual,
    onRequest: jest.fn((_optsOrHandler: any, handler?: any) => {
      if (typeof _optsOrHandler === "function") return _optsOrHandler;
      // Recorded on globalThis: onRequest runs at import time, before any
      // beforeEach jest.clearAllMocks() could wipe calls recorded on the mock.
      ((globalThis as any).__connectOnRequestOptions ??= []).push(_optsOrHandler);
      return handler;
    }),
  };
});

// ---------------------------------------------------------------------------
// firebase-functions/params mock
// ---------------------------------------------------------------------------
jest.mock("firebase-functions/params", () => ({
  defineSecret: jest.fn((name: string) => name),
}));

// ---------------------------------------------------------------------------
// firebase-functions mock — silence logger
// ---------------------------------------------------------------------------
jest.mock("firebase-functions", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Imports — after all mocks
// ---------------------------------------------------------------------------
import {
  stripeConnectReauth,
  stripeConnectReturn,
} from "../../http/stripeConnect";
import { universal } from "../../http/universal";

// ---------------------------------------------------------------------------
// req / res factories
// ---------------------------------------------------------------------------
const makeReq = (
  query: Record<string, string> = {},
  options: Partial<{ method: string; path: string }> = {},
) => ({
  method: options.method ?? "GET",
  path: options.path ?? "/",
  headers: {},
  query,
  protocol: "https",
  hostname: "us-central1-myapp.cloudfunctions.net",
  rawBody: Buffer.from(""),
  body: {},
});

const makeRes = () => {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.send = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.redirect = jest.fn(() => res);
  return res;
};

// Re-wire the Firestore collection mock so the `houses` ownership lookup
// resolves to `snap`. The handlers verify the stripeAccountId maps to a known
// house before calling Stripe, so happy-path tests must seed a matching house.
const seedHouseQuery = (snap: typeof mockQuerySnap) => {
  mockQuerySnap = snap;
  mockCollectionFn.mockImplementation((_col: string) => ({
    where: jest.fn().mockReturnValue({
      limit: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue(mockQuerySnap),
      }),
    }),
    doc: jest.fn().mockReturnValue(mockFirestoreDocRef),
  }));
};

const matchingHouse = (stripeAccountId: string) => ({
  empty: false,
  docs: [
    {
      id: "house_1",
      ref: mockFirestoreDocRef,
      data: () => ({ stripeAccountId }),
    },
  ],
});

// ---------------------------------------------------------------------------
// Reset between tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  jest.clearAllMocks();
  mockQuerySnap = { empty: true, docs: [] };

  mockCollectionFn.mockImplementation((_col: string) => ({
    where: jest.fn().mockReturnValue({
      limit: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue(mockQuerySnap),
      }),
    }),
    doc: jest.fn().mockReturnValue(mockFirestoreDocRef),
  }));

  process.env.STRIPE_SECRET_KEY = "sk_test_fake";
  // Required: the redirect paths are Hosting rewrites, so connectBaseUrl has
  // no origin to derive and refuses to guess. Setting it here runs the suite in
  // the deployed shape rather than the misconfigured one.
  process.env.CONNECT_BASE_URL = "https://regroup-app.test/connect";
});

// ===========================================================================
// stripeConnectReauth
// ===========================================================================

describe("stripeConnectReauth", () => {
  it("returns 400 when stripeAccountId query param is missing", async () => {
    const req = makeReq({});
    const res = makeRes();

    await (stripeConnectReauth as any)(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith(
      expect.stringContaining("Missing stripeAccountId"),
    );
  });

  it("redirects to Stripe onboarding URL when AccountLink is created successfully", async () => {
    const stripeAccountId = "acct_reauth_1";
    const onboardingUrl =
      "https://connect.stripe.com/setup/e/acct_reauth_1/abc123";

    mockAccountLinksCreate.mockResolvedValue({ url: onboardingUrl });
    seedHouseQuery(matchingHouse(stripeAccountId));

    const req = makeReq({ stripeAccountId });
    const res = makeRes();

    await (stripeConnectReauth as any)(req, res);

    expect(mockAccountLinksCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        account: stripeAccountId,
        type: "account_onboarding",
      }),
    );
    expect(res.redirect).toHaveBeenCalledWith(303, onboardingUrl);
  });

  it("returns 404 when no house matches the stripeAccountId", async () => {
    // mockQuerySnap stays empty (default) — unknown account.
    const req = makeReq({ stripeAccountId: "acct_unknown" });
    const res = makeRes();

    await (stripeConnectReauth as any)(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockAccountLinksCreate).not.toHaveBeenCalled();
  });

  it("returns 500 when Stripe accountLinks.create throws", async () => {
    mockAccountLinksCreate.mockRejectedValue(new Error("Stripe API error"));
    seedHouseQuery(matchingHouse("acct_err"));

    const req = makeReq({ stripeAccountId: "acct_err" });
    const res = makeRes();

    await (stripeConnectReauth as any)(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.send).toHaveBeenCalledWith(
      expect.stringContaining("Failed to generate"),
    );
  });

  it("includes the stripeAccountId in both refresh_url and return_url", async () => {
    const stripeAccountId = "acct_url_check";
    mockAccountLinksCreate.mockResolvedValue({
      url: "https://stripe.com/setup",
    });
    seedHouseQuery(matchingHouse(stripeAccountId));

    const req = makeReq({ stripeAccountId });
    const res = makeRes();

    await (stripeConnectReauth as any)(req, res);

    expect(mockAccountLinksCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        refresh_url: expect.stringContaining(stripeAccountId),
        return_url: expect.stringContaining("stripe-return"),
      }),
    );
  });

  it("ignores a spoofed Host header when building the redirect URLs", async () => {
    // This endpoint is unauthenticated, so the Host header is attacker-supplied.
    // If it reached refresh_url / return_url, Stripe would send the house
    // operator to the attacker's origin after onboarding.
    const stripeAccountId = "acct_host_spoof";
    mockAccountLinksCreate.mockResolvedValue({
      url: "https://stripe.com/setup",
    });
    seedHouseQuery(matchingHouse(stripeAccountId));

    const req = {
      ...makeReq({ stripeAccountId }),
      protocol: "https",
      hostname: "evil.example.com",
      headers: { host: "evil.example.com" },
    };
    const res = makeRes();

    await (stripeConnectReauth as any)(req, res);

    const params = mockAccountLinksCreate.mock.calls[0][0];
    expect(params.refresh_url).not.toContain("evil.example.com");
    expect(params.return_url).not.toContain("evil.example.com");
    // Asserting the configured origin, not merely non-attacker.
    expect(params.refresh_url).toMatch(
      /^https:\/\/regroup-app\.test\/connect\/stripe-refresh\?/,
    );
  });

  it("refuses to build a redirect URL when CONNECT_BASE_URL is unset", async () => {
    // Failing loudly beats handing Stripe a URL that 404s: the operator meets
    // it after submitting bank details, on a redirect we never see.
    const saved = { override: process.env.CONNECT_BASE_URL };
    delete process.env.CONNECT_BASE_URL;

    const stripeAccountId = "acct_no_project";
    seedHouseQuery(matchingHouse(stripeAccountId));
    const res = makeRes();
    await (stripeConnectReauth as any)(makeReq({ stripeAccountId }), res);

    expect(mockAccountLinksCreate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);

    if (saved.override !== undefined)
      process.env.CONNECT_BASE_URL = saved.override;
  });

  it("uses CONNECT_BASE_URL when set, for a custom domain or preview deploy", async () => {
    const saved = process.env.CONNECT_BASE_URL;
    process.env.CONNECT_BASE_URL = "https://connect.example.org/";

    const stripeAccountId = "acct_override";
    mockAccountLinksCreate.mockResolvedValue({ url: "https://stripe.com/s" });
    seedHouseQuery(matchingHouse(stripeAccountId));
    await (stripeConnectReauth as any)(
      makeReq({ stripeAccountId }),
      makeRes(),
    );

    const params = mockAccountLinksCreate.mock.calls[0][0];
    // Trailing slash stripped, so the path is not doubled.
    expect(params.refresh_url).toBe(
      `https://connect.example.org/stripe-refresh?stripeAccountId=${stripeAccountId}`,
    );

    if (saved === undefined) delete process.env.CONNECT_BASE_URL;
    else process.env.CONNECT_BASE_URL = saved;
  });
});

// ===========================================================================
// stripeConnectReturn
// ===========================================================================

describe("stripeConnectReturn", () => {
  /** The page is read-only: it must never call Stripe or write Firestore. */
  const expectNoSideEffects = () => {
    expect(mockV2AccountsRetrieve).not.toHaveBeenCalled();
    expect(mockAccountsRetrieve).not.toHaveBeenCalled();
    expect(mockFirestoreUpdate).not.toHaveBeenCalled();
  };

  const renderFor = async (
    stripeStatus: string | undefined,
    opts: { house?: boolean; accountId?: string } = {},
  ): Promise<string> => {
    const { house = true, accountId = "acct_return" } = opts;
    seedHouseQuery(
      house
        ? {
            empty: false,
            docs: [
              {
                id: "house_return",
                ref: mockFirestoreDocRef,
                data: () => ({ stripeAccountId: accountId, stripeStatus }),
                get: (field: string) =>
                  field === "stripeStatus" ? stripeStatus : undefined,
              } as never,
            ],
          }
        : { empty: true, docs: [] },
    );
    const res = makeRes();
    await (stripeConnectReturn as any)(makeReq({ stripeAccountId: accountId }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    return res.send.mock.calls[0][0] as string;
  };

  it("never writes to Firestore or calls Stripe", async () => {
    // The endpoint is unauthenticated and stripeAccountId is readable by any
    // resident of the house, so a write here is an unauthenticated write
    // primitive plus unbounded Stripe calls against a chosen house.
    await renderFor("active");
    expectNoSideEffects();
  });

  it("reports payouts enabled only when the status is active", async () => {
    const body = await renderFor("active");
    expect(body).toContain("can now receive rent");
    expectNoSideEffects();
  });

  it("does not claim completion when the account is restricted", async () => {
    // Stripe redirects here whenever the flow ends, including abandonment. A
    // restricted account then fails the rent-collection gate, so telling the
    // operator they are finished is the worst possible message.
    const body = await renderFor("restricted");
    expect(body).toContain("needs more information");
    expect(body).not.toContain("complete");
    expect(body).not.toContain("can now receive rent");
  });

  it("does not claim completion when the account is pending", async () => {
    const body = await renderFor("pending");
    expect(body).toContain("verifying");
    expect(body).not.toContain("complete");
    expect(body).not.toContain("can now receive rent");
  });

  it("falls back to a neutral message when the status is unknown", async () => {
    // Three indistinguishable cases: no status yet because the webhook has not
    // landed, no house matching the id, and no id on the request at all.
    for (const body of [
      await renderFor(undefined),
      await renderFor(undefined, { house: false }),
    ]) {
      expect(body).toContain("Finishing setup");
      expect(body).not.toContain("can now receive rent");
    }

    const res = makeRes();
    await (stripeConnectReturn as any)(makeReq({}), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send.mock.calls[0][0]).toContain("Finishing setup");
    expectNoSideEffects();
  });

  it("still returns 200 when the house lookup throws", async () => {
    mockCollectionFn.mockImplementation(() => {
      throw new Error("firestore unavailable");
    });
    const res = makeRes();
    await (stripeConnectReturn as any)(
      makeReq({ stripeAccountId: "acct_boom" }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send.mock.calls[0][0]).toContain("Finishing setup");
  });
});

describe("universal", () => {
  it("returns 200 with status:ok on /health", async () => {
    const req = makeReq({}, { path: "/health" });
    const res = makeRes();

    await (universal as any)(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: "ok" }),
    );
  });

  it("returns 200 with status:ok on /healthz", async () => {
    const req = makeReq({}, { path: "/healthz" });
    const res = makeRes();

    await (universal as any)(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: "ok" }),
    );
  });

  it("returns 404 for unrecognised paths", async () => {
    const req = makeReq({}, { path: "/unknown-path" });
    const res = makeRes();

    await (universal as any)(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Not found" }),
    );
  });

  it("includes the requested path in the 404 response body", async () => {
    const req = makeReq({}, { path: "/some/deep/path" });
    const res = makeRes();

    await (universal as any)(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/some/deep/path" }),
    );
  });

  it("includes a timestamp in the health-check response", async () => {
    const req = makeReq({}, { path: "/health" });
    const res = makeRes();

    await (universal as any)(req, res);

    const responseArg = res.json.mock.calls[0][0];
    expect(typeof responseArg.timestamp).toBe("string");
    expect(new Date(responseArg.timestamp).toISOString()).toBe(
      responseArg.timestamp,
    );
  });
});

describe("Connect redirect handlers — public invoker", () => {
  // Stripe sends a house operator's browser to these URLs, unauthenticated. With
  // no allUsers invoker on the Cloud Run service the browser gets 403 before the
  // handler runs (stripeConnectReauth did, through 2026-10-26).
  it("stripeConnectReauth and stripeConnectReturn both declare invoker: public", () => {
    const opts = ((globalThis as any).__connectOnRequestOptions ?? []) as Array<{
      invoker?: unknown;
    }>;
    expect(opts).toHaveLength(2);
    for (const o of opts) expect(o.invoker).toBe("public");
  });
});
