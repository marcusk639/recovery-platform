// src/__tests__/callable/compliance.test.ts

jest.mock("firebase-functions/v2/https", () => {
  const actual = jest.requireActual("firebase-functions/v2/https");
  return {
    ...actual,
    onCall: (_opts: any, handler?: Function) =>
      typeof _opts === "function" ? _opts : handler,
  };
});

jest.mock("firebase-functions", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockGetHouse = jest.fn();
const mockGetUser = jest.fn();
const mockGetGuest = jest.fn();
const mockGetGuestsForHouse = jest.fn();
const mockGetDrugTestsForGuest = jest.fn();
const mockGetMeetingActivitiesForGuest = jest.fn();

jest.mock("../../api/firestore", () => ({
  getHouse: mockGetHouse,
  getUser: mockGetUser,
  getGuest: mockGetGuest,
  getGuestsForHouse: mockGetGuestsForHouse,
  getDrugTestsForGuest: mockGetDrugTestsForGuest,
  getMeetingActivitiesForGuest: mockGetMeetingActivitiesForGuest,
}));

import { complianceExport } from "../../callable/compliance";
import { HttpsError } from "firebase-functions/v2/https";

const fakeAuth = { uid: "op-1" };
const call = (data: unknown, auth: object | null = fakeAuth) =>
  (complianceExport as unknown as Function)({ data, auth: auth ?? undefined });

const baseHouse = { houseType: "traditional", superAdminId: "op-1" };

const userWithTier = (houseType: string, tier: string) => ({
  subscriptionMetadata: { houseType, tier },
});

beforeEach(() => jest.clearAllMocks());

describe("complianceExport — auth guards", () => {
  it("throws unauthenticated when no auth", async () => {
    await expect(call({ houseId: "house-1" }, null)).rejects.toThrow(
      HttpsError,
    );
  });

  it("throws not-found when house does not exist", async () => {
    mockGetHouse.mockResolvedValue(undefined);
    await expect(call({ houseId: "house-1" })).rejects.toMatchObject({
      code: "not-found",
    });
  });

  it("throws permission-denied when caller is not the house owner", async () => {
    mockGetHouse.mockResolvedValue({ ...baseHouse, superAdminId: "other" });
    await expect(call({ houseId: "house-1" })).rejects.toMatchObject({
      code: "permission-denied",
    });
  });

  it("rejects invalid input (missing houseId)", async () => {
    await expect(call({})).rejects.toBeDefined();
  });
});

describe("complianceExport — tier gate (upgrade_required)", () => {
  it("returns upgrade_required for a traditional tier without the capability", async () => {
    mockGetHouse.mockResolvedValue(baseHouse);
    mockGetUser.mockResolvedValue(userWithTier("traditional", "starter"));
    const result = await call({ houseId: "house-1" });
    expect(result).toMatchObject({
      available: false,
      status: "upgrade_required",
      feature: "complianceExport",
      requiredTier: "Professional",
      spec: "RG-SPEC-09",
    });
  });

  it("returns upgrade_required for an oxford tier without the capability", async () => {
    mockGetHouse.mockResolvedValue({ ...baseHouse, houseType: "oxford" });
    mockGetUser.mockResolvedValue(userWithTier("oxford", "standard"));
    const result = await call({ houseId: "house-1" });
    expect(result).toMatchObject({
      status: "upgrade_required",
      requiredTier: "Plus",
    });
  });

  it("returns upgrade_required when the operator has no tier subscription", async () => {
    mockGetHouse.mockResolvedValue(baseHouse);
    mockGetUser.mockResolvedValue({ subscriptionMetadata: {} });
    const result = await call({ houseId: "house-1" });
    expect(result).toMatchObject({ status: "upgrade_required" });
  });

  it("returns upgrade_required (does not throw) for an unknown tier value", async () => {
    mockGetHouse.mockResolvedValue(baseHouse);
    mockGetUser.mockResolvedValue(userWithTier("traditional", "bogus"));
    const result = await call({ houseId: "house-1" });
    expect(result).toMatchObject({ status: "upgrade_required" });
  });
});

describe("complianceExport — entitled CSV export", () => {
  const entitledTraditional = () => {
    mockGetHouse.mockResolvedValue(baseHouse);
    mockGetUser.mockResolvedValue(userWithTier("traditional", "professional"));
  };

  it("returns a CSV export for an entitled traditional tier", async () => {
    entitledTraditional();
    mockGetGuestsForHouse.mockResolvedValue([
      {
        id: "g1",
        firstName: "Jane",
        lastName: "Doe",
        legalStatus: "probation",
        phase: 2,
        houseId: "house-1",
      },
    ]);
    mockGetDrugTestsForGuest.mockResolvedValue([
      {
        testDate: "2026-06-01",
        result: "negative",
        testType: "urine",
        substancesDetected: [],
        observerName: "Staff A",
        isRandom: true,
        notes: "routine",
      },
    ]);
    mockGetMeetingActivitiesForGuest.mockResolvedValue([
      {
        timestamp: "2026-06-02T10:00:00.000Z",
        verified: true,
        data: { meetingName: "Morning AA", meetingType: "AA", duration: 60 },
      },
    ]);

    const result = await call({ houseId: "house-1" });
    expect(result).toMatchObject({
      available: true,
      format: "csv",
      spec: "RG-SPEC-09",
      filename: "compliance-house-1.csv",
      counts: { residents: 1, drugTests: 1, meetings: 1 },
    });
    expect(result.csv).toContain("negative");
    expect(result.csv).toContain("Morning AA");
    expect(result.csv).toContain("Drug Tests");
    expect(result.csv).toContain("Meeting Attendance");
  });

  it("scopes to a single resident and verifies house ownership", async () => {
    entitledTraditional();
    mockGetGuest.mockResolvedValue({
      id: "g1",
      displayName: "John R.",
      houseId: "house-1",
      phase: 1,
    });
    mockGetDrugTestsForGuest.mockResolvedValue([]);
    mockGetMeetingActivitiesForGuest.mockResolvedValue([]);

    const result = await call({ houseId: "house-1", residentId: "g1" });
    expect(result).toMatchObject({
      available: true,
      filename: "compliance-house-1-g1.csv",
      counts: { residents: 1, drugTests: 0, meetings: 0 },
    });
    expect(result.csv).toContain("John R.");
  });

  it("rejects a resident that does not belong to the house", async () => {
    entitledTraditional();
    mockGetGuest.mockResolvedValue({ id: "g1", houseId: "other-house" });
    await expect(
      call({ houseId: "house-1", residentId: "g1" }),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("returns a CSV export for an entitled oxford tier", async () => {
    mockGetHouse.mockResolvedValue({ ...baseHouse, houseType: "oxford" });
    mockGetUser.mockResolvedValue(userWithTier("oxford", "plus"));
    mockGetGuestsForHouse.mockResolvedValue([
      { id: "g1", displayName: "Resident One", houseId: "house-1", phase: 1 },
    ]);
    mockGetDrugTestsForGuest.mockResolvedValue([]);
    mockGetMeetingActivitiesForGuest.mockResolvedValue([]);

    const result = await call({ houseId: "house-1" });
    expect(result).toMatchObject({ available: true, format: "csv" });
  });

  it("filters out records outside the [startDate, endDate] window", async () => {
    entitledTraditional();
    mockGetGuestsForHouse.mockResolvedValue([
      { id: "g1", displayName: "Jane", houseId: "house-1", phase: 1 },
    ]);
    mockGetDrugTestsForGuest.mockResolvedValue([
      { testDate: "2026-05-01", result: "positive", testType: "urine" }, // before window
      { testDate: "2026-06-15", result: "negative", testType: "urine" }, // in window
    ]);
    mockGetMeetingActivitiesForGuest.mockResolvedValue([
      {
        timestamp: "2026-07-01T10:00:00.000Z", // after window
        data: { meetingName: "Late Meeting" },
      },
      {
        timestamp: "2026-06-10T10:00:00.000Z", // in window
        data: { meetingName: "In Window Meeting" },
      },
    ]);

    const result = await call({
      houseId: "house-1",
      startDate: "2026-06-01",
      endDate: "2026-06-30",
    });
    expect(result.counts).toMatchObject({ drugTests: 1, meetings: 1 });
    expect(result.csv).toContain("In Window Meeting");
    expect(result.csv).not.toContain("Late Meeting");
    expect(result.csv).not.toContain("positive");
  });

  it("escapes CSV values containing commas by quoting them", async () => {
    entitledTraditional();
    mockGetGuestsForHouse.mockResolvedValue([
      { id: "g1", displayName: "Jane", houseId: "house-1", phase: 1 },
    ]);
    mockGetDrugTestsForGuest.mockResolvedValue([
      {
        testDate: "2026-06-05",
        result: "negative",
        testType: "urine",
        notes: "missed, then rescheduled",
      },
    ]);
    mockGetMeetingActivitiesForGuest.mockResolvedValue([]);

    const result = await call({ houseId: "house-1" });
    expect(result.csv).toContain('"missed, then rescheduled"');
  });

  it("defaults to csv format when format is omitted", async () => {
    entitledTraditional();
    mockGetGuestsForHouse.mockResolvedValue([
      { id: "g1", displayName: "Jane", houseId: "house-1", phase: 1 },
    ]);
    mockGetDrugTestsForGuest.mockResolvedValue([]);
    mockGetMeetingActivitiesForGuest.mockResolvedValue([]);

    const result = await call({ houseId: "house-1" });
    expect(result.format).toBe("csv");
    expect(typeof result.csv).toBe("string");
    expect(result.pdfBase64).toBeUndefined();
  });
});

describe("complianceExport — entitled PDF export", () => {
  const entitledTraditional = () => {
    mockGetHouse.mockResolvedValue(baseHouse);
    mockGetUser.mockResolvedValue(userWithTier("traditional", "professional"));
  };

  it("returns a PDF export with valid %PDF bytes and correct counts", async () => {
    entitledTraditional();
    mockGetGuestsForHouse.mockResolvedValue([
      {
        id: "g1",
        firstName: "Jane",
        lastName: "Doe",
        legalStatus: "probation",
        phase: 2,
        houseId: "house-1",
      },
    ]);
    mockGetDrugTestsForGuest.mockResolvedValue([
      {
        testDate: "2026-06-01",
        result: "negative",
        testType: "urine",
        substancesDetected: [],
        observerName: "Staff A",
        isRandom: true,
        notes: "routine",
      },
    ]);
    mockGetMeetingActivitiesForGuest.mockResolvedValue([
      {
        timestamp: "2026-06-02T10:00:00.000Z",
        verified: true,
        data: { meetingName: "Morning AA", meetingType: "AA", duration: 60 },
      },
    ]);

    const result = await call({ houseId: "house-1", format: "pdf" });
    expect(result).toMatchObject({
      available: true,
      format: "pdf",
      spec: "RG-SPEC-09",
      filename: "compliance-house-1.pdf",
      counts: { residents: 1, drugTests: 1, meetings: 1 },
    });
    expect(typeof result.pdfBase64).toBe("string");
    expect(result.pdfBase64.length).toBeGreaterThan(0);
    // Base64 of "%PDF" begins with "JVBER".
    expect(result.pdfBase64.startsWith("JVBER")).toBe(true);
    // Decoded bytes start with the %PDF magic.
    expect(
      Buffer.from(result.pdfBase64, "base64")
        .toString("latin1")
        .startsWith("%PDF"),
    ).toBe(true);
    expect(result.csv).toBeUndefined();
  });

  it("still returns upgrade_required for a non-entitled tier on pdf format", async () => {
    mockGetHouse.mockResolvedValue(baseHouse);
    mockGetUser.mockResolvedValue(userWithTier("traditional", "starter"));
    const result = await call({ houseId: "house-1", format: "pdf" });
    expect(result).toMatchObject({
      available: false,
      status: "upgrade_required",
      feature: "complianceExport",
    });
    expect(result.pdfBase64).toBeUndefined();
  });
});
