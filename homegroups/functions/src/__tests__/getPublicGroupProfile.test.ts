/**
 * Tests for getPublicGroupProfile callable.
 * Verifies the privacy allowlist: only permitted fields are returned.
 */

export {}; // Ensure isolated module

// ---- Mocks — must come before imports ----
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

// v2/https + logger mocks come from functions/jest.setup.ts (shared)

const mockGroupGet = jest.fn();
const mockMeetingsGet = jest.fn();
const mockWhere = jest.fn().mockReturnThis();
const mockLimit = jest.fn().mockReturnThis();
const mockCollection = jest.fn((name: string) => {
  if (name === "groups") {
    return { doc: jest.fn(() => ({ get: mockGroupGet })) };
  }
  if (name === "meetings") {
    return {
      where: mockWhere,
      limit: mockLimit,
      get: mockMeetingsGet,
    };
  }
  throw new Error(`Unexpected collection: ${name}`);
});
jest.mock("../utils/firebase", () => ({
  db: { collection: mockCollection },
}));

const mockEnforceRateLimit = jest.fn().mockResolvedValue(undefined);
const mockCallerKey = jest.fn().mockReturnValue("test-ip");
jest.mock("../utils/rateLimit", () => ({
  enforceRateLimit: mockEnforceRateLimit,
  callerKey: mockCallerKey,
}));

// Default: meetings subquery returns empty. Individual tests can override.
beforeEach(() => {
  mockMeetingsGet.mockResolvedValue({ docs: [] });
  mockWhere.mockReturnValue({ limit: mockLimit, where: mockWhere });
  mockLimit.mockReturnValue({ get: mockMeetingsGet });
});

// ---- Imports ----
import { getPublicGroupProfile } from "../callable/getPublicGroupProfile";

// ---- Helpers ----
function makeRequest(data: any) {
  return { data, auth: undefined } as any;
}

function makeGroupSnap(data: any, exists = true) {
  return { exists, data: () => data, id: data?.id ?? "group-1" };
}

const FULL_GROUP_DOC = {
  id: "group-1",
  name: "Downtown Monday Beginners",
  description: "A beginner-friendly AA group.",
  type: "AA",
  placeName: "First Methodist Church",
  location: "123 Main St, Phoenix, AZ 85001",
  address: "123 Main St",
  city: "Phoenix",
  state: "AZ",
  zip: "85001",
  lat: 33.45,
  lng: -112.07,
  foundedDate: "2010-05-01",
  memberCount: 42,
  isClaimed: true,
  admins: ["user-admin-1"],
  treasurers: ["user-admin-1"],
  stripeCustomerId: "cus_xxx",
  stripeSubscriptionId: "sub_xxx",
  subscriptionStatus: "active",
  meetings: [
    {
      day: "1",
      time: "19:00",
      format: "Open Discussion",
      locationName: "Fellowship Hall",
      online: false,
      onlineLink: "https://zoom.us/j/secret",
      onlineNotes: "Password: recovery",
    },
  ],
  publicProfileEnabled: true,
};

// ---- Tests ----
describe("getPublicGroupProfile", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  it("throws invalid-argument when groupId missing", async () => {
    const { getPublicGroupProfile: fn } =
      await import("../callable/getPublicGroupProfile");
    await expect((fn as any)(makeRequest({}))).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  it("throws not-found when group does not exist", async () => {
    mockGroupGet.mockResolvedValueOnce(makeGroupSnap(null, false));
    const { getPublicGroupProfile: fn } =
      await import("../callable/getPublicGroupProfile");
    await expect(
      (fn as any)(makeRequest({ groupId: "missing" })),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("throws not-found when publicProfileEnabled is false", async () => {
    mockGroupGet.mockResolvedValueOnce(
      makeGroupSnap({ ...FULL_GROUP_DOC, publicProfileEnabled: false }),
    );
    const { getPublicGroupProfile: fn } =
      await import("../callable/getPublicGroupProfile");
    await expect(
      (fn as any)(makeRequest({ groupId: "group-1" })),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("defaults publicProfileEnabled to true when absent", async () => {
    const { publicProfileEnabled, ...rest } = FULL_GROUP_DOC;
    mockGroupGet.mockResolvedValueOnce(makeGroupSnap(rest));
    const { getPublicGroupProfile: fn } =
      await import("../callable/getPublicGroupProfile");
    const result = await (fn as any)(makeRequest({ groupId: "group-1" }));
    expect(result.name).toBe("Downtown Monday Beginners");
  });

  it("returns ONLY allowlisted fields for a claimed group", async () => {
    mockGroupGet.mockResolvedValueOnce(makeGroupSnap(FULL_GROUP_DOC));
    const { getPublicGroupProfile: fn } =
      await import("../callable/getPublicGroupProfile");
    const result = await (fn as any)(makeRequest({ groupId: "group-1" }));

    // Allowlist regression guard — any new field appearing here fails the test.
    expect(Object.keys(result).sort()).toEqual(
      [
        "id",
        "name",
        "type",
        "description",
        "placeName",
        "city",
        "state",
        "isClaimed",
        "meetings",
      ].sort(),
    );

    expect(result.name).toBe("Downtown Monday Beginners");
    expect(result.type).toBe("AA");
    expect(result.description).toBe("A beginner-friendly AA group.");
    expect(result.placeName).toBe("First Methodist Church");
    expect(result.city).toBe("Phoenix");
    expect(result.state).toBe("AZ");
    expect(result.isClaimed).toBe(true);
  });

  it("omits description when group is unclaimed", async () => {
    mockGroupGet.mockResolvedValueOnce(
      makeGroupSnap({ ...FULL_GROUP_DOC, isClaimed: false }),
    );
    const { getPublicGroupProfile: fn } =
      await import("../callable/getPublicGroupProfile");
    const result = await (fn as any)(makeRequest({ groupId: "group-1" }));
    expect(result.description).toBeUndefined();
    expect(result.isClaimed).toBe(false);
  });

  it("filters meeting fields — no onlineLink or onlineNotes leaked", async () => {
    mockGroupGet.mockResolvedValueOnce(makeGroupSnap(FULL_GROUP_DOC));
    const { getPublicGroupProfile: fn } =
      await import("../callable/getPublicGroupProfile");
    const result = await (fn as any)(makeRequest({ groupId: "group-1" }));
    expect(result.meetings).toHaveLength(1);
    const m = result.meetings[0];
    expect(Object.keys(m).sort()).toEqual(
      ["day", "time", "format", "locationName", "isOnline"].sort(),
    );
    expect((m as any).onlineLink).toBeUndefined();
    expect((m as any).onlineNotes).toBeUndefined();
  });

  it("does not leak address, coordinates, member count, treasury, or Stripe fields", async () => {
    mockGroupGet.mockResolvedValueOnce(makeGroupSnap(FULL_GROUP_DOC));
    const { getPublicGroupProfile: fn } =
      await import("../callable/getPublicGroupProfile");
    const result = await (fn as any)(makeRequest({ groupId: "group-1" }));
    const leaked = [
      "address",
      "zip",
      "lat",
      "lng",
      "memberCount",
      "foundedDate",
      "admins",
      "treasurers",
      "stripeCustomerId",
      "stripeSubscriptionId",
      "subscriptionStatus",
      "location",
    ];
    for (const field of leaked) {
      expect((result as any)[field]).toBeUndefined();
    }
  });

  it("falls back to top-level meetings collection when group.meetings is empty", async () => {
    const scrapedGroup = {
      ...FULL_GROUP_DOC,
      meetings: [], // scraped group has empty array on the group doc
    };
    mockGroupGet.mockResolvedValueOnce(makeGroupSnap(scrapedGroup));
    // Top-level meetings collection has the real data
    mockMeetingsGet.mockResolvedValueOnce({
      docs: [
        {
          data: () => ({
            groupId: "group-1",
            day: "sunday",
            time: "19:00",
            format: "Big Book,Open,English",
            locationName: "Presbyterian Church, Placitas",
            online: false,
            // Sensitive fields that must NOT leak:
            formattedAddress: "7 Paseo De San Antonio Rd",
            lat: 35.3,
            lng: -106.4,
            apiId: 330217,
          }),
        },
      ],
    });

    const { getPublicGroupProfile: fn } =
      await import("../callable/getPublicGroupProfile");
    const result = await (fn as any)(makeRequest({ groupId: "group-1" }));

    expect(result.meetings).toHaveLength(1);
    const m = result.meetings[0];
    expect(m.day).toBe("sunday");
    expect(m.time).toBe("19:00");
    expect(m.format).toBe("Big Book,Open,English");
    expect(m.locationName).toBe("Presbyterian Church, Placitas");
    expect(m.isOnline).toBe(false);

    // Allowlist still enforced — no formattedAddress/lat/lng/apiId
    expect(Object.keys(m).sort()).toEqual(
      ["day", "time", "format", "locationName", "isOnline"].sort(),
    );
  });

  it("skips fallback query when group.meetings is already populated", async () => {
    // Claimed group with a meeting already in the group doc
    mockGroupGet.mockResolvedValueOnce(makeGroupSnap(FULL_GROUP_DOC));

    const { getPublicGroupProfile: fn } =
      await import("../callable/getPublicGroupProfile");
    await (fn as any)(makeRequest({ groupId: "group-1" }));

    // The meetings collection must NOT have been queried
    expect(mockMeetingsGet).not.toHaveBeenCalled();
  });

  it("propagates resource-exhausted when the caller has been rate limited, without touching Firestore", async () => {
    mockEnforceRateLimit.mockRejectedValueOnce({
      code: "resource-exhausted",
      message: "Too many requests. Please try again shortly.",
    });
    const { getPublicGroupProfile: fn } =
      await import("../callable/getPublicGroupProfile");
    await expect(
      (fn as any)(makeRequest({ groupId: "group-1" })),
    ).rejects.toMatchObject({ code: "resource-exhausted" });
    expect(mockGroupGet).not.toHaveBeenCalled();
  });
});
