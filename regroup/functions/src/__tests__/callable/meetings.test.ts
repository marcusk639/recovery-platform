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

const mockGetAlcoholicsAnonymousMeetings = jest.fn();
const mockGetNarcoticsAnoymousMeetings = jest.fn();
const mockGetAll12StepMeetings = jest.fn();
const mockGeocodeNAMeeting = jest.fn();

jest.mock("../../util/meetings", () => ({
  getAlcoholicsAnonymousMeetings: mockGetAlcoholicsAnonymousMeetings,
  getNarcoticsAnoymousMeetings: mockGetNarcoticsAnoymousMeetings,
  getAll12StepMeetings: mockGetAll12StepMeetings,
  geocodeNAMeeting: mockGeocodeNAMeeting,
  getCustomMeetings: jest.fn().mockResolvedValue([]),
  getCelebrateMeetings: jest.fn().mockResolvedValue([]),
}));

const mockGetDistance = jest.fn();
jest.mock("../../util/location", () => ({
  getDistance: mockGetDistance,
}));

import { findMeetings, userIsAtMeeting } from "../../callable/meetings";

const fakeAuth = { uid: "test-user" };
const call = (fn: unknown, data: unknown) =>
  (fn as Function)({ data, auth: fakeAuth });

beforeEach(() => jest.clearAllMocks());

describe("findMeetings", () => {
  const location = { lat: 30.267, lng: -97.743 };

  it("calls getAlcoholicsAnonymousMeetings for AA type", async () => {
    mockGetAlcoholicsAnonymousMeetings.mockResolvedValue([]);
    await call(findMeetings, { filters: { type: "AA", location, day: "" } });
    expect(mockGetAlcoholicsAnonymousMeetings).toHaveBeenCalled();
  });

  it("calls getNarcoticsAnoymousMeetings for NA type", async () => {
    mockGetNarcoticsAnoymousMeetings.mockResolvedValue([]);
    await call(findMeetings, {
      filters: { type: "NA", location, day: "monday" },
    });
    expect(mockGetNarcoticsAnoymousMeetings).toHaveBeenCalled();
  });

  it('calls getAll12StepMeetings for "all" type', async () => {
    mockGetAll12StepMeetings.mockResolvedValue([]);
    await call(findMeetings, { filters: { type: "all", location, day: "" } });
    expect(mockGetAll12StepMeetings).toHaveBeenCalled();
  });

  it("returns an array of meeting results", async () => {
    mockGetAlcoholicsAnonymousMeetings.mockResolvedValue([
      { name: "AA Meeting" },
    ]);
    const result = await call(findMeetings, {
      filters: { type: "AA", location, day: "" },
    });
    expect(Array.isArray(result)).toBe(true);
  });

  it("returns meetings from the resolved promise", async () => {
    const fakeMeetings = [
      { name: "Test Meeting" },
      { name: "Another Meeting" },
    ];
    mockGetAlcoholicsAnonymousMeetings.mockResolvedValue(fakeMeetings);
    const result = await call(findMeetings, {
      filters: { type: "AA", location, day: "" },
    });
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Test Meeting");
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
