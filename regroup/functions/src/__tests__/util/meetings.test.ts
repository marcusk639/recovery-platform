jest.mock("firebase-functions", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockPartialGeocode = jest.fn();
jest.mock("../../api/api", () => ({
  partialGeocode: mockPartialGeocode,
}));

const mockGetMeetings = jest.fn();
jest.mock("../../api/firestore", () => ({
  getMeetings: mockGetMeetings,
  ratsFirestore: { collection: jest.fn() },
  app: {},
}));

import { filterCustomMeetings, geocodeNAMeeting } from "../../util/meetings";

beforeEach(() => jest.clearAllMocks());

// -----------------------------------------------------------------------
// filterCustomMeetings
// -----------------------------------------------------------------------
describe("filterCustomMeetings", () => {
  const meetings: any[] = [
    {
      name: "Serenity Group",
      city: "Austin",
      street: "123 Main St",
      state: "TX",
      lat: 30.267,
      lng: -97.743,
    },
    {
      name: "Hope Circle",
      city: "Houston",
      street: "456 Oak Ave",
      state: "TX",
      lat: 29.76,
      lng: -95.37,
    },
    {
      name: "Freedom Step",
      city: "Dallas",
      street: "789 Elm Blvd",
      state: "TX",
      lat: 32.776,
      lng: -96.796,
    },
  ];

  it("filters by name (case-insensitive partial match)", () => {
    const result = filterCustomMeetings(meetings, { name: "serenity" });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Serenity Group");
  });

  it("filters by city (exact case)", () => {
    const result = filterCustomMeetings(meetings, { city: "Houston" });
    expect(result).toHaveLength(1);
    expect(result[0].city).toBe("Houston");
  });

  it("filters by city (case-insensitive)", () => {
    const result = filterCustomMeetings(meetings, { city: "dallas" });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Freedom Step");
  });

  it("filters by street (partial match)", () => {
    const result = filterCustomMeetings(meetings, { street: "Oak" });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Hope Circle");
  });

  it("filters by state", () => {
    const result = filterCustomMeetings(meetings, { state: "TX" });
    expect(result).toHaveLength(3);
  });

  it("returns all when no criteria provided (empty object)", () => {
    expect(filterCustomMeetings(meetings, {})).toHaveLength(3);
  });

  it("returns empty array when nothing matches", () => {
    const result = filterCustomMeetings(meetings, { name: "nonexistent" });
    expect(result).toHaveLength(0);
  });

  it("combines multiple criteria (AND logic)", () => {
    const result = filterCustomMeetings(meetings, {
      city: "Austin",
      name: "Serenity",
    });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Serenity Group");
  });

  it("returns empty when criteria combination has no match", () => {
    const result = filterCustomMeetings(meetings, {
      city: "Austin",
      name: "Hope",
    });
    expect(result).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------
// geocodeNAMeeting
// -----------------------------------------------------------------------
describe("geocodeNAMeeting", () => {
  it("returns location from first result with geometry", async () => {
    mockPartialGeocode.mockResolvedValue({
      results: [{ geometry: { location: { lat: 30.267, lng: -97.743 } } }],
    });
    const result = await geocodeNAMeeting("123 Main St Austin TX");
    expect(result).toEqual({ lat: 30.267, lng: -97.743 });
  });

  it("returns undefined when results array is empty", async () => {
    mockPartialGeocode.mockResolvedValue({ results: [] });
    const result = await geocodeNAMeeting("nowhere");
    expect(result).toBeUndefined();
  });

  it("returns undefined when result has no geometry", async () => {
    mockPartialGeocode.mockResolvedValue({
      results: [{ geometry: null }],
    });
    const result = await geocodeNAMeeting("bad address");
    expect(result).toBeUndefined();
  });

  it("calls partialGeocode with the provided query string", async () => {
    mockPartialGeocode.mockResolvedValue({ results: [] });
    await geocodeNAMeeting("456 Oak St Dallas TX");
    expect(mockPartialGeocode).toHaveBeenCalledWith("456 Oak St Dallas TX");
  });

  it("returns the first valid location when multiple results exist", async () => {
    mockPartialGeocode.mockResolvedValue({
      results: [
        { geometry: { location: { lat: 10.0, lng: 20.0 } } },
        { geometry: { location: { lat: 30.0, lng: 40.0 } } },
      ],
    });
    const result = await geocodeNAMeeting("some address");
    expect(result).toEqual({ lat: 10.0, lng: 20.0 });
  });
});
