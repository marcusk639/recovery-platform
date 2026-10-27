// src/__tests__/callable/compliance.disputes.test.ts
//
// Owner decision: the court export lists EVERY logged meeting (deleted ones
// excepted) with a Dispute column; totals and Verified follow the counting
// rule, so an approved dispute is listed but not counted. Only the resident's
// own records (same trust rule as the summaries), dated in the house's zone.
// Also: real activity docs hold Firestore Timestamps.

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

const ts = (iso: string) => ({ toDate: () => new Date(iso) });
const meeting = (name: string, extra: Record<string, unknown> = {}) => ({
  timestamp: "2026-06-02T16:00:00.000Z",
  verified: true,
  status: "active",
  houseId: "house-1",
  loggedBy: "resident-uid",
  data: { meetingName: name, meetingType: "AA", duration: 60 },
  ...extra,
});
/** The CSV row for a meeting name, split into cells. */
const rowFor = (csv: string, name: string) =>
  csv.split("\n").find((l) => l.includes(name))?.split(",");

beforeEach(() => {
  mockGetHouse.mockResolvedValue({ ...baseHouse, timezone: "America/Chicago" });
  mockGetUser.mockResolvedValue(userWithTier("traditional", "professional"));
  mockGetGuestsForHouse.mockResolvedValue([
    { id: "g1", firstName: "Jane", houseId: "house-1", userId: "resident-uid" },
  ]);
  mockGetDrugTestsForGuest.mockResolvedValue([]);
});

describe("complianceExport — dispute outcomes", () => {
  it("lists every logged meeting with an unambiguous Dispute column; deleted ones are withdrawn", async () => {
    mockGetMeetingActivitiesForGuest.mockResolvedValue([
      meeting("Counted"),
      meeting("Pending", { status: "disputed" }),
      meeting("Rejected", { status: "resolved", disputed: "rejected", incomplete: false }),
      meeting("Approved", { status: "resolved", disputed: "successful", incomplete: true }),
      meeting("Deleted", { status: "deleted" }),
      meeting("LegacyKept", { status: "resolved" }),
    ]);

    const result = await call({ houseId: "house-1" });

    expect(result.csv).toContain("Date,Meeting,Type,Duration,Verified,Dispute");
    expect(rowFor(result.csv, "Counted")?.slice(4)).toEqual(["true", "None"]);
    expect(rowFor(result.csv, "Pending")?.slice(4)).toEqual(["true", "Pending - counted until decided"]);
    expect(rowFor(result.csv, "Rejected")?.slice(4)).toEqual(["true", "Rejected - counted"]);
    expect(rowFor(result.csv, "LegacyKept")?.slice(4)).toEqual(["true", "Resolved - counted"]);
    expect(result.csv).not.toContain("Deleted");
  });

  it("an approved dispute is listed but not counted, and never shown as verified", async () => {
    mockGetMeetingActivitiesForGuest.mockResolvedValue([
      meeting("Counted"),
      meeting("Approved", { status: "resolved", disputed: "successful", incomplete: true, verified: true }),
    ]);

    const result = await call({ houseId: "house-1" });

    expect(rowFor(result.csv, "Approved")?.slice(4)).toEqual(["false", "Approved - not counted"]);
    expect(result.counts.meetings).toBe(1);
  });

  it("handles Firestore Timestamp dates (what activity docs actually store)", async () => {
    mockGetMeetingActivitiesForGuest.mockResolvedValue([
      meeting("TimestampMeeting", { timestamp: ts("2026-06-02T16:00:00.000Z"), loggedAt: ts("2026-06-02T16:00:05.000Z") }),
      meeting("OutOfWindow", { timestamp: ts("2026-08-02T16:00:00.000Z") }),
    ]);

    const result = await call({ houseId: "house-1", startDate: "2026-06-01", endDate: "2026-06-30" });

    expect(result.counts.meetings).toBe(1);
    expect(rowFor(result.csv, "TimestampMeeting")?.[0]).toBe("2026-06-02");
    expect(result.csv).not.toContain("OutOfWindow");
  });

  it("applies the same rule to the PDF export", async () => {
    mockGetMeetingActivitiesForGuest.mockResolvedValue([
      meeting("Counted"),
      meeting("Approved", { status: "resolved", incomplete: true }),
    ]);
    const result = await call({ houseId: "house-1", format: "pdf" });
    expect(result.counts.meetings).toBe(1);
  });
});

describe("complianceExport — legacy upheld disputes", () => {
  it("lists a dispute upheld the old way (deleted with disputeResolvedAt); plain deletions stay out", async () => {
    mockGetMeetingActivitiesForGuest.mockResolvedValue([
      meeting("LegacyUpheld", {
        status: "deleted",
        disputeResolvedAt: ts("2026-06-03T10:00:00.000Z"),
        loggedAt: ts("2026-06-03T10:00:00.000Z"),
        verified: true,
      }),
      meeting("PlainDeleted", { status: "deleted" }),
      meeting("Counted"),
    ]);

    const result = await call({ houseId: "house-1" });

    expect(rowFor(result.csv, "LegacyUpheld")?.slice(4)).toEqual([
      "false",
      "Removed after dispute (before approve/reject) - not counted",
    ]);
    expect(result.csv).not.toContain("PlainDeleted");
    expect(result.counts.meetings).toBe(1);
  });
});

describe("complianceExport — a later deletion is never labelled an upheld dispute", () => {
  const resolvedAt = ts("2026-06-03T10:00:00.000Z");
  const deletedLater = ts("2026-06-05T09:00:00.000Z");
  it.each([
    ["rejected then deleted", { disputed: "rejected", incomplete: false }],
    ["approved then deleted", { disputed: "successful", incomplete: true }],
    ["kept the old way then deleted", {}],
  ])("%s: left out (a withdrawal), not \"Removed after dispute\"", async (_label, fields) => {
    mockGetMeetingActivitiesForGuest.mockResolvedValue([
      meeting("Withdrawn", {
        ...fields,
        status: "deleted",
        disputeResolvedAt: resolvedAt,
        loggedAt: deletedLater,
      }),
      meeting("Counted"),
    ]);

    const result = await call({ houseId: "house-1" });

    expect(result.csv).not.toContain("Withdrawn");
    expect(result.csv).not.toContain("Removed after dispute");
  });
});

describe("complianceExport — house time zone", () => {
  it("dates a meeting by the house-local date, not the UTC date", async () => {
    // 21:30 Monday in Chicago is already Tuesday in UTC.
    mockGetMeetingActivitiesForGuest.mockResolvedValue([
      meeting("EveningMeeting", { timestamp: ts("2026-06-02T02:30:00.000Z") }),
    ]);
    const result = await call({ houseId: "house-1" });
    expect(rowFor(result.csv, "EveningMeeting")?.[0]).toBe("2026-06-01");
  });

  it("filters the date window by the house-local date", async () => {
    mockGetMeetingActivitiesForGuest.mockResolvedValue([
      meeting("LastEveningOfMay", { timestamp: ts("2026-06-01T02:30:00.000Z") }), // May 31 local
    ]);
    const inJune = await call({ houseId: "house-1", startDate: "2026-06-01", endDate: "2026-06-30" });
    expect(inJune.csv).not.toContain("LastEveningOfMay");
    const inMay = await call({ houseId: "house-1", startDate: "2026-05-01", endDate: "2026-05-31" });
    expect(inMay.csv).toContain("LastEveningOfMay");
  });

  it("falls back to the default zone when the house has none", async () => {
    mockGetHouse.mockResolvedValue({ ...baseHouse });
    mockGetMeetingActivitiesForGuest.mockResolvedValue([
      meeting("NoZone", { timestamp: ts("2026-06-02T02:30:00.000Z") }), // 22:30 Jun 1 in New York
    ]);
    const result = await call({ houseId: "house-1" });
    expect(rowFor(result.csv, "NoZone")?.[0]).toBe("2026-06-01");
  });
});

describe("complianceExport — only the resident's own records", () => {
  it("leaves out a meeting forged by someone else, or claiming another house", async () => {
    mockGetMeetingActivitiesForGuest.mockResolvedValue([
      meeting("Own"),
      meeting("Forged", { loggedBy: "stranger-uid" }),
      meeting("OtherHouse", { houseId: "house-9" }),
    ]);
    jest.spyOn(require("../../activities/activityTrust"), "claimsHouseAdminCheck").mockReturnValue(
      async () => false,
    );

    const result = await call({ houseId: "house-1" });

    expect(result.csv).toContain("Own");
    expect(result.csv).not.toContain("Forged");
    expect(result.csv).not.toContain("OtherHouse");
    expect(result.counts.meetings).toBe(1);
  });
});
