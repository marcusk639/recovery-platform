/**
 * payments.test.ts
 *
 * Comprehensive unit tests for all Stripe Cloud Functions.
 *
 * Mocking strategy:
 *   - firebase-functions: mocked so config() returns fake keys and onCall
 *     passes the handler through directly so we can call it as a plain function.
 *     HttpsError is kept real via jest.requireActual so instanceof checks work.
 *   - firebase-admin: mocked with an in-memory Firestore implementation.
 *   - stripe: mocked at the module level; real Stripe error classes are
 *     preserved via jest.requireActual so `instanceof Stripe.errors.StripeError`
 *     checks inside the Cloud Functions still work.
 */

// ── Real Stripe errors ────────────────────────────────────────────────────────
// Captured before any mocking so we can instantiate them in tests.
// We go through unknown to bypass the TypeScript declaration for `stripe`,
// which doesn't publicly expose `.errors` at the module level.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const StripeModule = jest.requireActual("stripe") as unknown as Record<
  string,
  unknown
>;
const StripeErrors = StripeModule["errors"] as Record<
  string,
  new (raw: Record<string, unknown>) => Error
>;

// ── Mock: firebase-functions/v2/https ────────────────────────────────────────
// src/api/ files now import onCall and HttpsError from firebase-functions/v2/https.
// The v2 onCall handler receives a single CallableRequest object { data, auth }.
// Tests call functions with the v1 pattern: fn(data, context) where context = { auth }.
// This wrapper bridges the two: when the returned function is called as fn(data, context),
// it constructs a v2-style request object and passes it to the real handler.
jest.mock("firebase-functions/v2/https", () => {
  const actual = jest.requireActual("firebase-functions/v2/https");
  return {
    ...actual,
    // Handle both onCall(handler) and onCall(options, handler) signatures.
    onCall: (
      handlerOrOptions: unknown,
      maybeHandler?: (request: unknown) => unknown,
    ) => {
      const handler =
        typeof handlerOrOptions === "function"
          ? (handlerOrOptions as (request: unknown) => unknown)
          : maybeHandler!;
      return (data: unknown, context: unknown) =>
        handler({ data, auth: (context as any)?.auth ?? null });
    },
  };
});

// ── Mock: firebase-functions ─────────────────────────────────────────────────
jest.mock("firebase-functions", () => {
  const actual = jest.requireActual("firebase-functions");
  return {
    ...actual,
    config: () => ({
      stripe: {
        secret_key: "sk_test_fake",
        client_id: "ca_fake",
      },
    }),
    https: {
      ...actual.https,
      // Pass the handler through so we can invoke it as a regular async function.
      onCall: (handler: (...args: unknown[]) => unknown) => handler,
    },
  };
});

// ── In-memory Firestore store ─────────────────────────────────────────────────

const firestoreDocStore: Record<string, Record<string, unknown>> = {};

// mockFirestoreImpl is defined with the `mock` prefix so Jest allows it inside
// jest.mock factory functions (which are hoisted before other declarations).
// api/payments.ts initialises `const db = admin.firestore()` at module load
// time, so we must return a real object from the very first call — we do that
// by returning this mutable impl that wireFirestore() populates before each test.
const mockFirestoreImpl: {
  collection: (col: string) => unknown;
  runTransaction: jest.Mock;
} = {
  collection: (_col: string) => ({
    doc: (_id: string) => ({
      get: jest.fn(async () => ({ exists: false, data: () => undefined })),
      update: jest.fn(),
      set: jest.fn(),
      collection: jest.fn(() => ({ doc: jest.fn() })),
    }),
  }),
  runTransaction: jest.fn(),
};

/** Shape returned by makeDocRef — explicit to break the recursive inference loop. */
interface MockDocRef {
  get: jest.Mock;
  update: jest.Mock;
  set: jest.Mock;
  collection: jest.Mock;
}

/**
 * Global flag that controls what the in-document `.collection('guests')` sub-collection
 * query returns when testing guest membership. Set via `setGuestQueryEmpty()`.
 */
let _guestQueryEmpty = true;

/** Build a Firestore DocumentReference-like mock for a given document path. */
function makeDocRef(path: string): MockDocRef {
  return {
    get: jest.fn(async () => {
      const data = firestoreDocStore[path];
      return { exists: !!data, data: () => data ?? undefined };
    }),
    update: jest.fn(async (fields: Record<string, unknown>) => {
      const existing = firestoreDocStore[path] ?? {};
      const next: Record<string, unknown> = { ...existing };
      for (const [key, val] of Object.entries(fields)) {
        if (
          val !== null &&
          typeof val === "object" &&
          (val as { _methodName?: string })._methodName === "FieldValue.delete"
        ) {
          delete next[key];
        } else {
          next[key] = val;
        }
      }
      firestoreDocStore[path] = next;
    }),
    set: jest.fn(async (fields: Record<string, unknown>, _opts?: unknown) => {
      firestoreDocStore[path] = {
        ...(firestoreDocStore[path] ?? {}),
        ...fields,
      };
    }),
    collection: jest.fn((sub: string) => ({
      doc: jest.fn((subId: string) => makeDocRef(`${path}/${sub}/${subId}`)),
      where: jest.fn(() => ({
        limit: jest.fn(() => ({
          // Use the module-level flag so tests can control guest query results.
          get: jest.fn(async () => ({ empty: _guestQueryEmpty })),
        })),
      })),
    })),
  };
}

// ── Firestore transaction mock ────────────────────────────────────────────────

const mockRunTransaction = jest.fn(
  async (updateFn: (tx: unknown) => Promise<unknown>) => {
    const writes: Array<() => void> = [];
    const tx = {
      get: jest.fn(async (ref: MockDocRef) => ref.get()),
      update: jest.fn((ref: MockDocRef, fields: Record<string, unknown>) => {
        writes.push(() => ref.update(fields));
      }),
    };
    const result = await updateFn(tx);
    for (const w of writes) w();
    return result;
  },
);

// ── Mock: firebase-admin ──────────────────────────────────────────────────────

const deleteFieldSentinel = { _methodName: "FieldValue.delete" };

jest.mock("firebase-admin", () => ({
  initializeApp: jest.fn(),
  app: jest.fn(() => ({})),
  firestore: Object.assign(
    jest.fn(() => mockFirestoreImpl),
    {
      FieldValue: {
        delete: jest.fn(() => deleteFieldSentinel),
      },
    },
  ),
  auth: jest.fn(() => ({ getUser: jest.fn() })),
}));

// ── Mock: api/firestore getUser (caller's own record for ownership checks) ─────
const mockGetUser = jest.fn();
jest.mock("../api/firestore", () => ({
  ...(jest.requireActual("../api/firestore") as object),
  getUser: (...args: unknown[]) => mockGetUser(...args),
}));

// ── Mock: stripe ──────────────────────────────────────────────────────────────

const mockStripeAccountsCreate = jest.fn();
const mockStripeAccountsDel = jest.fn();
const mockStripeAccountsRetrieve = jest.fn();
// Accounts v2 (stripe.v2.core.accounts) — houses are v2 recipient accounts.
const mockStripeV2AccountsCreate = jest.fn();
const mockStripeV2AccountsRetrieve = jest.fn();
const mockStripeV2AccountsClose = jest.fn();
const mockStripeAccountLinksCreate = jest.fn();
const mockStripeOAuthDeauthorize = jest.fn();
const mockStripePaymentIntentsCreate = jest.fn();
const mockStripeChargesList = jest.fn();
const mockStripePaymentMethodsRetrieve = jest.fn();
const mockStripePaymentMethodsAttach = jest.fn();
const mockStripeCustomersUpdate = jest.fn();
const mockStripeCustomersRetrieve = jest.fn();

jest.mock("stripe", () => {
  // Preserve the real error classes so our production code's `instanceof` checks work.
  const RealStripeModule = jest.requireActual("stripe") as unknown as Record<
    string,
    unknown
  >;

  const MockStripe = jest.fn().mockImplementation(() => ({
    accounts: {
      create: mockStripeAccountsCreate,
      del: mockStripeAccountsDel,
      retrieve: mockStripeAccountsRetrieve,
    },
    v2: {
      core: {
        accounts: {
          create: mockStripeV2AccountsCreate,
          retrieve: mockStripeV2AccountsRetrieve,
          close: mockStripeV2AccountsClose,
        },
      },
    },
    accountLinks: { create: mockStripeAccountLinksCreate },
    oauth: { deauthorize: mockStripeOAuthDeauthorize },
    paymentIntents: { create: mockStripePaymentIntentsCreate },
    charges: { list: mockStripeChargesList },
    paymentMethods: {
      retrieve: mockStripePaymentMethodsRetrieve,
      attach: mockStripePaymentMethodsAttach,
    },
    customers: {
      update: mockStripeCustomersUpdate,
      retrieve: mockStripeCustomersRetrieve,
    },
  }));

  // Attach the real errors namespace so that `Stripe.errors.StripeError` etc. work.
  (MockStripe as unknown as Record<string, unknown>).errors =
    RealStripeModule["errors"];

  return MockStripe;
});

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import * as functions from "firebase-functions";
import { HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import {
  connectStripeAccount,
  disconnectStripeAccount,
  getStripeAccountStatus,
  createPaymentIntent,
  listPayments,
} from "../callable/payments";

// ── Helper: make Firestore return value ───────────────────────────────────────

/**
 * Wire the admin.firestore() mock to return a Firestore-like object that uses
 * the in-memory store.  Call this in beforeEach so the mock is freshly wired.
 *
 * @param guestQueryEmpty  Controls what `.where().limit().get()` returns when
 *                         the guest membership sub-collection is queried.
 *                         Defaults to true (no guest found).
 */
function wireFirestore(guestQueryEmpty = true): void {
  _guestQueryEmpty = guestQueryEmpty;
  // Mutate mockFirestoreImpl so that both the module-level `db` (set at import
  // time in api/payments.ts) and any inline admin.firestore() calls in the
  // other functions all use the same in-memory store.
  mockFirestoreImpl.collection = (col: string) => ({
    doc: (id: string) => makeDocRef(`${col}/${id}`),
  });
  mockFirestoreImpl.runTransaction = mockRunTransaction;
}

// ── Test utilities ────────────────────────────────────────────────────────────

const authedContext = (uid = "user-123") => ({ auth: { uid, token: {} } });
const unauthContext = { auth: null };

/**
 * A house with a Stripe account records which Accounts API created it. Most
 * suites here were written for the Accounts v2 path, so a seeded account is v2
 * unless the test says otherwise; v1 suites pass `stripeAccountApi: "v1"`, and
 * pass it as `undefined` to model a house connected before the field existed.
 */
function seedHouse(houseId: string, data: Record<string, unknown>): void {
  const withApi =
    data.stripeAccountId !== undefined && !("stripeAccountApi" in data)
      ? { ...data, stripeAccountApi: "v2" }
      : data;
  firestoreDocStore[`houses/${houseId}`] = { ...withApi };
}

function readHouse(houseId: string): Record<string, unknown> | undefined {
  return firestoreDocStore[`houses/${houseId}`];
}

/** `guests` is a TOP-LEVEL collection — the doc is the authority on houseId. */
function seedGuest(guestId: string, data: Record<string, unknown>): void {
  firestoreDocStore[`guests/${guestId}`] = { ...data };
}

async function expectHttpsError(
  fn: () => Promise<unknown>,
  code: functions.https.FunctionsErrorCode,
): Promise<void> {
  try {
    await fn();
    throw new Error(
      "Expected HttpsError but function resolved without throwing",
    );
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      err.message ===
        "Expected HttpsError but function resolved without throwing"
    ) {
      throw err;
    }
    // Accept both v1 and v2 HttpsError classes
    const isHttpsError =
      err instanceof HttpsError || err instanceof functions.https.HttpsError;
    expect(isHttpsError).toBe(true);
    expect((err as HttpsError).code).toBe(code);
  }
}

// ── Create Stripe error instances ─────────────────────────────────────────────

function makeStripeError(
  ErrorClass: new (raw: Record<string, unknown>) => Error,
  message: string,
  type: string,
  extra: Record<string, unknown> = {},
): Error {
  return new ErrorClass({ message, type, ...extra });
}

// ── Accounts v2 fixtures ──────────────────────────────────────────────────────

/**
 * A v2 recipient account as `stripe.v2.core.accounts.retrieve(id, { include:
 * ['configuration.recipient', 'requirements'] })` returns it. The capability
 * status under configuration.recipient is the only authoritative signal for
 * whether the house can receive transfers.
 */
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

// ── Lifecycle ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  // Reset the in-memory store.
  for (const key of Object.keys(firestoreDocStore)) {
    delete firestoreDocStore[key];
  }

  jest.clearAllMocks();

  // Wire Firestore mock (guest queries empty by default).
  wireFirestore(true);

  // Default happy-path Stripe responses.
  mockStripeAccountsCreate.mockResolvedValue({ id: "acct_new123" });
  mockStripeAccountsDel.mockResolvedValue({ deleted: true });
  mockStripeV2AccountsCreate.mockResolvedValue({ id: "acct_new123" });
  mockStripeV2AccountsClose.mockResolvedValue({ id: "acct_new123" });
  mockStripeV2AccountsRetrieve.mockResolvedValue(
    v2RecipientAccount("acct_existing", "active"),
  );
  mockStripeAccountLinksCreate.mockResolvedValue({
    url: "https://connect.stripe.com/onboard",
  });
  mockStripeOAuthDeauthorize.mockResolvedValue({});
  mockStripeAccountsRetrieve.mockResolvedValue({
    id: "acct_existing",
    charges_enabled: true,
    payouts_enabled: true,
    requirements: { currently_due: [], past_due: [], eventually_due: [] },
    capabilities: { card_payments: "active", transfers: "active" },
  });
  mockStripePaymentIntentsCreate.mockResolvedValue({
    id: "pi_test",
    client_secret: "pi_test_secret_xyz",
  });
  mockStripeChargesList.mockResolvedValue({ data: [] });
  mockStripePaymentMethodsRetrieve.mockResolvedValue({
    id: "pm_test",
    type: "card",
    card: { last4: "4242", brand: "visa" },
  });
  mockStripePaymentMethodsAttach.mockResolvedValue({ id: "pm_test" });
  mockStripeCustomersUpdate.mockResolvedValue({ id: "cus_test" });
});

// ══════════════════════════════════════════════════════════════════════════════
// connectStripeAccount
// ══════════════════════════════════════════════════════════════════════════════

describe("connectStripeAccount", () => {
  const HOUSE_ID = "house-connect-1";
  const ADMIN_UID = "admin-uid-1";

  // returnUrl / refreshUrl must use an allowed origin (open-redirect guard,
  // shared with the billing portal via safeReturnUrlSchema).
  const baseData = {
    houseId: HOUSE_ID,
    returnUrl: "https://regroup-app.com/return",
    refreshUrl: "https://regroup-app.com/refresh",
  };

  // The suites below cover the Accounts v2 path; the v1 default has its own.
  beforeEach(() => {
    process.env.CONNECT_ACCOUNTS_API = "v2";
  });
  afterEach(() => {
    delete process.env.CONNECT_ACCOUNTS_API;
  });

  describe("auth and input validation", () => {
    it("throws unauthenticated when no auth context", async () => {
      await expectHttpsError(
        () =>
          (connectStripeAccount as unknown as Function)(
            baseData,
            unauthContext,
          ),
        "unauthenticated",
      );
    });

    it("throws invalid-argument when houseId is missing", async () => {
      seedHouse(HOUSE_ID, { adminId: ADMIN_UID });
      await expectHttpsError(
        () =>
          (connectStripeAccount as unknown as Function)(
            { returnUrl: "https://x.com", refreshUrl: "https://y.com" },
            authedContext(ADMIN_UID),
          ),
        "invalid-argument",
      );
    });

    it("falls back to hosted defaults when returnUrl is omitted", async () => {
      seedHouse(HOUSE_ID, {
        adminId: ADMIN_UID,
        stripeAccountId: "acct_existing_house",
      });
      process.env.CONNECT_BASE_URL = "https://regroup-app.test/connect";
      await (connectStripeAccount as unknown as Function)(
        { houseId: HOUSE_ID, refreshUrl: "https://regroup-app.com/refresh" },
        authedContext(ADMIN_UID),
      );
      expect(mockStripeAccountLinksCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          return_url:
            "https://regroup-app.test/connect/stripe-return",
          refresh_url: "https://regroup-app.com/refresh",
        }),
      );
    });

    it("falls back to hosted defaults when refreshUrl is omitted", async () => {
      seedHouse(HOUSE_ID, {
        adminId: ADMIN_UID,
        stripeAccountId: "acct_existing_house",
      });
      process.env.CONNECT_BASE_URL = "https://regroup-app.test/connect";
      await (connectStripeAccount as unknown as Function)(
        { houseId: HOUSE_ID, returnUrl: "https://regroup-app.com/return" },
        authedContext(ADMIN_UID),
      );
      expect(mockStripeAccountLinksCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          return_url: "https://regroup-app.com/return",
          refresh_url:
            "https://regroup-app.test/connect/stripe-refresh?stripeAccountId=acct_existing_house",
        }),
      );
    });

    it("falls back to hosted defaults when both URLs are omitted (mobile contract)", async () => {
      seedHouse(HOUSE_ID, {
        adminId: ADMIN_UID,
        stripeAccountId: "acct_existing_house",
      });
      process.env.CONNECT_BASE_URL = "https://regroup-app.test/connect";
      await (connectStripeAccount as unknown as Function)(
        { houseId: HOUSE_ID },
        authedContext(ADMIN_UID),
      );
      expect(mockStripeAccountLinksCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          return_url:
            "https://regroup-app.test/connect/stripe-return",
          refresh_url:
            "https://regroup-app.test/connect/stripe-refresh?stripeAccountId=acct_existing_house",
        }),
      );
    });

    it("throws invalid-argument when returnUrl uses a javascript: scheme", async () => {
      seedHouse(HOUSE_ID, { adminId: ADMIN_UID });
      await expectHttpsError(
        () =>
          (connectStripeAccount as unknown as Function)(
            { ...baseData, returnUrl: "javascript:alert(1)" },
            authedContext(ADMIN_UID),
          ),
        "invalid-argument",
      );
    });

    it("throws invalid-argument when refreshUrl uses a javascript: scheme", async () => {
      seedHouse(HOUSE_ID, { adminId: ADMIN_UID });
      await expectHttpsError(
        () =>
          (connectStripeAccount as unknown as Function)(
            { ...baseData, refreshUrl: "javascript:void(0)" },
            authedContext(ADMIN_UID),
          ),
        "invalid-argument",
      );
    });

    it("throws invalid-argument when returnUrl uses an off-allowlist origin", async () => {
      seedHouse(HOUSE_ID, { adminId: ADMIN_UID });
      await expectHttpsError(
        () =>
          (connectStripeAccount as unknown as Function)(
            { ...baseData, returnUrl: "https://evil.example.com/return" },
            authedContext(ADMIN_UID),
          ),
        "invalid-argument",
      );
    });

    it("throws invalid-argument when refreshUrl uses an off-allowlist origin", async () => {
      seedHouse(HOUSE_ID, { adminId: ADMIN_UID });
      await expectHttpsError(
        () =>
          (connectStripeAccount as unknown as Function)(
            { ...baseData, refreshUrl: "https://evil.example.com/refresh" },
            authedContext(ADMIN_UID),
          ),
        "invalid-argument",
      );
    });

    it("throws not-found when house document does not exist", async () => {
      await expectHttpsError(
        () =>
          (connectStripeAccount as unknown as Function)(
            baseData,
            authedContext(ADMIN_UID),
          ),
        "not-found",
      );
    });

    it("throws permission-denied when caller is not a house admin", async () => {
      seedHouse(HOUSE_ID, {
        adminId: "someone-else",
        adminIds: [],
        superAdminIds: [],
      });
      await expectHttpsError(
        () =>
          (connectStripeAccount as unknown as Function)(
            baseData,
            authedContext("non-admin-uid"),
          ),
        "permission-denied",
      );
    });

    it("allows a superAdminIds member to connect", async () => {
      seedHouse(HOUSE_ID, {
        adminId: "other",
        adminIds: [],
        superAdminIds: [ADMIN_UID],
      });
      const result = await (connectStripeAccount as unknown as Function)(
        baseData,
        authedContext(ADMIN_UID),
      );
      expect(result.url).toBe("https://connect.stripe.com/onboard");
    });

    it("allows the ownerId to connect", async () => {
      seedHouse(HOUSE_ID, {
        ownerId: ADMIN_UID,
        adminIds: [],
        superAdminIds: [],
      });
      const result = await (connectStripeAccount as unknown as Function)(
        baseData,
        authedContext(ADMIN_UID),
      );
      expect(result.url).toBe("https://connect.stripe.com/onboard");
    });
  });

  describe("house with no existing Stripe account", () => {
    beforeEach(() => seedHouse(HOUSE_ID, { adminId: ADMIN_UID }));

    it("creates an Accounts v2 recipient account, not a v1 Express account", async () => {
      await (connectStripeAccount as unknown as Function)(
        baseData,
        authedContext(ADMIN_UID),
      );
      expect(mockStripeAccountsCreate).not.toHaveBeenCalled();
      expect(mockStripeV2AccountsCreate).toHaveBeenCalledWith({
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
        metadata: { houseId: HOUSE_ID },
      });
    });

    it("does not request a merchant configuration or card_payments", async () => {
      // Houses only ever receive transfers. Requesting merchant capabilities
      // for a recipient lengthens onboarding for verification nobody needs.
      await (connectStripeAccount as unknown as Function)(
        baseData,
        authedContext(ADMIN_UID),
      );
      const params = mockStripeV2AccountsCreate.mock.calls[0][0] as {
        configuration?: Record<string, unknown>;
      };
      expect(params.configuration).not.toHaveProperty("merchant");
      expect(JSON.stringify(params)).not.toContain("card_payments");
    });

    it("keeps losses_collector on the application, which Express requires", async () => {
      // losses_collector: 'stripe' is a blocked combination with destination
      // charges, and outright rejected alongside the Express dashboard.
      await (connectStripeAccount as unknown as Function)(
        baseData,
        authedContext(ADMIN_UID),
      );
      const params = mockStripeV2AccountsCreate.mock.calls[0][0] as {
        defaults?: { responsibilities?: { losses_collector?: string } };
      };
      expect(params.defaults?.responsibilities?.losses_collector).toBe(
        "application",
      );
    });

    it("saves stripeAccountId and sets stripeStatus to pending", async () => {
      await (connectStripeAccount as unknown as Function)(
        baseData,
        authedContext(ADMIN_UID),
      );
      const house = readHouse(HOUSE_ID);
      expect(house?.stripeAccountId).toBe("acct_new123");
      expect(house?.stripeStatus).toBe("pending");
      expect(house?.stripeAccountApi).toBe("v2");
    });

    it("creates an account link with correct parameters", async () => {
      await (connectStripeAccount as unknown as Function)(
        baseData,
        authedContext(ADMIN_UID),
      );
      expect(mockStripeAccountLinksCreate).toHaveBeenCalledWith({
        account: "acct_new123",
        refresh_url: baseData.refreshUrl,
        return_url: baseData.returnUrl,
        type: "account_onboarding",
      });
    });

    it("returns the onboarding URL", async () => {
      const result = await (connectStripeAccount as unknown as Function)(
        baseData,
        authedContext(ADMIN_UID),
      );
      expect(result.url).toBe("https://connect.stripe.com/onboard");
    });
  });

  describe("house with an existing Stripe account", () => {
    beforeEach(() => {
      seedHouse(HOUSE_ID, {
        adminId: ADMIN_UID,
        stripeAccountId: "acct_existing123",
      });
    });

    it("does NOT create a new Stripe account", async () => {
      await (connectStripeAccount as unknown as Function)(
        baseData,
        authedContext(ADMIN_UID),
      );
      expect(mockStripeAccountsCreate).not.toHaveBeenCalled();
    });

    it("creates an account link for the existing account", async () => {
      await (connectStripeAccount as unknown as Function)(
        baseData,
        authedContext(ADMIN_UID),
      );
      expect(mockStripeAccountLinksCreate).toHaveBeenCalledWith({
        account: "acct_existing123",
        refresh_url: baseData.refreshUrl,
        return_url: baseData.returnUrl,
        type: "account_onboarding",
      });
    });

    it("returns the onboarding URL", async () => {
      const result = await (connectStripeAccount as unknown as Function)(
        baseData,
        authedContext(ADMIN_UID),
      );
      expect(result.url).toBe("https://connect.stripe.com/onboard");
    });
  });

  describe("Accounts v1 — the default while Stripe has not enabled v2", () => {
    beforeEach(() => {
      delete process.env.CONNECT_ACCOUNTS_API;
    });

    it("creates a v1 account from controller properties, not a legacy type or a v2 account", async () => {
      seedHouse(HOUSE_ID, { adminId: ADMIN_UID });

      await (connectStripeAccount as unknown as Function)(
        baseData,
        authedContext(ADMIN_UID),
      );

      // The Express-equivalent controller properties for a destination-charge
      // recipient whose losses the platform carries. card_payments is
      // requested alongside transfers because a v1 platform needs Stripe's
      // approval to request transfers on its own.
      expect(mockStripeAccountsCreate).toHaveBeenCalledWith({
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
        metadata: { houseId: HOUSE_ID },
      });
      expect(mockStripeAccountsCreate.mock.calls[0][0]).not.toHaveProperty("type");
      expect(mockStripeV2AccountsCreate).not.toHaveBeenCalled();
    });

    it("maps a rejected v1 create to an error and writes nothing", async () => {
      seedHouse(HOUSE_ID, { adminId: ADMIN_UID });
      mockStripeAccountsCreate.mockRejectedValue(
        makeStripeError(
          StripeErrors.StripeInvalidRequestError,
          "Your platform needs approval for accounts to have requested the `transfers` capability without the `card_payments` capability.",
          "invalid_request_error",
        ),
      );

      await expectHttpsError(
        () =>
          (connectStripeAccount as unknown as Function)(
            baseData,
            authedContext(ADMIN_UID),
          ),
        "invalid-argument",
      );
      expect(readHouse(HOUSE_ID)?.stripeAccountId).toBeUndefined();
      expect(readHouse(HOUSE_ID)?.stripeAccountApi).toBeUndefined();
    });

    it("deletes the new v1 account and fails cleanly when saving it fails", async () => {
      seedHouse(HOUSE_ID, { adminId: ADMIN_UID });
      mockRunTransaction.mockRejectedValueOnce(new Error("contention"));

      await expectHttpsError(
        () =>
          (connectStripeAccount as unknown as Function)(
            baseData,
            authedContext(ADMIN_UID),
          ),
        "internal",
      );
      expect(mockStripeAccountsDel).toHaveBeenCalledWith("acct_new123");
    });

    it("logs, and does not fail the request, when deleting a race-loser v1 account fails", async () => {
      seedHouse(HOUSE_ID, { adminId: ADMIN_UID });
      mockRunTransaction.mockImplementationOnce(
        async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            get: jest.fn(async () => ({
              data: () => ({ stripeAccountId: "acct_concurrently_created" }),
            })),
            update: jest.fn(),
          }),
      );
      mockStripeAccountsDel.mockRejectedValue(
        makeStripeError(StripeErrors.StripeAPIError, "Something exploded", "api_error"),
      );
      const errorSpy = jest
        .spyOn(functions.logger, "error")
        .mockImplementation(() => undefined);

      try {
        const result = await (connectStripeAccount as unknown as Function)(
          baseData,
          authedContext(ADMIN_UID),
        );

        expect(result.url).toBe("https://connect.stripe.com/onboard");
        expect(errorSpy).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ accountId: "acct_new123", api: "v1" }),
        );
      } finally {
        errorSpy.mockRestore();
      }
    });

    it("records that the house's account was created on v1", async () => {
      seedHouse(HOUSE_ID, { adminId: ADMIN_UID });

      await (connectStripeAccount as unknown as Function)(
        baseData,
        authedContext(ADMIN_UID),
      );

      const house = readHouse(HOUSE_ID);
      expect(house?.stripeAccountId).toBe("acct_new123");
      expect(house?.stripeAccountApi).toBe("v1");
      expect(house?.stripeStatus).toBe("pending");
    });

    it("reuses an existing v1 account without asking the v2 API about it", async () => {
      // This platform rejects v1 accounts on v2 endpoints, so the v2 closed
      // check must never run for a v1 house.
      seedHouse(HOUSE_ID, {
        adminId: ADMIN_UID,
        stripeAccountId: "acct_v1_existing",
        stripeAccountApi: "v1",
      });
      mockStripeV2AccountsRetrieve.mockRejectedValue(
        new Error("v2 must not be called for a v1 house"),
      );

      await (connectStripeAccount as unknown as Function)(
        baseData,
        authedContext(ADMIN_UID),
      );

      expect(mockStripeV2AccountsRetrieve).not.toHaveBeenCalled();
      expect(mockStripeAccountsCreate).not.toHaveBeenCalled();
      expect(mockStripeAccountLinksCreate).toHaveBeenCalledWith(
        expect.objectContaining({ account: "acct_v1_existing" }),
      );
    });

    it("deletes its own brand-new v1 account when it loses the creation race", async () => {
      seedHouse(HOUSE_ID, { adminId: ADMIN_UID });
      mockRunTransaction.mockImplementationOnce(
        async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            get: jest.fn(async () => ({
              data: () => ({ stripeAccountId: "acct_concurrently_created" }),
            })),
            update: jest.fn(),
          }),
      );

      await (connectStripeAccount as unknown as Function)(
        baseData,
        authedContext(ADMIN_UID),
      );

      expect(mockStripeAccountsDel).toHaveBeenCalledWith("acct_new123");
      expect(mockStripeV2AccountsClose).not.toHaveBeenCalled();
    });
  });

  describe("house whose stored Stripe account has been closed", () => {
    // Closed in the Stripe Dashboard, or by a disconnect whose Firestore clear
    // never landed. A closed v2 account still retrieves (closed: true) but
    // accepts no operations, so reusing its id fails onboarding forever.
    beforeEach(() => {
      seedHouse(HOUSE_ID, {
        adminId: ADMIN_UID,
        stripeAccountId: "acct_closed",
        stripeStatus: "disconnected",
      });
      mockStripeV2AccountsRetrieve.mockResolvedValue({
        ...v2RecipientAccount("acct_closed", "active"),
        closed: true,
      });
    });

    it("creates a fresh recipient account instead of reusing the closed one", async () => {
      await (connectStripeAccount as unknown as Function)(
        baseData,
        authedContext(ADMIN_UID),
      );

      expect(mockStripeV2AccountsCreate).toHaveBeenCalledTimes(1);
      expect(readHouse(HOUSE_ID)?.stripeAccountId).toBe("acct_new123");
      expect(mockStripeAccountLinksCreate).toHaveBeenCalledWith(
        expect.objectContaining({ account: "acct_new123" }),
      );
    });

    it("does not close the fresh account as if it had lost a race", async () => {
      await (connectStripeAccount as unknown as Function)(
        baseData,
        authedContext(ADMIN_UID),
      );

      expect(mockStripeV2AccountsClose).not.toHaveBeenCalled();
    });
  });

  describe("Stripe API errors", () => {
    beforeEach(() => seedHouse(HOUSE_ID, { adminId: ADMIN_UID }));

    it("wraps StripeAPIError in an internal HttpsError", async () => {
      const err = makeStripeError(
        StripeErrors.StripeAPIError,
        "api exploded",
        "api_error",
      );
      mockStripeV2AccountsCreate.mockRejectedValue(err);
      await expectHttpsError(
        () =>
          (connectStripeAccount as unknown as Function)(
            baseData,
            authedContext(ADMIN_UID),
          ),
        "internal",
      );
    });

    it("wraps StripeRateLimitError in a resource-exhausted HttpsError", async () => {
      const err = makeStripeError(
        StripeErrors.StripeRateLimitError,
        "too many requests",
        "rate_limit_error",
      );
      mockStripeV2AccountsCreate.mockRejectedValue(err);
      await expectHttpsError(
        () =>
          (connectStripeAccount as unknown as Function)(
            baseData,
            authedContext(ADMIN_UID),
          ),
        "resource-exhausted",
      );
    });

    it("wraps accountLinks.create error in an internal HttpsError", async () => {
      // Use an existing account so we skip account creation and go straight to account link.
      seedHouse(HOUSE_ID, {
        adminId: ADMIN_UID,
        stripeAccountId: "acct_existing123",
      });
      const err = makeStripeError(
        StripeErrors.StripeAPIError,
        "link failed",
        "api_error",
      );
      mockStripeAccountLinksCreate.mockRejectedValue(err);
      await expectHttpsError(
        () =>
          (connectStripeAccount as unknown as Function)(
            baseData,
            authedContext(ADMIN_UID),
          ),
        "internal",
      );
    });
  });

  describe("race condition — concurrent account creation", () => {
    it("uses the already-saved accountId when the transaction sees a concurrent write", async () => {
      seedHouse(HOUSE_ID, { adminId: ADMIN_UID });

      // Simulate a concurrent write: the transaction's inner read returns a doc
      // that already has a stripeAccountId set by another process.
      mockRunTransaction.mockImplementationOnce(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            get: jest.fn(async () => ({
              data: () => ({ stripeAccountId: "acct_concurrently_created" }),
            })),
            update: jest.fn(),
          };
          return fn(tx);
        },
      );

      const result = await (connectStripeAccount as unknown as Function)(
        baseData,
        authedContext(ADMIN_UID),
      );

      // Should have created a link for the concurrently-created account.
      expect(mockStripeAccountLinksCreate).toHaveBeenCalledWith(
        expect.objectContaining({ account: "acct_concurrently_created" }),
      );
      expect(result.url).toBe("https://connect.stripe.com/onboard");

      // Our newly-created account (acct_new123) should have been closed to
      // prevent an orphaned Stripe account. v2 has no delete; close is the
      // analogue and must list every configuration the account carries.
      expect(mockStripeAccountsDel).not.toHaveBeenCalled();
      expect(mockStripeV2AccountsClose).toHaveBeenCalledWith("acct_new123", {
        applied_configurations: ["recipient"],
      });
    });

    it("logs the orphaned account id when cleaning it up fails", async () => {
      // Best-effort cleanup must still leave a trace: without the id nobody
      // can find the open account it left on the platform.
      seedHouse(HOUSE_ID, { adminId: ADMIN_UID });
      mockRunTransaction.mockImplementationOnce(
        async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            get: jest.fn(async () => ({
              data: () => ({ stripeAccountId: "acct_concurrently_created" }),
            })),
            update: jest.fn(),
          }),
      );
      mockStripeV2AccountsClose.mockRejectedValue(
        makeStripeError(
          StripeErrors.StripeAPIError,
          "Something exploded",
          "api_error",
        ),
      );
      const errorSpy = jest
        .spyOn(functions.logger, "error")
        .mockImplementation(() => undefined);

      try {
        await (connectStripeAccount as unknown as Function)(
          baseData,
          authedContext(ADMIN_UID),
        );

        expect(errorSpy).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ accountId: "acct_new123" }),
        );
      } finally {
        errorSpy.mockRestore();
      }
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// disconnectStripeAccount
// ══════════════════════════════════════════════════════════════════════════════

describe("disconnectStripeAccount", () => {
  const HOUSE_ID = "house-disconnect-1";
  const ADMIN_UID = "admin-uid-disconnect";

  describe("auth and input validation", () => {
    it("throws unauthenticated when no auth context", async () => {
      await expectHttpsError(
        () =>
          (disconnectStripeAccount as unknown as Function)(
            { houseId: HOUSE_ID },
            unauthContext,
          ),
        "unauthenticated",
      );
    });

    it("throws invalid-argument when houseId is missing", async () => {
      await expectHttpsError(
        () =>
          (disconnectStripeAccount as unknown as Function)(
            {},
            authedContext(ADMIN_UID),
          ),
        "invalid-argument",
      );
    });

    it("throws not-found when house does not exist", async () => {
      await expectHttpsError(
        () =>
          (disconnectStripeAccount as unknown as Function)(
            { houseId: HOUSE_ID },
            authedContext(ADMIN_UID),
          ),
        "not-found",
      );
    });

    it("throws permission-denied when caller is not a house admin", async () => {
      seedHouse(HOUSE_ID, {
        adminId: "someone-else",
        adminIds: [],
        superAdminIds: [],
      });
      await expectHttpsError(
        () =>
          (disconnectStripeAccount as unknown as Function)(
            { houseId: HOUSE_ID },
            authedContext("random-user"),
          ),
        "permission-denied",
      );
    });
  });

  describe("successful disconnect", () => {
    beforeEach(() => {
      seedHouse(HOUSE_ID, {
        adminId: ADMIN_UID,
        stripeAccountId: "acct_to_disconnect",
        stripeStatus: "active",
        stripeChargesEnabled: true,
        stripePayoutsEnabled: true,
      });
    });

    it("closes the v2 account instead of deauthorizing an OAuth connection", async () => {
      // oauth.deauthorize is for OAuth-connected Standard accounts and forces
      // Accounts v1. An API-created v2 recipient is closed, and close requires
      // every configuration the account carries — here 'recipient' alone.
      await (disconnectStripeAccount as unknown as Function)(
        { houseId: HOUSE_ID },
        authedContext(ADMIN_UID),
      );
      expect(mockStripeOAuthDeauthorize).not.toHaveBeenCalled();
      expect(mockStripeV2AccountsClose).toHaveBeenCalledWith(
        "acct_to_disconnect",
        { applied_configurations: ["recipient"] },
      );
    });

    it("clears stripeAccountId from the house document", async () => {
      await (disconnectStripeAccount as unknown as Function)(
        { houseId: HOUSE_ID },
        authedContext(ADMIN_UID),
      );
      // Our update mock removes keys that received the delete sentinel.
      expect(readHouse(HOUSE_ID)?.stripeAccountId).toBeUndefined();
    });

    it("sets stripeStatus to disconnected", async () => {
      await (disconnectStripeAccount as unknown as Function)(
        { houseId: HOUSE_ID },
        authedContext(ADMIN_UID),
      );
      expect(readHouse(HOUSE_ID)?.stripeStatus).toBe("disconnected");
    });

    it("sets stripeChargesEnabled and stripePayoutsEnabled to false", async () => {
      await (disconnectStripeAccount as unknown as Function)(
        { houseId: HOUSE_ID },
        authedContext(ADMIN_UID),
      );
      const house = readHouse(HOUSE_ID);
      expect(house?.stripeChargesEnabled).toBe(false);
      expect(house?.stripePayoutsEnabled).toBe(false);
    });

    it("returns { success: true }", async () => {
      const result = await (disconnectStripeAccount as unknown as Function)(
        { houseId: HOUSE_ID },
        authedContext(ADMIN_UID),
      );
      expect(result).toEqual({ success: true });
    });
  });

  describe("idempotent — house already has no stripeAccountId", () => {
    beforeEach(() => {
      seedHouse(HOUSE_ID, { adminId: ADMIN_UID, stripeStatus: "disconnected" });
    });

    it("does not call Stripe at all", async () => {
      await (disconnectStripeAccount as unknown as Function)(
        { houseId: HOUSE_ID },
        authedContext(ADMIN_UID),
      );
      expect(mockStripeOAuthDeauthorize).not.toHaveBeenCalled();
      expect(mockStripeV2AccountsClose).not.toHaveBeenCalled();
    });

    it("still returns { success: true }", async () => {
      const result = await (disconnectStripeAccount as unknown as Function)(
        { houseId: HOUSE_ID },
        authedContext(ADMIN_UID),
      );
      expect(result).toEqual({ success: true });
    });
  });

  describe("Accounts v1 house", () => {
    beforeEach(() => {
      seedHouse(HOUSE_ID, {
        adminId: ADMIN_UID,
        stripeAccountId: "acct_v1_house",
        stripeAccountApi: "v1",
        stripeStatus: "active",
      });
    });

    it("unlinks the house without deleting or closing its Stripe account", async () => {
      // Rent is a destination charge: refunds and disputes on past rent are
      // recovered by reversing the transfer from the house's account. Deleting
      // it would forfeit that, and live-mode deletion also fails outright
      // while the account holds any balance. So disconnect only unlinks.
      const result = await (disconnectStripeAccount as unknown as Function)(
        { houseId: HOUSE_ID },
        authedContext(ADMIN_UID),
      );

      expect(result).toEqual({ success: true });
      expect(mockStripeAccountsDel).not.toHaveBeenCalled();
      expect(mockStripeV2AccountsClose).not.toHaveBeenCalled();
      const house = readHouse(HOUSE_ID);
      expect(house?.stripeStatus).toBe("disconnected");
      expect(house?.stripeAccountId).toBeUndefined();
      expect(house?.stripeAccountApi).toBeUndefined();
    });
  });

  describe("Stripe close errors", () => {
    beforeEach(() => {
      seedHouse(HOUSE_ID, { adminId: ADMIN_UID, stripeAccountId: "acct_gone" });
    });

    it("does not treat message text alone as proof the account is gone", async () => {
      // The v1 tolerance matched wording like "No such account". v2 never
      // reports a missing account that way (an inaccessible id is a 403
      // forbidden), so the match could only misread some other refusal as
      // "gone" and clear a house whose Stripe account is still open.
      mockStripeV2AccountsClose.mockRejectedValue(
        makeStripeError(
          StripeErrors.StripeInvalidRequestError,
          "No such account: acct_gone",
          "invalid_request_error",
        ),
      );

      await expectHttpsError(
        () =>
          (disconnectStripeAccount as unknown as Function)(
            { houseId: HOUSE_ID },
            authedContext(ADMIN_UID),
          ),
        "invalid-argument",
      );
      expect(readHouse(HOUSE_ID)?.stripeAccountId).toBe("acct_gone");
    });

    it("succeeds when the account is gone by resource_missing rather than by message", async () => {
      // The v1 tolerance matched on message text. v2 is free to word a closed
      // or missing account differently, so the code has to be enough on its own.
      mockStripeV2AccountsClose.mockRejectedValue(
        makeStripeError(
          StripeErrors.StripeInvalidRequestError,
          "Account acct_gone could not be found.",
          "invalid_request_error",
          { code: "resource_missing" },
        ),
      );

      const result = await (disconnectStripeAccount as unknown as Function)(
        { houseId: HOUSE_ID },
        authedContext(ADMIN_UID),
      );
      expect(result).toEqual({ success: true });
      expect(readHouse(HOUSE_ID)?.stripeStatus).toBe("disconnected");
    });

    it("propagates unexpected Stripe errors as an internal HttpsError", async () => {
      const unexpected = makeStripeError(
        StripeErrors.StripeAPIError,
        "Something exploded",
        "api_error",
      );
      mockStripeV2AccountsClose.mockRejectedValue(unexpected);

      await expectHttpsError(
        () =>
          (disconnectStripeAccount as unknown as Function)(
            { houseId: HOUSE_ID },
            authedContext(ADMIN_UID),
          ),
        "internal",
      );
    });

    it("leaves Firestore untouched when the close fails unexpectedly", async () => {
      // Local state must not claim `disconnected` while Stripe still has a
      // live account the house is the destination for.
      mockStripeV2AccountsClose.mockRejectedValue(
        makeStripeError(
          StripeErrors.StripeAPIError,
          "Something exploded",
          "api_error",
        ),
      );

      await expectHttpsError(
        () =>
          (disconnectStripeAccount as unknown as Function)(
            { houseId: HOUSE_ID },
            authedContext(ADMIN_UID),
          ),
        "internal",
      );
      expect(readHouse(HOUSE_ID)?.stripeAccountId).toBe("acct_gone");
    });

    it("succeeds when the close fails because the account is already closed", async () => {
      // A closed v2 account still exists, so closing it again is not
      // resource_missing: Stripe refuses any operation on it. Without this, a
      // disconnect whose Firestore clear failed could never be retried.
      mockStripeV2AccountsClose.mockRejectedValue(
        makeStripeError(
          StripeErrors.StripeInvalidRequestError,
          "This account is closed.",
          "invalid_request_error",
        ),
      );
      mockStripeV2AccountsRetrieve.mockResolvedValue({
        ...v2RecipientAccount("acct_gone", "active"),
        closed: true,
      });

      const result = await (disconnectStripeAccount as unknown as Function)(
        { houseId: HOUSE_ID },
        authedContext(ADMIN_UID),
      );

      expect(result).toEqual({ success: true });
      expect(readHouse(HOUSE_ID)?.stripeStatus).toBe("disconnected");
      expect(readHouse(HOUSE_ID)?.stripeAccountId).toBeUndefined();
    });

    it("still fails when the close is refused and the account is not closed", async () => {
      mockStripeV2AccountsClose.mockRejectedValue(
        makeStripeError(
          StripeErrors.StripeInvalidRequestError,
          "Account has a non-zero balance.",
          "invalid_request_error",
        ),
      );
      mockStripeV2AccountsRetrieve.mockResolvedValue(
        v2RecipientAccount("acct_gone", "active"),
      );

      await expectHttpsError(
        () =>
          (disconnectStripeAccount as unknown as Function)(
            { houseId: HOUSE_ID },
            authedContext(ADMIN_UID),
          ),
        "invalid-argument",
      );
      expect(readHouse(HOUSE_ID)?.stripeAccountId).toBe("acct_gone");
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// getStripeAccountStatus
// ══════════════════════════════════════════════════════════════════════════════

describe("getStripeAccountStatus", () => {
  const HOUSE_ID = "house-status-1";
  const ADMIN_UID = "admin-uid-status";

  describe("auth and input validation", () => {
    it("throws unauthenticated when no auth context", async () => {
      await expectHttpsError(
        () =>
          (getStripeAccountStatus as unknown as Function)(
            { houseId: HOUSE_ID },
            unauthContext,
          ),
        "unauthenticated",
      );
    });

    it("throws invalid-argument when houseId is missing", async () => {
      await expectHttpsError(
        () =>
          (getStripeAccountStatus as unknown as Function)(
            {},
            authedContext(ADMIN_UID),
          ),
        "invalid-argument",
      );
    });

    it("throws not-found when house does not exist", async () => {
      await expectHttpsError(
        () =>
          (getStripeAccountStatus as unknown as Function)(
            { houseId: HOUSE_ID },
            authedContext(ADMIN_UID),
          ),
        "not-found",
      );
    });

    it("throws permission-denied when caller is not a member", async () => {
      seedHouse(HOUSE_ID, {
        adminId: "other",
        adminIds: [],
        superAdminIds: [],
      });
      await expectHttpsError(
        () =>
          (getStripeAccountStatus as unknown as Function)(
            { houseId: HOUSE_ID },
            authedContext("not-a-member"),
          ),
        "permission-denied",
      );
    });
  });

  describe("no stripeAccountId on house", () => {
    it("returns status not_connected without calling Stripe", async () => {
      seedHouse(HOUSE_ID, { adminId: ADMIN_UID });

      const result = await (getStripeAccountStatus as unknown as Function)(
        { houseId: HOUSE_ID },
        authedContext(ADMIN_UID),
      );

      expect(result.status).toBe("not_connected");
      expect(result.chargesEnabled).toBe(false);
      expect(result.payoutsEnabled).toBe(false);
      expect(mockStripeAccountsRetrieve).not.toHaveBeenCalled();
      expect(mockStripeV2AccountsRetrieve).not.toHaveBeenCalled();
    });
  });

  describe("active account mapping", () => {
    beforeEach(() => {
      seedHouse(HOUSE_ID, {
        adminId: ADMIN_UID,
        stripeAccountId: "acct_active",
      });
      // Deliberately charges_enabled: false. A recipient account never takes
      // charges, so the v1 pair is false on a perfectly good house; gating on
      // it is what could block rent collection.
      mockStripeV2AccountsRetrieve.mockResolvedValue({
        ...v2RecipientAccount("acct_active", "active"),
        charges_enabled: false,
        payouts_enabled: false,
      });
      // Make the v1 resource unusable, so a lingering v1 read cannot quietly
      // produce the right answer from the wrong source.
      mockStripeAccountsRetrieve.mockRejectedValue(
        new Error("v1 accounts.retrieve must not be used for a v2 account"),
      );
    });

    it("reads the account through v2.core.accounts with the recipient configuration included", async () => {
      await (getStripeAccountStatus as unknown as Function)(
        { houseId: HOUSE_ID },
        authedContext(ADMIN_UID),
      );
      expect(mockStripeAccountsRetrieve).not.toHaveBeenCalled();
      expect(mockStripeV2AccountsRetrieve).toHaveBeenCalledWith("acct_active", {
        include: ["configuration.recipient", "requirements"],
      });
    });

    it("maps an active stripe_transfers capability to active despite charges_enabled=false", async () => {
      const result = await (getStripeAccountStatus as unknown as Function)(
        { houseId: HOUSE_ID },
        authedContext(ADMIN_UID),
      );
      expect(result.status).toBe("active");
    });

    it("reports chargesEnabled/payoutsEnabled from the transfers capability", async () => {
      // Kept for the mobile client, whose two capability rows read these. For a
      // recipient account both mean the same thing: transfers can land.
      const result = await (getStripeAccountStatus as unknown as Function)(
        { houseId: HOUSE_ID },
        authedContext(ADMIN_UID),
      );
      expect(result.chargesEnabled).toBe(true);
      expect(result.payoutsEnabled).toBe(true);
    });

    it("syncs status back to Firestore", async () => {
      await (getStripeAccountStatus as unknown as Function)(
        { houseId: HOUSE_ID },
        authedContext(ADMIN_UID),
      );
      expect(readHouse(HOUSE_ID)?.stripeStatus).toBe("active");
    });

    it("returns the capabilities map", async () => {
      const result = await (getStripeAccountStatus as unknown as Function)(
        { houseId: HOUSE_ID },
        authedContext(ADMIN_UID),
      );
      expect(result.capabilities).toEqual({ stripe_transfers: "active" });
    });
  });

  describe("restricted account mapping", () => {
    beforeEach(() => {
      seedHouse(HOUSE_ID, {
        adminId: ADMIN_UID,
        stripeAccountId: "acct_restricted",
      });
      mockStripeV2AccountsRetrieve.mockResolvedValue(
        v2RecipientAccount("acct_restricted", "restricted", [
          { description: "individual.ssn_last_4", deadline: "currently_due" },
          { description: "external_account", deadline: "currently_due" },
        ]),
      );
    });

    it("maps a restricted stripe_transfers capability to restricted", async () => {
      const result = await (getStripeAccountStatus as unknown as Function)(
        { houseId: HOUSE_ID },
        authedContext(ADMIN_UID),
      );
      expect(result.status).toBe("restricted");
    });

    it("includes currentlyDue in requirements", async () => {
      const result = await (getStripeAccountStatus as unknown as Function)(
        { houseId: HOUSE_ID },
        authedContext(ADMIN_UID),
      );
      expect(result.requirements.currentlyDue).toEqual([
        "individual.ssn_last_4",
        "external_account",
      ]);
    });

    it("syncs restricted status and requirements to Firestore", async () => {
      await (getStripeAccountStatus as unknown as Function)(
        { houseId: HOUSE_ID },
        authedContext(ADMIN_UID),
      );
      const house = readHouse(HOUSE_ID);
      expect(house?.stripeStatus).toBe("restricted");
      expect(house?.stripeRequirements).toEqual([
        "individual.ssn_last_4",
        "external_account",
      ]);
    });
  });

  describe("pending account mapping (no requirements)", () => {
    beforeEach(() => {
      seedHouse(HOUSE_ID, {
        adminId: ADMIN_UID,
        stripeAccountId: "acct_pending",
      });
      mockStripeV2AccountsRetrieve.mockResolvedValue(
        v2RecipientAccount("acct_pending", "pending"),
      );
    });

    it("maps a pending stripe_transfers capability to pending", async () => {
      const result = await (getStripeAccountStatus as unknown as Function)(
        { houseId: HOUSE_ID },
        authedContext(ADMIN_UID),
      );
      expect(result.status).toBe("pending");
    });
  });

  describe("Stripe account no longer exists", () => {
    beforeEach(() => {
      seedHouse(HOUSE_ID, {
        adminId: ADMIN_UID,
        stripeAccountId: "acct_deleted",
      });
      mockStripeV2AccountsRetrieve.mockRejectedValue(
        makeStripeError(
          StripeErrors.StripeInvalidRequestError,
          "Account acct_deleted could not be found.",
          "invalid_request_error",
          { code: "resource_missing" },
        ),
      );
    });

    it("returns status disconnected", async () => {
      const result = await (getStripeAccountStatus as unknown as Function)(
        { houseId: HOUSE_ID },
        authedContext(ADMIN_UID),
      );
      expect(result.status).toBe("disconnected");
    });

    it("syncs disconnected status to Firestore", async () => {
      await (getStripeAccountStatus as unknown as Function)(
        { houseId: HOUSE_ID },
        authedContext(ADMIN_UID),
      );
      expect(readHouse(HOUSE_ID)?.stripeStatus).toBe("disconnected");
    });

    it("does not disconnect the house when Stripe refuses access rather than reporting it missing", async () => {
      // What v2 actually returns for an id the key cannot see (wrong key, wrong
      // mode, wrong platform): 403 forbidden. That says nothing about whether
      // the house's account exists, so it must surface, not stop rent.
      seedHouse(HOUSE_ID, {
        adminId: ADMIN_UID,
        stripeAccountId: "acct_deleted",
        stripeStatus: "active",
      });
      mockStripeV2AccountsRetrieve.mockRejectedValue(
        makeStripeError(
          StripeErrors.StripePermissionError,
          "Permission denied. API Key does not have permission to access account.",
          "invalid_request_error",
          { code: "forbidden" },
        ),
      );

      await expect(
        (getStripeAccountStatus as unknown as Function)(
          { houseId: HOUSE_ID },
          authedContext(ADMIN_UID),
        ),
      ).rejects.toBeInstanceOf(HttpsError);
      expect(readHouse(HOUSE_ID)?.stripeStatus).toBe("active");
    });

    it("does not treat message text alone as proof the account is gone", async () => {
      seedHouse(HOUSE_ID, {
        adminId: ADMIN_UID,
        stripeAccountId: "acct_deleted",
        stripeStatus: "active",
      });
      mockStripeV2AccountsRetrieve.mockRejectedValue(
        makeStripeError(
          StripeErrors.StripeInvalidRequestError,
          "No such account: acct_deleted",
          "invalid_request_error",
        ),
      );

      await expect(
        (getStripeAccountStatus as unknown as Function)(
          { houseId: HOUSE_ID },
          authedContext(ADMIN_UID),
        ),
      ).rejects.toBeInstanceOf(HttpsError);
      expect(readHouse(HOUSE_ID)?.stripeStatus).toBe("active");
    });
  });

  describe("Accounts v1 house", () => {
    const v1Account = (overrides: Record<string, unknown> = {}) => ({
      id: "acct_v1_house",
      object: "account",
      charges_enabled: false,
      payouts_enabled: true,
      capabilities: { card_payments: "active", transfers: "active" },
      requirements: {
        currently_due: [],
        past_due: [],
        eventually_due: [],
        disabled_reason: null,
      },
      ...overrides,
    });

    beforeEach(() => {
      mockStripeV2AccountsRetrieve.mockRejectedValue(
        new Error("v2 must not be used for a v1 house"),
      );
    });

    it("reads the account through the v1 resource and gates on the transfers capability", async () => {
      seedHouse(HOUSE_ID, {
        adminId: ADMIN_UID,
        stripeAccountId: "acct_v1_house",
        stripeAccountApi: "v1",
      });
      mockStripeAccountsRetrieve.mockResolvedValue(v1Account());

      const result = await (getStripeAccountStatus as unknown as Function)(
        { houseId: HOUSE_ID },
        authedContext(ADMIN_UID),
      );

      expect(mockStripeAccountsRetrieve).toHaveBeenCalledWith("acct_v1_house");
      expect(result.status).toBe("active");
      expect(result.chargesEnabled).toBe(false);
      expect(result.payoutsEnabled).toBe(true);
      expect(readHouse(HOUSE_ID)?.stripeStatus).toBe("active");
    });

    it("syncs a restricted v1 account with every requirement bucket", async () => {
      seedHouse(HOUSE_ID, {
        adminId: ADMIN_UID,
        stripeAccountId: "acct_v1_house",
        stripeAccountApi: "v1",
        stripeStatus: "active",
      });
      mockStripeAccountsRetrieve.mockResolvedValue(
        v1Account({
          capabilities: { card_payments: "inactive", transfers: "inactive" },
          payouts_enabled: false,
          requirements: {
            currently_due: ["individual.ssn_last_4"],
            past_due: ["external_account"],
            eventually_due: ["individual.id_number"],
            disabled_reason: "requirements.past_due",
          },
        }),
      );

      const result = await (getStripeAccountStatus as unknown as Function)(
        { houseId: HOUSE_ID },
        authedContext(ADMIN_UID),
      );

      expect(result.status).toBe("restricted");
      expect(result.requirements).toEqual({
        currentlyDue: ["individual.ssn_last_4"],
        pastDue: ["external_account"],
      });
      const house = readHouse(HOUSE_ID);
      expect(house?.stripeStatus).toBe("restricted");
      expect(house?.stripeRequirements).toEqual(
        expect.arrayContaining([
          "individual.ssn_last_4",
          "external_account",
          "individual.id_number",
        ]),
      );
    });

    it("syncs a v1 account Stripe is still reviewing as pending", async () => {
      seedHouse(HOUSE_ID, {
        adminId: ADMIN_UID,
        stripeAccountId: "acct_v1_house",
        stripeAccountApi: "v1",
      });
      mockStripeAccountsRetrieve.mockResolvedValue(
        v1Account({
          capabilities: { card_payments: "pending", transfers: "pending" },
          requirements: {
            currently_due: [],
            past_due: [],
            eventually_due: [],
            disabled_reason: "requirements.pending_verification",
          },
        }),
      );

      const result = await (getStripeAccountStatus as unknown as Function)(
        { houseId: HOUSE_ID },
        authedContext(ADMIN_UID),
      );

      expect(result.status).toBe("pending");
      expect(readHouse(HOUSE_ID)?.stripeStatus).toBe("pending");
    });

    it("treats a house connected before the API was recorded as v1", async () => {
      seedHouse(HOUSE_ID, {
        adminId: ADMIN_UID,
        stripeAccountId: "acct_v1_house",
        stripeAccountApi: undefined,
      });
      mockStripeAccountsRetrieve.mockResolvedValue(v1Account());

      const result = await (getStripeAccountStatus as unknown as Function)(
        { houseId: HOUSE_ID },
        authedContext(ADMIN_UID),
      );

      expect(result.status).toBe("active");
      expect(mockStripeV2AccountsRetrieve).not.toHaveBeenCalled();
    });

    it("surfaces account_invalid instead of disconnecting the house", async () => {
      // Stripe returns 403 account_invalid both for a deleted v1 account and
      // for a key that cannot see it, so it is not proof the account is gone.
      seedHouse(HOUSE_ID, {
        adminId: ADMIN_UID,
        stripeAccountId: "acct_v1_house",
        stripeAccountApi: "v1",
        stripeStatus: "active",
      });
      mockStripeAccountsRetrieve.mockRejectedValue(
        makeStripeError(
          StripeErrors.StripePermissionError,
          "The provided key does not have access to account (or that account does not exist).",
          "invalid_request_error",
          { code: "account_invalid" },
        ),
      );

      await expect(
        (getStripeAccountStatus as unknown as Function)(
          { houseId: HOUSE_ID },
          authedContext(ADMIN_UID),
        ),
      ).rejects.toBeInstanceOf(HttpsError);
      expect(readHouse(HOUSE_ID)?.stripeStatus).toBe("active");
    });
  });

  describe("Stripe account has been closed", () => {
    beforeEach(() => {
      seedHouse(HOUSE_ID, {
        adminId: ADMIN_UID,
        stripeAccountId: "acct_closed",
        stripeStatus: "active",
      });
      // Its last capability status still reads active; closed must win.
      mockStripeV2AccountsRetrieve.mockResolvedValue({
        ...v2RecipientAccount("acct_closed", "active"),
        closed: true,
      });
    });

    it("returns disconnected rather than the stale capability status", async () => {
      const result = await (getStripeAccountStatus as unknown as Function)(
        { houseId: HOUSE_ID },
        authedContext(ADMIN_UID),
      );

      expect(result.status).toBe("disconnected");
      expect(result.chargesEnabled).toBe(false);
      expect(result.payoutsEnabled).toBe(false);
    });

    it("syncs disconnected to Firestore so rent collection stops", async () => {
      await (getStripeAccountStatus as unknown as Function)(
        { houseId: HOUSE_ID },
        authedContext(ADMIN_UID),
      );

      expect(readHouse(HOUSE_ID)?.stripeStatus).toBe("disconnected");
    });
  });

  describe("unexpected Stripe error", () => {
    it("propagates as an internal HttpsError", async () => {
      seedHouse(HOUSE_ID, { adminId: ADMIN_UID, stripeAccountId: "acct_boom" });
      const boom = makeStripeError(
        StripeErrors.StripeAPIError,
        "internal stripe boom",
        "api_error",
      );
      mockStripeV2AccountsRetrieve.mockRejectedValue(boom);

      await expectHttpsError(
        () =>
          (getStripeAccountStatus as unknown as Function)(
            { houseId: HOUSE_ID },
            authedContext(ADMIN_UID),
          ),
        "internal",
      );
    });
  });

  describe("guest member access", () => {
    it("allows a house guest to read account status", async () => {
      const guestUid = "guest-user-1";
      seedHouse(HOUSE_ID, {
        adminId: ADMIN_UID,
        adminIds: [],
        superAdminIds: [],
        stripeAccountId: "acct_active_guest",
      });

      mockStripeV2AccountsRetrieve.mockResolvedValue(
        v2RecipientAccount("acct_active_guest", "active"),
      );

      // Re-wire Firestore so the guest sub-collection membership query returns a hit.
      wireFirestore(false);

      // The function should see the guest as a member and return active status.
      const result = await (getStripeAccountStatus as unknown as Function)(
        { houseId: HOUSE_ID },
        authedContext(guestUid),
      );

      expect(result.status).toBe("active");
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// createPaymentIntent
// ══════════════════════════════════════════════════════════════════════════════

describe("createPaymentIntent", () => {
  const HOUSE_ID = "house-pi-1";
  const GUEST_ID = "guest-pi-1";
  const USER_UID = "user-pi-uid";

  const baseData = {
    // amount is in integer US cents (matches mobile client + Stripe native unit)
    amount: 15000, // $150.00
    currency: "usd",
    guestId: GUEST_ID,
    houseId: HOUSE_ID,
    description: "March rent",
  };

  describe("auth and input validation", () => {
    it("throws unauthenticated when no auth context", async () => {
      await expectHttpsError(
        () =>
          (createPaymentIntent as unknown as Function)(baseData, unauthContext),
        "unauthenticated",
      );
    });

    it("throws invalid-argument when amount is missing", async () => {
      const { amount: _a, ...noAmount } = baseData;
      await expectHttpsError(
        () =>
          (createPaymentIntent as unknown as Function)(
            noAmount,
            authedContext(USER_UID),
          ),
        "invalid-argument",
      );
    });

    it("throws invalid-argument when guestId is missing", async () => {
      const { guestId: _g, ...noGuest } = baseData;
      await expectHttpsError(
        () =>
          (createPaymentIntent as unknown as Function)(
            noGuest,
            authedContext(USER_UID),
          ),
        "invalid-argument",
      );
    });

    it("throws invalid-argument when houseId is missing", async () => {
      const { houseId: _h, ...noHouse } = baseData;
      await expectHttpsError(
        () =>
          (createPaymentIntent as unknown as Function)(
            noHouse,
            authedContext(USER_UID),
          ),
        "invalid-argument",
      );
    });

    it("throws invalid-argument when amount is zero", async () => {
      await expectHttpsError(
        () =>
          (createPaymentIntent as unknown as Function)(
            { ...baseData, amount: 0 },
            authedContext(USER_UID),
          ),
        "invalid-argument",
      );
    });

    it("throws invalid-argument when amount is negative", async () => {
      await expectHttpsError(
        () =>
          (createPaymentIntent as unknown as Function)(
            { ...baseData, amount: -10 },
            authedContext(USER_UID),
          ),
        "invalid-argument",
      );
    });
  });

  describe("house precondition checks", () => {
    it("throws not-found when house does not exist", async () => {
      await expectHttpsError(
        () =>
          (createPaymentIntent as unknown as Function)(
            baseData,
            authedContext(USER_UID),
          ),
        "not-found",
      );
    });

    it("throws failed-precondition when house has no stripeAccountId", async () => {
      seedHouse(HOUSE_ID, { stripeStatus: "active" });
      await expectHttpsError(
        () =>
          (createPaymentIntent as unknown as Function)(
            baseData,
            authedContext(USER_UID),
          ),
        "failed-precondition",
      );
    });

    it("throws failed-precondition when stripeStatus is pending", async () => {
      seedHouse(HOUSE_ID, {
        stripeAccountId: "acct_pending_house",
        stripeStatus: "pending",
      });
      await expectHttpsError(
        () =>
          (createPaymentIntent as unknown as Function)(
            baseData,
            authedContext(USER_UID),
          ),
        "failed-precondition",
      );
    });

    it("throws failed-precondition when stripeStatus is restricted", async () => {
      seedHouse(HOUSE_ID, {
        stripeAccountId: "acct_restricted",
        stripeStatus: "restricted",
      });
      await expectHttpsError(
        () =>
          (createPaymentIntent as unknown as Function)(
            baseData,
            authedContext(USER_UID),
          ),
        "failed-precondition",
      );
    });
  });

  describe("successful payment intent creation", () => {
    beforeEach(() => {
      seedHouse(HOUSE_ID, {
        stripeAccountId: "acct_active_house",
        stripeStatus: "active",
      });
      // Caller is the resident paying their own rent — ownership check reads
      // guests/{guestId}.userId and requires it to match request.auth.uid.
      firestoreDocStore[`guests/${GUEST_ID}`] = {
        userId: USER_UID,
        // houseId is required on a real guest doc (entities/Guest.ts) and the
        // callable now rejects a guest that does not belong to the house being
        // paid, so a fixture without it no longer models a valid resident.
        houseId: HOUSE_ID,
      };
    });

    it("returns the clientSecret from Stripe", async () => {
      const result = await (createPaymentIntent as unknown as Function)(
        baseData,
        authedContext(USER_UID),
      );
      expect(result.clientSecret).toBe("pi_test_secret_xyz");
    });

    it("passes the integer-cent amount through to Stripe unchanged", async () => {
      await (createPaymentIntent as unknown as Function)(
        { ...baseData, amount: 12550 }, // $125.50
        authedContext(USER_UID),
      );
      expect(mockStripePaymentIntentsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 12550 }),
        expect.anything(),
      );
    });

    it("applies the card margin plus recovered Stripe cost (method-aware)", async () => {
      // baseData.amount = 15000 cents ($150.00); 0.75% = 112.5 -> 113 cents.
      await (createPaymentIntent as unknown as Function)(
        baseData,
        authedContext(USER_UID),
      );
      expect(mockStripePaymentIntentsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          application_fee_amount: 578,
          payment_method_types: ["card"],
        }),
        expect.anything(),
      );
    });

    it("applies the ACH margin plus recovered Stripe cost", async () => {
      // ACH = flat $2.00 (200 cents) regardless of amount.
      await (createPaymentIntent as unknown as Function)(
        { ...baseData, paymentMethodType: "us_bank_account" },
        authedContext(USER_UID),
      );
      expect(mockStripePaymentIntentsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          application_fee_amount: 320,
          payment_method_types: ["us_bank_account"],
        }),
        expect.anything(),
      );
    });

    it("ignores a legacy rent-fee flag — grandfathering is gone", async () => {
      // The legacy flat 2% (300 cents on 15000) no longer exists. A house still
      // carrying the old flag pays the standard card rate: 0.75% -> 113 cents.
      seedHouse(HOUSE_ID, {
        stripeAccountId: "acct_active_house",
        stripeStatus: "active",
        legacyRentFee: true,
      });
      await (createPaymentIntent as unknown as Function)(
        baseData,
        authedContext(USER_UID),
      );
      expect(mockStripePaymentIntentsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ application_fee_amount: 578 }),
        expect.anything(),
      );
    });

    it("sets transfer_data destination to the house stripeAccountId", async () => {
      await (createPaymentIntent as unknown as Function)(
        baseData,
        authedContext(USER_UID),
      );
      expect(mockStripePaymentIntentsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          transfer_data: { destination: "acct_active_house" },
        }),
        expect.anything(),
      );
    });

    it("includes guestId and houseId in metadata", async () => {
      await (createPaymentIntent as unknown as Function)(
        baseData,
        authedContext(USER_UID),
      );
      expect(mockStripePaymentIntentsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: { guestId: GUEST_ID, houseId: HOUSE_ID },
        }),
        expect.anything(),
      );
    });

    it("generates a per-day idempotency key when none is provided", async () => {
      const day = new Date().toISOString().slice(0, 10);
      await (createPaymentIntent as unknown as Function)(
        baseData,
        authedContext(USER_UID),
      );
      expect(mockStripePaymentIntentsCreate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          idempotencyKey: `${GUEST_ID}-${HOUSE_ID}-${day}`,
        }),
      );
    });

    it("uses the client-provided idempotency key when supplied", async () => {
      const customKey = "my-custom-key-abc";
      await (createPaymentIntent as unknown as Function)(
        { ...baseData, idempotencyKey: customKey },
        authedContext(USER_UID),
      );
      expect(mockStripePaymentIntentsCreate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ idempotencyKey: customKey }),
      );
    });

    it("defaults currency to USD when none is provided", async () => {
      const { currency: _c, ...noCurrency } = baseData;
      await (createPaymentIntent as unknown as Function)(
        noCurrency,
        authedContext(USER_UID),
      );
      expect(mockStripePaymentIntentsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ currency: "usd" }),
        expect.anything(),
      );
    });
  });

  describe("Stripe error handling", () => {
    beforeEach(() => {
      seedHouse(HOUSE_ID, {
        stripeAccountId: "acct_active_house",
        stripeStatus: "active",
      });
      // Caller is the resident paying their own rent — ownership check reads
      // guests/{guestId}.userId and requires it to match request.auth.uid.
      firestoreDocStore[`guests/${GUEST_ID}`] = {
        userId: USER_UID,
        // houseId is required on a real guest doc (entities/Guest.ts) and the
        // callable now rejects a guest that does not belong to the house being
        // paid, so a fixture without it no longer models a valid resident.
        houseId: HOUSE_ID,
      };
    });

    it("wraps StripeCardError as failed-precondition HttpsError", async () => {
      const cardErr = makeStripeError(
        StripeErrors.StripeCardError,
        "Your card was declined.",
        "card_error",
        { code: "card_declined" },
      );
      mockStripePaymentIntentsCreate.mockRejectedValue(cardErr);
      await expectHttpsError(
        () =>
          (createPaymentIntent as unknown as Function)(
            baseData,
            authedContext(USER_UID),
          ),
        "failed-precondition",
      );
    });

    it("wraps StripeRateLimitError as resource-exhausted HttpsError", async () => {
      const rateErr = makeStripeError(
        StripeErrors.StripeRateLimitError,
        "Too many requests.",
        "rate_limit_error",
      );
      mockStripePaymentIntentsCreate.mockRejectedValue(rateErr);
      await expectHttpsError(
        () =>
          (createPaymentIntent as unknown as Function)(
            baseData,
            authedContext(USER_UID),
          ),
        "resource-exhausted",
      );
    });

    it("wraps StripeAPIError as internal HttpsError", async () => {
      const apiErr = makeStripeError(
        StripeErrors.StripeAPIError,
        "Internal Stripe error.",
        "api_error",
      );
      mockStripePaymentIntentsCreate.mockRejectedValue(apiErr);
      await expectHttpsError(
        () =>
          (createPaymentIntent as unknown as Function)(
            baseData,
            authedContext(USER_UID),
          ),
        "internal",
      );
    });

    it("wraps StripeInvalidRequestError as invalid-argument HttpsError", async () => {
      const invalidErr = makeStripeError(
        StripeErrors.StripeInvalidRequestError,
        "Invalid currency.",
        "invalid_request_error",
      );
      mockStripePaymentIntentsCreate.mockRejectedValue(invalidErr);
      await expectHttpsError(
        () =>
          (createPaymentIntent as unknown as Function)(
            baseData,
            authedContext(USER_UID),
          ),
        "invalid-argument",
      );
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// listPayments — read scope: own records, or any resident for an admin
// ══════════════════════════════════════════════════════════════════════════════

describe("listPayments", () => {
  const HOUSE_ID = "house-list-1";

  beforeEach(() => {
    seedHouse(HOUSE_ID, {
      stripeAccountId: "acct_list_house",
      stripeStatus: "active",
      adminIds: ["admin-uid"],
    });
    seedGuest("guest-1", { userId: "resident-1-uid", houseId: HOUSE_ID });
    seedGuest("guest-2", { userId: "resident-2-uid", houseId: HOUSE_ID });
  });

  describe("read scope", () => {
    it("lets a resident read their own payments", async () => {
      const ctx = {
        auth: { uid: "resident-1-uid", token: { guest: { [HOUSE_ID]: true } } },
      };
      const result = await (listPayments as unknown as Function)(
        { guestId: "guest-1", houseId: HOUSE_ID },
        ctx,
      );
      expect(result).toHaveProperty("payments");
    });

    it("denies a resident reading another resident's payments", async () => {
      const ctx = {
        auth: { uid: "resident-1-uid", token: { guest: { [HOUSE_ID]: true } } },
      };
      await expectHttpsError(
        () =>
          (listPayments as unknown as Function)(
            { guestId: "guest-2", houseId: HOUSE_ID },
            ctx,
          ),
        "permission-denied",
      );
    });

    it("lets a house admin read any resident's payments in their house", async () => {
      const ctx = {
        auth: { uid: "admin-uid", token: { admin: { [HOUSE_ID]: true } } },
      };
      const result = await (listPayments as unknown as Function)(
        { guestId: "guest-2", houseId: HOUSE_ID },
        ctx,
      );
      expect(result).toHaveProperty("payments");
    });

    it("denies a guestId that belongs to a different house", async () => {
      seedGuest("guest-elsewhere", {
        userId: "resident-1-uid",
        houseId: "some-other-house",
      });
      const ctx = {
        auth: { uid: "resident-1-uid", token: { guest: { [HOUSE_ID]: true } } },
      };
      await expectHttpsError(
        () =>
          (listPayments as unknown as Function)(
            { guestId: "guest-elsewhere", houseId: HOUSE_ID },
            ctx,
          ),
        "permission-denied",
      );
    });

    it("throws not-found for an unknown guestId", async () => {
      const ctx = {
        auth: { uid: "admin-uid", token: { admin: { [HOUSE_ID]: true } } },
      };
      await expectHttpsError(
        () =>
          (listPayments as unknown as Function)(
            { guestId: "no-such-guest", houseId: HOUSE_ID },
            ctx,
          ),
        "not-found",
      );
    });
  });

  describe("authorization", () => {
    it("throws permission-denied when caller token has no membership for the house", async () => {
      // Token has no admin or guest claims for HOUSE_ID
      const ctx = { auth: { uid: "stranger-uid", token: {} } };
      await expectHttpsError(
        () =>
          (listPayments as unknown as Function)(
            { guestId: "guest-1", houseId: HOUSE_ID },
            ctx,
          ),
        "permission-denied",
      );
    });

    it("throws permission-denied when caller token has membership for a DIFFERENT house", async () => {
      const ctx = {
        auth: {
          uid: "other-house-uid",
          token: {
            admin: { "other-house": true },
            guest: { "other-house": true },
          },
        },
      };
      await expectHttpsError(
        () =>
          (listPayments as unknown as Function)(
            { guestId: "guest-1", houseId: HOUSE_ID },
            ctx,
          ),
        "permission-denied",
      );
    });

    it("allows call when caller token has admin claim for the house", async () => {
      const ctx = {
        auth: {
          uid: "admin-uid",
          token: { admin: { [HOUSE_ID]: true } },
        },
      };
      const result = await (listPayments as unknown as Function)(
        { guestId: "guest-1", houseId: HOUSE_ID },
        ctx,
      );
      expect(result).toHaveProperty("payments");
    });

    it("allows call when caller token has guest claim for the house", async () => {
      const ctx = {
        auth: {
          uid: "resident-1-uid",
          token: { guest: { [HOUSE_ID]: true } },
        },
      };
      const result = await (listPayments as unknown as Function)(
        { guestId: "guest-1", houseId: HOUSE_ID },
        ctx,
      );
      expect(result).toHaveProperty("payments");
    });

    it("throws unauthenticated when no auth context", async () => {
      await expectHttpsError(
        () =>
          (listPayments as unknown as Function)(
            { guestId: "guest-1", houseId: HOUSE_ID },
            unauthContext,
          ),
        "unauthenticated",
      );
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Input validation tests
// ──────────────────────────────────────────────────────────────────────────────

import {
  listHousePayments,
  getPaymentMethod,
  updatePaymentInfo,
} from "../callable/payments";

// helper: call a callable function using the (data, context) convention
// that matches the onCall mock wrapper
const callV = (fn: unknown, data: unknown, auth?: object) =>
  (fn as Function)(data, auth ? { auth } : undefined);

describe("listPayments — input validation", () => {
  it("throws invalid-argument when houseId is missing", async () => {
    const auth = { uid: "u1", token: {} };
    await expect(
      callV(listPayments, { guestId: "g1" }, auth),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });
});

describe("listHousePayments — input validation", () => {
  it("throws invalid-argument when houseId is missing", async () => {
    const auth = { uid: "u1", token: {} };
    await expect(callV(listHousePayments, {}, auth)).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });
});

describe("listHousePayments — read scope", () => {
  const HOUSE_ID = "house-wide-1";

  beforeEach(() => {
    seedHouse(HOUSE_ID, {
      stripeAccountId: "acct_house_wide",
      stripeStatus: "active",
      adminIds: ["admin-uid"],
    });
  });

  it("lets a house admin list the whole house", async () => {
    const auth = { uid: "admin-uid", token: { admin: { [HOUSE_ID]: true } } };
    const result = await callV(listHousePayments, { houseId: HOUSE_ID }, auth);
    expect(result).toHaveProperty("payments");
  });

  it("denies a resident of the house", async () => {
    const auth = {
      uid: "resident-1-uid",
      token: { guest: { [HOUSE_ID]: true } },
    };
    await expect(
      callV(listHousePayments, { houseId: HOUSE_ID }, auth),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("denies an admin of a different house", async () => {
    const auth = {
      uid: "other-admin-uid",
      token: { admin: { "other-house": true } },
    };
    await expect(
      callV(listHousePayments, { houseId: HOUSE_ID }, auth),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("throws unauthenticated when no auth context", async () => {
    await expect(
      callV(listHousePayments, { houseId: HOUSE_ID }),
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });
});

describe("getPaymentMethod — ownership", () => {
  const auth = { uid: "u1", token: {} };
  beforeEach(() => {
    mockGetUser.mockReset();
    mockStripeCustomersRetrieve.mockReset();
    mockStripePaymentMethodsRetrieve.mockReset();
  });

  it("throws not-found when the caller has no billing account", async () => {
    mockGetUser.mockResolvedValue(undefined);
    await expect(callV(getPaymentMethod, {}, auth)).rejects.toMatchObject({
      code: "not-found",
    });
  });

  it("resolves the caller's own customer, IGNORING any client-supplied customerId", async () => {
    // Caller's real customer is cus_self; the client tries to pass someone else's.
    mockGetUser.mockResolvedValue({
      subscriptionMetadata: { customerId: "cus_self" },
    });
    mockStripeCustomersRetrieve.mockResolvedValue({
      deleted: false,
      invoice_settings: { default_payment_method: "pm_self" },
    });
    mockStripePaymentMethodsRetrieve.mockResolvedValue({ id: "pm_self" });

    await callV(getPaymentMethod, { customerId: "cus_attacker" }, auth);

    // Never trust the client-supplied customerId.
    expect(mockStripeCustomersRetrieve).toHaveBeenCalledWith("cus_self");
    expect(mockStripeCustomersRetrieve).not.toHaveBeenCalledWith(
      "cus_attacker",
    );
    expect(mockGetUser).toHaveBeenCalledWith("u1");
  });
});

describe("updatePaymentInfo — ownership", () => {
  const auth = { uid: "u1", token: {} };
  beforeEach(() => {
    mockGetUser.mockReset();
    mockStripePaymentMethodsAttach.mockReset();
    mockStripeCustomersUpdate.mockReset();
  });

  it("throws invalid-argument when paymentMethod is missing", async () => {
    await expect(callV(updatePaymentInfo, {}, auth)).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  it("throws not-found when the caller has no billing account", async () => {
    mockGetUser.mockResolvedValue(undefined);
    await expect(
      callV(updatePaymentInfo, { paymentMethod: "pm_123" }, auth),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("attaches to the CALLER's customer, not a client-supplied one", async () => {
    mockGetUser.mockResolvedValue({
      subscriptionMetadata: { customerId: "cus_self" },
    });
    mockStripePaymentMethodsAttach.mockResolvedValue({ id: "pm_123" });
    mockStripeCustomersUpdate.mockResolvedValue({});

    await callV(updatePaymentInfo, { paymentMethod: "pm_123" }, auth);

    expect(mockStripePaymentMethodsAttach).toHaveBeenCalledWith("pm_123", {
      customer: "cus_self",
    });
    expect(mockStripeCustomersUpdate).toHaveBeenCalledWith(
      "cus_self",
      expect.anything(),
    );
  });

  it("throws internal HttpsError when stripe.paymentMethods.attach fails", async () => {
    mockGetUser.mockResolvedValue({
      subscriptionMetadata: { customerId: "cus_self" },
    });
    mockStripePaymentMethodsAttach.mockRejectedValueOnce(
      new Error("stripe attach failed"),
    );
    await expect(
      callV(updatePaymentInfo, { paymentMethod: "pm_123" }, auth),
    ).rejects.toMatchObject({ code: "internal" });
  });
});

describe("disconnectStripeAccount — input validation", () => {
  it("throws invalid-argument when houseId is missing", async () => {
    const auth = { uid: "u1" };
    await expect(
      callV(disconnectStripeAccount, {}, auth),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });
});

describe("getStripeAccountStatus — input validation", () => {
  it("throws invalid-argument when houseId is missing", async () => {
    const auth = { uid: "u1" };
    await expect(callV(getStripeAccountStatus, {}, auth)).rejects.toMatchObject(
      { code: "invalid-argument" },
    );
  });
});
