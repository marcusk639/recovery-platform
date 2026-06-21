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

const mockFetchDirectoryMeetings = jest.fn();
jest.mock("../../api/recoveryApi", () => ({
  fetchDirectoryMeetings: mockFetchDirectoryMeetings,
}));

const mockGetCustomMeetings = jest.fn();
const mockGeocodeNAMeeting = jest.fn();
jest.mock("../../util/meetings", () => ({
  getCustomMeetings: mockGetCustomMeetings,
  geocodeNAMeeting: mockGeocodeNAMeeting,
}));

const mockGetDistance = jest.fn();
jest.mock("../../util/location", () => ({
  getDistance: mockGetDistance,
}));

import { findMeetings, userIsAtMeeting } from "../../callable/meetings";

const fakeAuth = { uid: "test-user" };
const call = (fn: unknown, data: unknown) =>
  (fn as Function)({ data, auth: fakeAuth });

const directoryMeeting = (over: Record<string, unknown> = {}) => ({
  id: "dir-1",
  source: "external",
  provider: "AA",
  name: "AA Meeting",
  day: 1,
  time: "19:30",
  location: { lat: 30.2, lng: -97.7, address: "1 Main St", city: "Austin" },
  online: false,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchDirectoryMeetings.mockResolvedValue([]);
  mockGetCustomMeetings.mockResolvedValue([]);
});

describe("findMeetings", () => {
  const location = { lat: 30.267, lng: -97.743 };

  it("queries the recovery-api directory for AA type", async () => {
    await call(findMeetings, { filters: { type: "AA", location, day: "" } });
    expect(mockFetchDirectoryMeetings).toHaveBeenCalled();
  });

  it("queries the recovery-api directory for NA type", async () => {
    await call(findMeetings, {
      filters: { type: "NA", location, day: "monday" },
    });
    expect(mockFetchDirectoryMeetings).toHaveBeenCalled();
  });

  it("filters directory results down to the requested provider", async () => {
    mockFetchDirectoryMeetings.mockResolvedValue([
      directoryMeeting({ provider: "AA", name: "AA One" }),
      directoryMeeting({ provider: "NA", name: "NA One" }),
    ]);
    const result = await call(findMeetings, {
      filters: { type: "AA", location, day: "" },
    });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("AA One");
    expect(result[0].type).toBe("AA");
  });

  it("returns custom meetings only for Custom type without hitting the directory", async () => {
    mockGetCustomMeetings.mockResolvedValue([{ name: "House Meeting" }]);
    const result = await call(findMeetings, {
      filters: { type: "Custom", location, day: "" },
    });
    expect(mockFetchDirectoryMeetings).not.toHaveBeenCalled();
    expect(result).toEqual([{ name: "House Meeting" }]);
  });

  it("merges directory + custom meetings for 'all' type", async () => {
    mockFetchDirectoryMeetings.mockResolvedValue([
      directoryMeeting({ provider: "AA", name: "AA One" }),
    ]);
    mockGetCustomMeetings.mockResolvedValue([{ name: "House Meeting" }]);
    const result = await call(findMeetings, {
      filters: { type: "all", location, day: "" },
    });
    const names = result.map((m: any) => m.name);
    expect(names).toContain("AA One");
    expect(names).toContain("House Meeting");
  });

  it("returns an empty array for AL-ANON without hitting the directory", async () => {
    const result = await call(findMeetings, {
      filters: { type: "AL-ANON", location, day: "" },
    });
    expect(result).toEqual([]);
    expect(mockFetchDirectoryMeetings).not.toHaveBeenCalled();
  });

  it("returns an array of RatsMeeting results", async () => {
    mockFetchDirectoryMeetings.mockResolvedValue([directoryMeeting()]);
    const result = await call(findMeetings, {
      filters: { type: "AA", location, day: "" },
    });
    expect(Array.isArray(result)).toBe(true);
    expect(result[0].name).toBe("AA Meeting");
  });

  it("maps the directory day index to a weekday string", async () => {
    mockFetchDirectoryMeetings.mockResolvedValue([
      directoryMeeting({ day: 1 }),
    ]);
    const result = await call(findMeetings, {
      filters: { type: "AA", location, day: "monday" },
    });
    expect(result[0].day).toBe("monday");
  });

  it("forwards the numeric day index and caller uid to the directory query", async () => {
    await call(findMeetings, {
      filters: { type: "AA", location, day: "monday" },
    });
    expect(mockFetchDirectoryMeetings).toHaveBeenCalledWith(
      expect.objectContaining({ day: 1 }),
      expect.objectContaining({ uid: "test-user" }),
    );
  });

  it("filters mapped results by name criteria", async () => {
    mockFetchDirectoryMeetings.mockResolvedValue([
      directoryMeeting({ name: "Sunrise Group" }),
      directoryMeeting({ name: "Evening Group" }),
    ]);
    const result = await call(findMeetings, {
      filters: { type: "AA", location, day: "" },
      criteria: { name: "sunrise" },
    });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Sunrise Group");
  });
});

describe("userIsAtMeeting", () => {
  it("returns true when user is within acceptable distance (200m)", async () => {
    mockGetDistance.mockReturnValue(100);
    const result = await call(userIsAtMeeting, {
      userLocation: { lat: 30.267, lng: -97.743 },
      meetingLocation: { lat: 30.268, lng: -97.744 },
    });
    expect(result).toBe(true);
  });

  it("returns true when user is exactly at the threshold (200m)", async () => {
    mockGetDistance.mockReturnValue(200);
    const result = await call(userIsAtMeeting, {
      userLocation: { lat: 30.267, lng: -97.743 },
      meetingLocation: { lat: 30.268, lng: -97.744 },
    });
    expect(result).toBe(true);
  });

  it("returns false when user is too far away", async () => {
    mockGetDistance.mockReturnValue(5000);
    const result = await call(userIsAtMeeting, {
      userLocation: { lat: 30.0, lng: -97.0 },
      meetingLocation: { lat: 31.0, lng: -98.0 },
    });
    expect(result).toBe(false);
  });

  it("returns false when geocoding a NA meeting address fails", async () => {
    mockGeocodeNAMeeting.mockRejectedValue(new Error("Geocode failed"));
    const result = await call(userIsAtMeeting, {
      userLocation: { lat: 30.267, lng: -97.743 },
      meetingAddress: "123 Main St, Austin TX",
    });
    expect(result).toBe(false);
  });

  it("uses geocoded location when meetingAddress is provided", async () => {
    const geocodedLocation = { lat: 30.269, lng: -97.745 };
    mockGeocodeNAMeeting.mockResolvedValue(geocodedLocation);
    mockGetDistance.mockReturnValue(50);
    const result = await call(userIsAtMeeting, {
      userLocation: { lat: 30.267, lng: -97.743 },
      meetingAddress: "123 Main St, Austin TX",
    });
    expect(mockGeocodeNAMeeting).toHaveBeenCalledWith("123 Main St, Austin TX");
    expect(result).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Input validation tests
// ──────────────────────────────────────────────────────────────────────────────

describe("findMeetings — input validation", () => {
  it("throws invalid-argument when filters is missing", async () => {
    await expect(
      (findMeetings as Function)({ data: {}, auth: fakeAuth }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("throws invalid-argument when location is missing from filters", async () => {
    await expect(
      (findMeetings as Function)({
        data: { filters: { day: "Monday", type: "AA" } },
        auth: fakeAuth,
      }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("throws invalid-argument when type is an unknown meeting type", async () => {
    await expect(
      (findMeetings as Function)({
        data: {
          filters: {
            location: { lat: 0, lng: 0 },
            day: "Monday",
            type: "UNKNOWN",
          },
        },
        auth: fakeAuth,
      }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });
});

describe("userIsAtMeeting — input validation", () => {
  it("returns false gracefully when all location fields are missing", async () => {
    const result = await (userIsAtMeeting as Function)({
      data: {},
      auth: fakeAuth,
    });
    expect(result).toBe(false);
  });

  it("throws invalid-argument when userLocation has wrong shape", async () => {
    await expect(
      (userIsAtMeeting as Function)({
        data: { userLocation: { x: 1, y: 2 } },
        auth: fakeAuth,
      }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });
});
