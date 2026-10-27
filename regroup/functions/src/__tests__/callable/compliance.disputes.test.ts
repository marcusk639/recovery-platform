// src/__tests__/callable/compliance.disputes.test.ts
//
// The court export lists only the meetings that COUNT, by the same rule as
// the weekly numbers (activities/weekSummaryMath countsTowardSummary): not
// deleted, and not an approved dispute (incomplete). Pending and rejected
// disputes stay listed. Also: real activity docs hold Firestore Timestamps.

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
  timestamp: "2026-06-02T10:00:00.000Z",
  verified: false,
  status: "active",
  data: { meetingName: name, meetingType: "AA", duration: 60 },
  ...extra,
});

beforeEach(() => {
  mockGetHouse.mockResolvedValue(baseHouse);
  mockGetUser.mockResolvedValue(userWithTier("traditional", "professional"));
  mockGetGuestsForHouse.mockResolvedValue([{ id: "g1", firstName: "Jane", houseId: "house-1" }]);
  mockGetDrugTestsForGuest.mockResolvedValue([]);
});

describe("complianceExport — dispute outcomes", () => {
  it("excludes deleted meetings and approved disputes; keeps pending and rejected ones", async () => {
    mockGetMeetingActivitiesForGuest.mockResolvedValue([
      meeting("Counted"),
      meeting("Pending", { status: "disputed" }),
      meeting("Rejected", { status: "resolved", disputed: "rejected", incomplete: false }),
      meeting("Approved", { status: "resolved", disputed: "successful", incomplete: true }),
      meeting("Deleted", { status: "deleted" }),
      meeting("LegacyKept", { status: "resolved" }),
    ]);

    const result = await call({ houseId: "house-1" });

    expect(result.counts.meetings).toBe(4);
    for (const kept of ["Counted", "Pending", "Rejected", "LegacyKept"]) {
      expect(result.csv).toContain(kept);
    }
    expect(result.csv).not.toContain("Approved");
    expect(result.csv).not.toContain("Deleted");
  });

  it("handles Firestore Timestamp dates (what activity docs actually store)", async () => {
    mockGetMeetingActivitiesForGuest.mockResolvedValue([
      meeting("TimestampMeeting", { timestamp: ts("2026-06-02T10:00:00.000Z"), loggedAt: ts("2026-06-02T10:00:05.000Z") }),
      meeting("OutOfWindow", { timestamp: ts("2026-08-02T10:00:00.000Z") }),
    ]);

    const result = await call({ houseId: "house-1", startDate: "2026-06-01", endDate: "2026-06-30" });

    expect(result.counts.meetings).toBe(1);
    expect(result.csv).toContain("2026-06-02");
    expect(result.csv).toContain("TimestampMeeting");
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
