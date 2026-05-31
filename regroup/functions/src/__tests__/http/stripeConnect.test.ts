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

jest.mock("stripe", () => {
  return jest.fn().mockImplementation(() => ({
    accountLinks: { create: mockAccountLinksCreate },
    accounts: { retrieve: mockAccountsRetrieve },
  }));
});

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
  docs: Array<{ id: string; ref: typeof mockFirestoreDocRef; data: () => Record<string, any> }>;
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
    onRequest: jest.fn((_optsOrHandler: any, handler?: any) =>
      typeof _optsOrHandler === "function" ? _optsOrHandler : handler
    ),
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
import { stripeConnectReauth, stripeConnectReturn } from "../../http/stripeConnect";
import { universal } from "../../http/universal";

// ---------------------------------------------------------------------------
// req / res factories
// ---------------------------------------------------------------------------
const makeReq = (
  query: Record<string, string> = {},
  options: Partial<{ method: string; path: string }> = {}
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
    expect(res.send).toHaveBeenCalledWith(expect.stringContaining("Missing stripeAccountId"));
  });

  it("redirects to Stripe onboarding URL when AccountLink is created successfully", async () => {
    const stripeAccountId = "acct_reauth_1";
    const onboardingUrl = "https://connect.stripe.com/setup/e/acct_reauth_1/abc123";

    mockAccountLinksCreate.mockResolvedValue({ url: onboardingUrl });

    const req = makeReq({ stripeAccountId });
    const res = makeRes();

    await (stripeConnectReauth as any)(req, res);

    expect(mockAccountLinksCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        account: stripeAccountId,
        type: "account_onboarding",
      })
    );
    expect(res.redirect).toHaveBeenCalledWith(303, onboardingUrl);
  });

  it("returns 500 when Stripe accountLinks.create throws", async () => {
    mockAccountLinksCreate.mockRejectedValue(new Error("Stripe API error"));

    const req = makeReq({ stripeAccountId: "acct_err" });
    const res = makeRes();

    await (stripeConnectReauth as any)(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.send).toHaveBeenCalledWith(expect.stringContaining("Failed to generate"));
  });

  it("includes the stripeAccountId in both refresh_url and return_url", async () => {
    const stripeAccountId = "acct_url_check";
    mockAccountLinksCreate.mockResolvedValue({ url: "https://stripe.com/setup" });

    const req = makeReq({ stripeAccountId });
    const res = makeRes();

    await (stripeConnectReauth as any)(req, res);

    expect(mockAccountLinksCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        refresh_url: expect.stringContaining(stripeAccountId),
        return_url: expect.stringContaining("stripeConnectReturn"),
      })
    );
  });
});

// ===========================================================================
// stripeConnectReturn
// ===========================================================================

describe("stripeConnectReturn", () => {
  it("returns 200 with success HTML when stripeAccountId is missing", async () => {
    const req = makeReq({});
    const res = makeRes();

    await (stripeConnectReturn as any)(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const sentBody: string = res.send.mock.calls[0][0];
    expect(sentBody).toContain("Stripe setup complete");
  });

  it("syncs account status to Firestore and returns 200 when account is fully active", async () => {
    const stripeAccountId = "acct_return_1";

    mockAccountsRetrieve.mockResolvedValue({
      id: stripeAccountId,
      charges_enabled: true,
      payouts_enabled: true,
      requirements: { currently_due: [], disabled_reason: null },
    });

    mockQuerySnap = {
      empty: false,
      docs: [{ id: "house_return_1", ref: mockFirestoreDocRef, data: () => ({ stripeAccountId }) }],
    };

    // Re-wire collection with the updated snap
    mockCollectionFn.mockImplementation((_col: string) => ({
      where: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(mockQuerySnap),
        }),
      }),
      doc: jest.fn().mockReturnValue(mockFirestoreDocRef),
    }));

    const req = makeReq({ stripeAccountId });
    const res = makeRes();

    await (stripeConnectReturn as any)(req, res);

    expect(mockAccountsRetrieve).toHaveBeenCalledWith(stripeAccountId);
    expect(mockFirestoreUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeStatus: "active",
        stripeChargesEnabled: true,
        stripePayoutsEnabled: true,
      })
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("sets stripeStatus to restricted when requirements are currently due", async () => {
    const stripeAccountId = "acct_restricted_return";

    mockAccountsRetrieve.mockResolvedValue({
      id: stripeAccountId,
      charges_enabled: false,
      payouts_enabled: false,
      requirements: {
        currently_due: ["individual.id_number"],
        disabled_reason: "requirements.past_due",
      },
    });

    mockQuerySnap = {
      empty: false,
      docs: [{ id: "house_restricted", ref: mockFirestoreDocRef, data: () => ({}) }],
    };

    mockCollectionFn.mockImplementation((_col: string) => ({
      where: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(mockQuerySnap),
        }),
      }),
      doc: jest.fn().mockReturnValue(mockFirestoreDocRef),
    }));

    const req = makeReq({ stripeAccountId });
    const res = makeRes();

    await (stripeConnectReturn as any)(req, res);

    expect(mockFirestoreUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ stripeStatus: "restricted" })
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("sets stripeStatus to pending when account has no requirements yet", async () => {
    const stripeAccountId = "acct_pending_return";

    mockAccountsRetrieve.mockResolvedValue({
      id: stripeAccountId,
      charges_enabled: false,
      payouts_enabled: false,
      requirements: { currently_due: [], disabled_reason: null },
    });

    mockQuerySnap = {
      empty: false,
      docs: [{ id: "house_pending", ref: mockFirestoreDocRef, data: () => ({}) }],
    };

    mockCollectionFn.mockImplementation((_col: string) => ({
      where: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(mockQuerySnap),
        }),
      }),
      doc: jest.fn().mockReturnValue(mockFirestoreDocRef),
    }));

    const req = makeReq({ stripeAccountId });
    const res = makeRes();

    await (stripeConnectReturn as any)(req, res);

    expect(mockFirestoreUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ stripeStatus: "pending" })
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("still returns 200 success HTML even when Stripe API throws during sync", async () => {
    const stripeAccountId = "acct_err_return";

    mockAccountsRetrieve.mockRejectedValue(new Error("Stripe API timeout"));

    const req = makeReq({ stripeAccountId });
    const res = makeRes();

    await (stripeConnectReturn as any)(req, res);

    // Non-fatal — should still return success page
    expect(res.status).toHaveBeenCalledWith(200);
    const sentBody: string = res.send.mock.calls[0][0];
    expect(sentBody).toContain("Stripe setup complete");
  });

  it("returns 200 and skips Firestore update when no house is found for account", async () => {
    const stripeAccountId = "acct_no_house";

    mockAccountsRetrieve.mockResolvedValue({
      id: stripeAccountId,
      charges_enabled: true,
      payouts_enabled: true,
      requirements: { currently_due: [], disabled_reason: null },
    });

    // mockQuerySnap remains empty (default from beforeEach)

    const req = makeReq({ stripeAccountId });
    const res = makeRes();

    await (stripeConnectReturn as any)(req, res);

    expect(mockFirestoreUpdate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ===========================================================================
// universal HTTP handler
// ===========================================================================

describe("universal", () => {
  it("returns 200 with status:ok on /health", async () => {
    const req = makeReq({}, { path: "/health" });
    const res = makeRes();

    await (universal as any)(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: "ok" })
    );
  });

  it("returns 200 with status:ok on /healthz", async () => {
    const req = makeReq({}, { path: "/healthz" });
    const res = makeRes();

    await (universal as any)(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: "ok" })
    );
  });

  it("returns 404 for unrecognised paths", async () => {
    const req = makeReq({}, { path: "/unknown-path" });
    const res = makeRes();

    await (universal as any)(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Not found" })
    );
  });

  it("includes the requested path in the 404 response body", async () => {
    const req = makeReq({}, { path: "/some/deep/path" });
    const res = makeRes();

    await (universal as any)(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/some/deep/path" })
    );
  });

  it("includes a timestamp in the health-check response", async () => {
    const req = makeReq({}, { path: "/health" });
    const res = makeRes();

    await (universal as any)(req, res);

    const responseArg = res.json.mock.calls[0][0];
    expect(typeof responseArg.timestamp).toBe("string");
    expect(new Date(responseArg.timestamp).toISOString()).toBe(responseArg.timestamp);
  });
});
