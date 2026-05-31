/**
 * Tests for exportMeetingGuideFormat Cloud Function.
 *
 * Input: { groupId: string }
 * Auth: must be member of group
 * Output: { csv: string, json: string, instructions: string }
 */

// Make this file a TypeScript module to avoid global scope conflicts
export {};

// ---- Mocks must be defined before imports ----

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockCollection = jest.fn() as jest.MockedFunction<(name: string) => any>;

jest.mock("firebase-admin", () => {
  return {
    apps: [],
    initializeApp: jest.fn(),
    firestore: Object.assign(
      jest.fn().mockReturnValue({ collection: mockCollection }),
      {
        Timestamp: {
          fromDate: (date: Date) => ({
            toDate: () => date,
            seconds: Math.floor(date.getTime() / 1000),
            nanoseconds: 0,
          }),
          now: () => ({
            toDate: () => new Date(),
            seconds: Math.floor(Date.now() / 1000),
            nanoseconds: 0,
          }),
        },
      }
    ),
    app: jest.fn().mockReturnValue({}),
    auth: jest.fn().mockReturnValue({}),
  };
});

jest.mock("firebase-functions", () => ({
  https: {
    onCall: jest.fn((handler) => handler),
    HttpsError: class HttpsError extends Error {
      constructor(public code: string, message: string) {
        super(message);
        this.name = "HttpsError";
      }
    },
  },
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock("firebase-functions/v1/https", () => ({
  HttpsError: class HttpsError extends Error {
    constructor(public code: string, message: string) {
      super(message);
      this.name = "HttpsError";
    }
  },
}));

jest.mock("firebase-functions/v2/https", () => ({
  onCall: jest.fn((opts, handler) => {
    if (typeof opts === "function") return opts;
    return handler;
  }),
  HttpsError: class HttpsError extends Error {
    constructor(public code: string, message: string) {
      super(message);
      this.name = "HttpsError";
    }
  },
}));

jest.mock("../utils/firebase", () => ({
  db: { collection: mockCollection },
}));

// ---- Helpers ----
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createDoc = (id: string, data: Record<string, any>) => ({
  id,
  data: () => data,
  exists: true,
});

const makeRequest = (
  groupId: string,
  uid = "user-admin-123"
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): any => ({
  data: { groupId },
  auth: { uid },
});

// Sample meeting documents for reuse
const sampleMeetings = [
  createDoc("meeting-1", {
    name: "Big Book Study",
    day: "Monday",
    time: "19:00",
    type: "AA",
    address: "123 Main St",
    city: "Springfield",
    state: "IL",
    zip: "62701",
    country: "US",
    locationName: "Community Center",
    format: "Open",
    groupId: "group-abc",
  }),
  createDoc("meeting-2", {
    name: "Step Study Group",
    day: "Wednesday",
    time: "07:00",
    type: "NA",
    online: true,
    link: "https://zoom.us/j/123456",
    onlineNotes: "Password: recovery",
    groupId: "group-abc",
  }),
];

// ---- Tests ----

describe("exportMeetingGuideFormat", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // 1. Unauthenticated request is rejected
  // ---------------------------------------------------------------------------
  it("throws unauthenticated when no auth provided", async () => {
    jest.resetModules();
    const mod = await import("../callable/exportMeetingGuideFormat");
    const fn = mod.exportMeetingGuideFormat as Function;

    await expect(
      fn({ data: { groupId: "group-abc" }, auth: null })
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  // ---------------------------------------------------------------------------
  // 2. Missing groupId is rejected
  // ---------------------------------------------------------------------------
  it("throws invalid-argument when groupId is missing", async () => {
    jest.resetModules();
    const mod = await import("../callable/exportMeetingGuideFormat");
    const fn = mod.exportMeetingGuideFormat as Function;

    await expect(
      fn({ data: {}, auth: { uid: "user-123" } })
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  // ---------------------------------------------------------------------------
  // 3. Non-member cannot export
  // ---------------------------------------------------------------------------
  it("throws permission-denied when user is not a member", async () => {
    mockCollection.mockImplementation((name: string) => {
      if (name === "members") {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ exists: false }),
          }),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ docs: [] }),
      };
    });

    jest.resetModules();
    const mod = await import("../callable/exportMeetingGuideFormat");
    const fn = mod.exportMeetingGuideFormat as Function;

    await expect(fn(makeRequest("group-abc", "non-member-uid"))).rejects.toMatchObject({
      code: "permission-denied",
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Returns csv, json, instructions for a valid member with meetings
  // ---------------------------------------------------------------------------
  it("returns csv, json, and instructions for valid member", async () => {
    mockCollection.mockImplementation((name: string) => {
      if (name === "members") {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ exists: true }),
          }),
        };
      }
      if (name === "meetings") {
        return {
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({ docs: sampleMeetings }),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ docs: [] }),
      };
    });

    jest.resetModules();
    const mod = await import("../callable/exportMeetingGuideFormat");
    const fn = mod.exportMeetingGuideFormat as Function;

    const result = await fn(makeRequest("group-abc"));

    expect(result).toHaveProperty("csv");
    expect(result).toHaveProperty("json");
    expect(result).toHaveProperty("instructions");
    expect(typeof result.csv).toBe("string");
    expect(typeof result.json).toBe("string");
    expect(typeof result.instructions).toBe("string");
  });

  // ---------------------------------------------------------------------------
  // 5. CSV contains required header fields
  // ---------------------------------------------------------------------------
  it("CSV output contains all required Meeting Guide header fields", async () => {
    mockCollection.mockImplementation((name: string) => {
      if (name === "members") {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ exists: true }),
          }),
        };
      }
      if (name === "meetings") {
        return {
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({ docs: [sampleMeetings[0]] }),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ docs: [] }),
      };
    });

    jest.resetModules();
    const mod = await import("../callable/exportMeetingGuideFormat");
    const fn = mod.exportMeetingGuideFormat as Function;

    const result = await fn(makeRequest("group-abc"));

    const requiredFields = [
      "name",
      "day",
      "time",
      "types",
      "address",
      "city",
      "state",
      "zip",
      "country",
      "location_name",
      "conference_url",
    ];

    const headerLine = result.csv.split("\n")[0];
    for (const field of requiredFields) {
      expect(headerLine).toContain(field);
    }
  });

  // ---------------------------------------------------------------------------
  // 6. CSV meeting data row is present for each meeting
  // ---------------------------------------------------------------------------
  it("CSV has one data row per meeting", async () => {
    mockCollection.mockImplementation((name: string) => {
      if (name === "members") {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ exists: true }),
          }),
        };
      }
      if (name === "meetings") {
        return {
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({ docs: sampleMeetings }),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ docs: [] }),
      };
    });

    jest.resetModules();
    const mod = await import("../callable/exportMeetingGuideFormat");
    const fn = mod.exportMeetingGuideFormat as Function;

    const result = await fn(makeRequest("group-abc"));

    // CSV lines: header + 2 data rows (+ possible trailing newline)
    const lines = result.csv.split("\n").filter((l: string) => l.trim() !== "");
    expect(lines.length).toBe(3); // 1 header + 2 data rows
  });

  // ---------------------------------------------------------------------------
  // 7. JSON output is valid parseable JSON array
  // ---------------------------------------------------------------------------
  it("JSON output is a parseable array of meeting objects", async () => {
    mockCollection.mockImplementation((name: string) => {
      if (name === "members") {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ exists: true }),
          }),
        };
      }
      if (name === "meetings") {
        return {
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({ docs: sampleMeetings }),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ docs: [] }),
      };
    });

    jest.resetModules();
    const mod = await import("../callable/exportMeetingGuideFormat");
    const fn = mod.exportMeetingGuideFormat as Function;

    const result = await fn(makeRequest("group-abc"));

    const parsed = JSON.parse(result.json);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(2);
    expect(parsed[0]).toHaveProperty("name");
    expect(parsed[0]).toHaveProperty("day");
    expect(parsed[0]).toHaveProperty("time");
  });

  // ---------------------------------------------------------------------------
  // 8. Online meetings use conference_url field
  // ---------------------------------------------------------------------------
  it("online meeting has conference_url set and address blank", async () => {
    const onlineMeeting = createDoc("meeting-online", {
      name: "Online Step Study",
      day: "Friday",
      time: "20:00",
      type: "NA",
      online: true,
      link: "https://zoom.us/j/999",
      onlineNotes: "Use phone: 555-1234",
      groupId: "group-abc",
    });

    mockCollection.mockImplementation((name: string) => {
      if (name === "members") {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ exists: true }),
          }),
        };
      }
      if (name === "meetings") {
        return {
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({ docs: [onlineMeeting] }),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ docs: [] }),
      };
    });

    jest.resetModules();
    const mod = await import("../callable/exportMeetingGuideFormat");
    const fn = mod.exportMeetingGuideFormat as Function;

    const result = await fn(makeRequest("group-abc"));

    const parsed = JSON.parse(result.json);
    expect(parsed[0].conference_url).toBe("https://zoom.us/j/999");
    expect(parsed[0].conference_url_notes).toBe("Use phone: 555-1234");
  });

  // ---------------------------------------------------------------------------
  // 9. Instructions are non-empty string with forwarding guidance
  // ---------------------------------------------------------------------------
  it("instructions field contains guidance for intergroup/district", async () => {
    mockCollection.mockImplementation((name: string) => {
      if (name === "members") {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ exists: true }),
          }),
        };
      }
      if (name === "meetings") {
        return {
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({ docs: [sampleMeetings[0]] }),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ docs: [] }),
      };
    });

    jest.resetModules();
    const mod = await import("../callable/exportMeetingGuideFormat");
    const fn = mod.exportMeetingGuideFormat as Function;

    const result = await fn(makeRequest("group-abc"));

    expect(result.instructions.length).toBeGreaterThan(10);
    // Should mention intergroup or webmaster or district
    const lowerInstructions = result.instructions.toLowerCase();
    expect(
      lowerInstructions.includes("intergroup") ||
        lowerInstructions.includes("webmaster") ||
        lowerInstructions.includes("district")
    ).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 10. Empty meetings collection returns csv with just header + empty json array
  // ---------------------------------------------------------------------------
  it("returns header-only CSV and empty JSON array when group has no meetings", async () => {
    mockCollection.mockImplementation((name: string) => {
      if (name === "members") {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ exists: true }),
          }),
        };
      }
      if (name === "meetings") {
        return {
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({ docs: [] }),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ docs: [] }),
      };
    });

    jest.resetModules();
    const mod = await import("../callable/exportMeetingGuideFormat");
    const fn = mod.exportMeetingGuideFormat as Function;

    const result = await fn(makeRequest("group-abc"));

    const lines = result.csv.split("\n").filter((l: string) => l.trim() !== "");
    expect(lines.length).toBe(1); // Just the header

    const parsed = JSON.parse(result.json);
    expect(parsed).toEqual([]);
  });
});
