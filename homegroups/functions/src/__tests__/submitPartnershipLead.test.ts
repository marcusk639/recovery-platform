/**
 * Tests for submitPartnershipLead callable.
 * Covers validation, honeypot rejection, and successful writes.
 */

export {}; // Ensure isolated module

// ---- Mocks ----
jest.mock("firebase-functions", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  https: {
    onCall: (optsOrHandler: any, maybeHandler?: (req: any) => Promise<any>) => {
      if (
        typeof optsOrHandler === "object" &&
        typeof maybeHandler === "function"
      ) {
        return maybeHandler;
      }
      return optsOrHandler;
    },
  },
}));

jest.mock("firebase-functions/v1/https", () => ({
  HttpsError: class HttpsError extends Error {
    code: string;
    details?: any;
    constructor(code: string, message: string, details?: any) {
      super(message);
      this.code = code;
      this.details = details;
      this.name = "HttpsError";
    }
  },
}));

jest.mock("firebase-functions/v2/https", () => ({
  onCall: jest
    .fn()
    .mockImplementation((arg1: unknown, arg2?: unknown) =>
      typeof arg1 === "function" ? arg1 : arg2,
    ),
  HttpsError: class HttpsError extends Error {
    code: string;
    details?: unknown;
    constructor(code: string, message: string, details?: unknown) {
      super(message);
      this.code = code;
      this.details = details;
    }
  },
}));

jest.mock("firebase-functions/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const mockAdd = jest.fn();
const mockCollection = jest.fn(() => ({ add: mockAdd }));
jest.mock("../utils/firebase", () => ({
  db: {
    collection: mockCollection,
    FieldValue: { serverTimestamp: () => "SERVER_TS" },
  },
}));

jest.mock("firebase-admin", () => ({
  firestore: {
    FieldValue: { serverTimestamp: () => "SERVER_TS" },
  },
}));

// ---- Helpers ----
function req(data: any, rawRequest?: any) {
  return {
    data,
    auth: undefined,
    rawRequest: rawRequest || { headers: {} },
  } as any;
}

const VALID_LEAD = {
  kind: "treatment_center",
  organizationName: "Serenity Treatment Center",
  contactName: "Dr. Jane Doe",
  email: "jane@example.com",
  phone: "+1-555-123-4567",
  notes: "Interested in the Referral Partner tier",
  tier: "Referral Partner",
  website: "", // honeypot — must be empty
};

// ---- Tests ----
describe("submitPartnershipLead", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    mockAdd.mockResolvedValue({ id: "lead-1" });
  });

  it("writes a valid treatment_center lead and returns success", async () => {
    const { submitPartnershipLead: fn } =
      await import("../callable/submitPartnershipLead");
    const result = await (fn as any)(req(VALID_LEAD));
    expect(result.success).toBe(true);
    expect(result.id).toBe("lead-1");
    expect(mockCollection).toHaveBeenCalledWith("partnershipLeads");
    expect(mockAdd).toHaveBeenCalledTimes(1);
    const written = mockAdd.mock.calls[0][0];
    expect(written.kind).toBe("treatment_center");
    expect(written.organizationName).toBe("Serenity Treatment Center");
    expect(written.status).toBe("new");
    expect(written.createdAt).toBe("SERVER_TS");
  });

  it("writes a valid intergroup lead", async () => {
    const { submitPartnershipLead: fn } =
      await import("../callable/submitPartnershipLead");
    const lead = { ...VALID_LEAD, kind: "intergroup", tier: undefined };
    const result = await (fn as any)(req(lead));
    expect(result.success).toBe(true);
    const written = mockAdd.mock.calls[0][0];
    expect(written.kind).toBe("intergroup");
  });

  it("rejects invalid kind", async () => {
    const { submitPartnershipLead: fn } =
      await import("../callable/submitPartnershipLead");
    await expect(
      (fn as any)(req({ ...VALID_LEAD, kind: "bogus" })),
    ).rejects.toMatchObject({ code: "invalid-argument" });
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it("rejects non-string kind (e.g. number, boolean)", async () => {
    const { submitPartnershipLead: fn } =
      await import("../callable/submitPartnershipLead");
    await expect(
      (fn as any)(req({ ...VALID_LEAD, kind: 1 })),
    ).rejects.toMatchObject({
      code: "invalid-argument",
    });
    await expect(
      (fn as any)(req({ ...VALID_LEAD, kind: true })),
    ).rejects.toMatchObject({ code: "invalid-argument" });
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it("rejects missing organizationName", async () => {
    const { submitPartnershipLead: fn } =
      await import("../callable/submitPartnershipLead");
    await expect(
      (fn as any)(req({ ...VALID_LEAD, organizationName: "" })),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("rejects missing contactName", async () => {
    const { submitPartnershipLead: fn } =
      await import("../callable/submitPartnershipLead");
    await expect(
      (fn as any)(req({ ...VALID_LEAD, contactName: "" })),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("rejects malformed email", async () => {
    const { submitPartnershipLead: fn } =
      await import("../callable/submitPartnershipLead");
    await expect(
      (fn as any)(req({ ...VALID_LEAD, email: "not-an-email" })),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("rejects honeypot field filled in (bot)", async () => {
    const { submitPartnershipLead: fn } =
      await import("../callable/submitPartnershipLead");
    await expect(
      (fn as any)(req({ ...VALID_LEAD, website: "http://spam.example.com" })),
    ).rejects.toMatchObject({ code: "invalid-argument" });
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it("truncates overly long free-text fields to limit abuse", async () => {
    const { submitPartnershipLead: fn } =
      await import("../callable/submitPartnershipLead");
    const longText = "x".repeat(10_000);
    const result = await (fn as any)(req({ ...VALID_LEAD, notes: longText }));
    expect(result.success).toBe(true);
    const written = mockAdd.mock.calls[0][0];
    expect(written.notes.length).toBeLessThanOrEqual(2000);
  });

  it("captures userAgent from rawRequest for triage", async () => {
    const { submitPartnershipLead: fn } =
      await import("../callable/submitPartnershipLead");
    const result = await (fn as any)(
      req(VALID_LEAD, { headers: { "user-agent": "Mozilla/5.0 test" } }),
    );
    expect(result.success).toBe(true);
    const written = mockAdd.mock.calls[0][0];
    expect(written.userAgent).toBe("Mozilla/5.0 test");
  });

  it("does not pass undefined optional fields to Firestore (production curl smoke)", async () => {
    const { submitPartnershipLead: fn } =
      await import("../callable/submitPartnershipLead");
    const minimal = {
      kind: "treatment_center",
      organizationName: "Test Facility",
      contactName: "Smoke",
      email: "smoke@example.com",
      tier: "Basic Listing",
      notes: "notes",
      website: "",
    };
    await (fn as any)(req(minimal));
    const written = mockAdd.mock.calls[0][0];
    expect(Object.values(written).every((v) => v !== undefined)).toBe(true);
    expect("phone" in written).toBe(false);
  });
});
