/**
 * Unit tests for createIntergroup Cloud Function — validation layer.
 *
 * Covers (P2-14):
 *   - Disallowed redirect URL (successUrl / cancelUrl) → HttpsError "invalid-argument"
 *   - Allowed redirect URL → proceeds past URL validation gate
 *   - name containing '@' → HttpsError "invalid-argument" (PII regression guard)
 *   - Invalid type value → HttpsError "invalid-argument"
 *   - Unauthenticated call → HttpsError "unauthenticated"
 *
 * These tests exercise only the early-exit validation paths.
 * Stripe and Firestore mocks are stubs — the happy-path write sequence is
 * covered by the existing intergroupFeatures.test.ts and stripeWebhook.test.ts.
 */

// ============================================================
// Mocks — must be defined before any imports that load modules
// ============================================================

// Capture writes to the intergroup doc so tests can inspect payloads (P2-14 PII regression)
const mockIntergroupSet = jest.fn().mockResolvedValue(undefined);
const mockMemberSet = jest.fn().mockResolvedValue(undefined);
const mockIntergroupDelete = jest.fn().mockResolvedValue(undefined);
const mockCustomerCreate = jest.fn();
const mockCustomerDel = jest.fn();
const mockSessionCreate = jest.fn();
const mockSessionExpire = jest.fn();

jest.mock("firebase-admin", () => ({
  apps: ["mock-app"],
  initializeApp: jest.fn(),
  firestore: Object.assign(
    jest.fn().mockReturnValue({
      collection: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
        doc: jest.fn().mockReturnValue({
          id: "new-intergroup-id",
          get: jest.fn().mockResolvedValue({
            exists: true,
            data: () => ({
              email: "user@example.com",
              displayName: "Test User",
            }),
          }),
          set: mockIntergroupSet,
          collection: jest.fn().mockReturnValue({
            doc: jest.fn().mockReturnValue({
              set: mockMemberSet,
            }),
          }),
        }),
      }),
    }),
    {
      Timestamp: {
        fromMillis: (ms: number) => ({ ms }),
        now: () => ({ ms: Date.now() }),
      },
      FieldValue: { serverTimestamp: () => "__SERVER_TIMESTAMP__" },
    },
  ),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockOnCall(...args: any[]) {
  if (typeof args[0] === "function") return args[0];
  if (typeof args[1] === "function") return args[1];
  return args[0];
}

jest.mock("firebase-functions", () => ({
  https: { onCall: mockOnCall },
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("firebase-functions/v2/https", () => ({
  onCall: mockOnCall,
  HttpsError: class HttpsError extends Error {
    code: string;
    details?: unknown;
    constructor(code: string, message: string, details?: unknown) {
      super(message);
      this.code = code;
      this.details = details;
      this.name = "HttpsError";
    }
  },
}));

jest.mock("../utils/firebase", () => ({
  db: {
    collection: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
      doc: jest.fn().mockReturnValue({
        id: "new-intergroup-id",
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => ({
            email: "user@example.com",
            displayName: "Test User",
          }),
        }),
        set: mockIntergroupSet,
        delete: mockIntergroupDelete,
        collection: jest.fn().mockReturnValue({
          doc: jest.fn().mockReturnValue({
            set: mockMemberSet,
          }),
        }),
      }),
    }),
  },
}));

jest.mock("../utils/stripe", () => ({
  stripe: {
    customers: {
      create: mockCustomerCreate,
      del: mockCustomerDel,
    },
    checkout: {
      sessions: {
        create: mockSessionCreate,
        expire: mockSessionExpire,
      },
    },
  },
  productIdIntergroupA: "prod_tier_a_test",
  productIdIntergroupB: "prod_tier_b_test",
  getDefaultPriceForProduct: jest.fn().mockResolvedValue("price_test"),
}));

// ============================================================
// Imports after mocks
// ============================================================

import { createIntergroup } from "../callable/createIntergroup";

// ============================================================
// Helpers
// ============================================================

const AUTH_CONTEXT = {
  uid: "user-uid-123",
  token: { email: "user@example.com", name: "Test User" },
};

function makeRequest(data: Record<string, unknown>, auth = AUTH_CONTEXT) {
  return { auth, data } as Parameters<typeof createIntergroup>[0];
}

const VALID_BASE = {
  name: "Test Intergroup",
  type: "intergroup",
  tier: "tier_a",
} as const;

// ============================================================
// Tests
// ============================================================

describe("createIntergroup — validation", () => {
  beforeEach(() => {
    mockIntergroupSet.mockClear();
    mockMemberSet.mockClear();
    mockIntergroupDelete.mockClear();
    mockCustomerCreate.mockReset().mockResolvedValue({ id: "cus_test" });
    mockCustomerDel.mockReset().mockResolvedValue({});
    mockSessionCreate.mockReset().mockResolvedValue({
      id: "cs_test",
      url: "https://checkout.stripe.com/test",
    });
    mockSessionExpire.mockReset().mockResolvedValue({});
  });

  describe("authentication", () => {
    it("throws unauthenticated when auth is null", async () => {
      const req = makeRequest(VALID_BASE, null as never);
      await expect(createIntergroup(req)).rejects.toMatchObject({
        code: "unauthenticated",
      });
    });
  });

  describe("name validation — PII guard (P2-14)", () => {
    it("throws invalid-argument when name contains '@' (email-like)", async () => {
      const req = makeRequest({ ...VALID_BASE, name: "user@example.com" });
      await expect(createIntergroup(req)).rejects.toMatchObject({
        code: "invalid-argument",
        message: expect.stringContaining("email address"),
      });
    });

    it("accepts a name without '@'", async () => {
      const req = makeRequest({ ...VALID_BASE, name: "Valley Intergroup" });
      // Should NOT throw on the name check (may succeed or fail later on Stripe mocks)
      await expect(createIntergroup(req)).resolves.toBeDefined();
    });

    it("throws invalid-argument when name is empty", async () => {
      const req = makeRequest({ ...VALID_BASE, name: "" });
      await expect(createIntergroup(req)).rejects.toMatchObject({
        code: "invalid-argument",
      });
    });
  });

  describe("type validation", () => {
    it("throws invalid-argument for an unknown type", async () => {
      const req = makeRequest({ ...VALID_BASE, type: "bogus-type" });
      await expect(createIntergroup(req)).rejects.toMatchObject({
        code: "invalid-argument",
        message: expect.stringContaining("Invalid type"),
      });
    });

    it("accepts all valid types", async () => {
      const validTypes = [
        "intergroup",
        "district",
        "area",
        "treatment_center",
      ] as const;
      for (const type of validTypes) {
        const req = makeRequest({ ...VALID_BASE, type });
        await expect(createIntergroup(req)).resolves.toBeDefined();
      }
    });
  });

  describe("redirect URL allowlist — P2-14", () => {
    it("throws invalid-argument for a disallowed successUrl origin", async () => {
      const req = makeRequest({
        ...VALID_BASE,
        successUrl: "https://evil.example.com/steal",
      });
      await expect(createIntergroup(req)).rejects.toMatchObject({
        code: "invalid-argument",
        message: expect.stringContaining("redirect URL"),
      });
    });

    it("throws invalid-argument for a disallowed cancelUrl origin", async () => {
      const req = makeRequest({
        ...VALID_BASE,
        cancelUrl: "https://evil.example.com/cancel",
      });
      await expect(createIntergroup(req)).rejects.toMatchObject({
        code: "invalid-argument",
        message: expect.stringContaining("redirect URL"),
      });
    });

    it("throws invalid-argument for a javascript: protocol URL", async () => {
      const req = makeRequest({
        ...VALID_BASE,
        successUrl: "javascript:alert(1)",
      });
      await expect(createIntergroup(req)).rejects.toMatchObject({
        code: "invalid-argument",
      });
    });

    it("accepts an allowed production origin", async () => {
      const req = makeRequest({
        ...VALID_BASE,
        successUrl: "https://homegroups-app.com/intergroup-success",
        cancelUrl: "https://homegroups-app.com/intergroup-cancel",
      });
      await expect(createIntergroup(req)).resolves.toBeDefined();
    });

    it("accepts undefined successUrl / cancelUrl (defaults are used)", async () => {
      const req = makeRequest({ ...VALID_BASE });
      await expect(createIntergroup(req)).resolves.toBeDefined();
    });
  });

  describe("treatment_center facilityName storage — PII regression (P2-14)", () => {
    it("stores facility name (not user email) in Firestore for treatment_center type", async () => {
      const facilityName = "Sunrise Recovery Center";
      const req = makeRequest({
        ...VALID_BASE,
        name: facilityName,
        type: "treatment_center",
        tier: "tier_b",
      });

      await expect(createIntergroup(req)).resolves.toBeDefined();

      // Locate the intergroup doc write (the .set call on the intergroups doc ref).
      // Must include the facility name in the `name` field — and must NOT be the user's email.
      expect(mockIntergroupSet).toHaveBeenCalled();
      const payload = mockIntergroupSet.mock.calls[0][0];
      expect(payload).toMatchObject({
        name: facilityName,
        type: "treatment_center",
        tier: "tier_b",
      });
      // Explicit regression guard: name must not be the user's email
      expect(payload.name).not.toBe(AUTH_CONTEXT.token.email);
      expect(payload.name).not.toContain("@");
    });

    it("rejects a treatment_center request whose name looks like an email", async () => {
      const req = makeRequest({
        ...VALID_BASE,
        name: "admin@sunrise-recovery.com",
        type: "treatment_center",
        tier: "tier_b",
      });
      await expect(createIntergroup(req)).rejects.toMatchObject({
        code: "invalid-argument",
        message: expect.stringContaining("email address"),
      });
      // No Firestore write should have occurred
      expect(mockIntergroupSet).not.toHaveBeenCalled();
    });
  });

  /**
   * Rollback / orphan-cleanup regression.
   *
   * The handler creates a Stripe customer BEFORE the Firestore intergroup doc
   * is written, and a Stripe Checkout Session in between. If anything after
   * the customer creation fails — Stripe session error, missing session URL,
   * Firestore write error, member doc write error — we must clean up the
   * Stripe customer (and any session) so we don't leave orphans in the Stripe
   * account.
   *
   * Refs: PR #46 follow-up — createIntergroup.ts had no top-level handler,
   * which left Stripe state stranded on any post-customer failure.
   */
  describe("orphan rollback on post-customer failure", () => {
    it("deletes the Stripe customer when checkout.sessions.create throws", async () => {
      mockSessionCreate.mockRejectedValueOnce(
        new Error("Stripe API: rate limited"),
      );

      const req = makeRequest(VALID_BASE);
      await expect(createIntergroup(req)).rejects.toBeDefined();

      // Customer was created, then session creation failed → customer.del must be called
      expect(mockCustomerCreate).toHaveBeenCalledTimes(1);
      expect(mockCustomerDel).toHaveBeenCalledWith("cus_test");
      // No Firestore writes should have happened
      expect(mockIntergroupSet).not.toHaveBeenCalled();
      expect(mockMemberSet).not.toHaveBeenCalled();
    });

    it("deletes the Stripe customer + expires the session when session.url is missing", async () => {
      mockSessionCreate.mockResolvedValueOnce({ id: "cs_no_url", url: null });

      const req = makeRequest(VALID_BASE);
      await expect(createIntergroup(req)).rejects.toMatchObject({
        code: "internal",
        message: expect.stringMatching(/checkout url/i),
      });

      expect(mockCustomerDel).toHaveBeenCalledWith("cus_test");
      expect(mockSessionExpire).toHaveBeenCalledWith("cs_no_url");
      expect(mockIntergroupSet).not.toHaveBeenCalled();
    });

    it("rolls back Stripe customer + session when the intergroup Firestore write fails", async () => {
      mockIntergroupSet.mockRejectedValueOnce(new Error("Firestore: timeout"));

      const req = makeRequest(VALID_BASE);
      await expect(createIntergroup(req)).rejects.toBeDefined();

      expect(mockCustomerCreate).toHaveBeenCalledTimes(1);
      expect(mockSessionCreate).toHaveBeenCalledTimes(1);
      expect(mockCustomerDel).toHaveBeenCalledWith("cus_test");
      expect(mockSessionExpire).toHaveBeenCalledWith("cs_test");
      // The intergroup doc set was attempted but failed — no member write should have occurred
      expect(mockMemberSet).not.toHaveBeenCalled();
    });

    it("rolls back intergroup doc + Stripe state when member write fails", async () => {
      mockMemberSet.mockRejectedValueOnce(
        new Error("Firestore: permission denied"),
      );

      const req = makeRequest(VALID_BASE);
      await expect(createIntergroup(req)).rejects.toBeDefined();

      // All previous steps succeeded
      expect(mockIntergroupSet).toHaveBeenCalledTimes(1);
      // Rollback should delete the intergroup doc and clean up Stripe state
      expect(mockIntergroupDelete).toHaveBeenCalledTimes(1);
      expect(mockSessionExpire).toHaveBeenCalledWith("cs_test");
      expect(mockCustomerDel).toHaveBeenCalledWith("cus_test");
    });

    it("does NOT attempt cleanup when validation fails (no resources created yet)", async () => {
      const req = makeRequest({ ...VALID_BASE, name: "" }); // invalid
      await expect(createIntergroup(req)).rejects.toMatchObject({
        code: "invalid-argument",
      });

      expect(mockCustomerCreate).not.toHaveBeenCalled();
      expect(mockCustomerDel).not.toHaveBeenCalled();
      expect(mockSessionExpire).not.toHaveBeenCalled();
    });

    it("still throws the original HttpsError if the Stripe customer delete itself fails (best-effort cleanup)", async () => {
      mockSessionCreate.mockRejectedValueOnce(new Error("Stripe outage"));
      mockCustomerDel.mockRejectedValueOnce(new Error("Stripe still down"));

      const req = makeRequest(VALID_BASE);
      await expect(createIntergroup(req)).rejects.toBeDefined();
      // Cleanup was attempted even though it failed
      expect(mockCustomerDel).toHaveBeenCalledWith("cus_test");
    });
  });
});
