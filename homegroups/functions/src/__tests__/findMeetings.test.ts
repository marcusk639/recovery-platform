/**
 * Tests for findMeetings callable function (FH-1: auth check)
 */

export {}; // Ensure this file is treated as an isolated module by TypeScript

// ---- Mocks must come before any imports ----

const mockHttpsError = jest.fn().mockImplementation(function (
  this: Error & { code: string },
  code: string,
  message: string,
) {
  this.code = code;
  this.message = message;
  Object.setPrototypeOf(this, Error.prototype);
});

jest.mock("firebase-functions", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  https: {
    onCall: jest.fn().mockImplementation((handler: Function) => handler),
    HttpsError: mockHttpsError,
  },
}));

jest.mock("firebase-functions/v1", () => ({
  pubsub: {
    schedule: jest.fn().mockReturnValue({
      timeZone: jest.fn().mockReturnValue({
        onRun: jest.fn().mockImplementation((h: Function) => h),
      }),
    }),
  },
  firestore: {
    document: jest.fn().mockReturnValue({
      onCreate: jest.fn().mockImplementation((h: Function) => h),
    }),
  },
}));

jest.mock("firebase-functions/v2/https", () => ({
  onCall: jest
    .fn()
    .mockImplementation((arg1: unknown, arg2?: unknown) =>
      typeof arg1 === "function" ? arg1 : arg2,
    ),
  HttpsError: mockHttpsError,
}));

// logger mock comes from functions/jest.setup.ts (shared)

jest.mock("firebase-admin", () => ({
  apps: [],
  initializeApp: jest.fn(),
  firestore: Object.assign(jest.fn().mockReturnValue({}), {
    Timestamp: { fromDate: jest.fn(), now: jest.fn() },
  }),
  app: jest.fn().mockReturnValue({}),
  auth: jest.fn().mockReturnValue({}),
}));

jest.mock("firebase-admin/messaging", () => ({
  getMessaging: jest.fn().mockReturnValue({ sendEachForMulticast: jest.fn() }),
}));

jest.mock("../utils/firebase", () => ({
  db: { collection: jest.fn() },
  messaging: { sendEachForMulticast: jest.fn() },
}));

// Mock the (kept) Firestore-backed meetings utilities. NA/CR external fetchers
// were removed in B4 — discovery for those now routes through recovery-api.
jest.mock("../utils/meetings", () => ({
  getCustomMeetings: jest.fn().mockResolvedValue([]),
  getAlcoholicsAnonymousMeetings: jest.fn().mockResolvedValue([]),
}));

// Mock the recovery-api directory client so tests make no real HTTP calls.
jest.mock("../api/recoveryApi", () => ({
  fetchDirectoryMeetings: jest.fn().mockResolvedValue([]),
}));

// defineSecret(...).value() is called in the callable; stub the params module.
jest.mock("firebase-functions/params", () => ({
  defineSecret: jest.fn().mockReturnValue({ value: () => "test-key" }),
}));

// ---- Tests ----

describe("findMeetings auth check (FH-1)", () => {
  it("throws unauthenticated error when request.auth is null", async () => {
    jest.resetModules();
    const { findMeetings } = await import("../callable/findMeetings");

    const unauthRequest = {
      auth: null,
      data: {
        filters: {
          date: "2026-02-22",
          location: { lat: 40.7128, lng: -74.006 },
          type: "AA" as const,
        },
      },
    };

    await expect(
      (findMeetings as Function)(unauthRequest),
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("throws unauthenticated error when request.auth is undefined", async () => {
    jest.resetModules();
    const { findMeetings } = await import("../callable/findMeetings");

    const unauthRequest = {
      auth: undefined,
      data: {
        filters: {
          date: "2026-02-22",
          location: { lat: 40.7128, lng: -74.006 },
        },
      },
    };

    await expect(
      (findMeetings as Function)(unauthRequest),
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("proceeds past auth check when request.auth is present", async () => {
    jest.resetModules();
    const { findMeetings } = await import("../callable/findMeetings");

    const authRequest = {
      auth: { uid: "user-123", token: {} },
      data: {
        filters: {
          date: "2026-02-22",
          location: { lat: 40.7128, lng: -74.006 },
          type: "AA" as const,
        },
      },
    };

    // Should not throw unauthenticated — it calls getAlcoholicsAnonymousMeetings
    // which we've mocked to return []. Result should be an empty array.
    const result = await (findMeetings as Function)(authRequest);
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("findMeetings input validation (B1)", () => {
  const authedRequest = (data: unknown) => ({
    auth: { uid: "user-123", token: {} },
    data,
  });

  it("rejects missing filters with invalid-argument", async () => {
    jest.resetModules();
    const { findMeetings } = await import("../callable/findMeetings");

    await expect(
      (findMeetings as Function)(authedRequest({})),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("rejects missing filters.location with invalid-argument", async () => {
    jest.resetModules();
    const { findMeetings } = await import("../callable/findMeetings");

    await expect(
      (findMeetings as Function)(authedRequest({ filters: { type: "AA" } })),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("rejects non-finite location coordinates with invalid-argument", async () => {
    jest.resetModules();
    const { findMeetings } = await import("../callable/findMeetings");

    await expect(
      (findMeetings as Function)(
        authedRequest({
          filters: { location: { lat: "40.7", lng: -74.006 } },
        }),
      ),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("rejects NaN location coordinates with invalid-argument", async () => {
    jest.resetModules();
    const { findMeetings } = await import("../callable/findMeetings");

    await expect(
      (findMeetings as Function)(
        authedRequest({ filters: { location: { lat: NaN, lng: -74.006 } } }),
      ),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("rejects Infinity location coordinates with invalid-argument", async () => {
    jest.resetModules();
    const { findMeetings } = await import("../callable/findMeetings");

    await expect(
      (findMeetings as Function)(
        authedRequest({
          filters: { location: { lat: 40.7128, lng: Infinity } },
        }),
      ),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("rejects an unknown filters.type with invalid-argument", async () => {
    jest.resetModules();
    const { findMeetings } = await import("../callable/findMeetings");

    await expect(
      (findMeetings as Function)(
        authedRequest({
          filters: {
            location: { lat: 40.7128, lng: -74.006 },
            type: "BOGUS",
          },
        }),
      ),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("rejects a non-string filters.day with invalid-argument", async () => {
    jest.resetModules();
    const { findMeetings } = await import("../callable/findMeetings");

    await expect(
      (findMeetings as Function)(
        authedRequest({
          filters: { location: { lat: 40.7128, lng: -74.006 }, day: 5 },
        }),
      ),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("defaults a missing type to 'all' and returns an array", async () => {
    jest.resetModules();
    const { findMeetings } = await import("../callable/findMeetings");

    const result = await (findMeetings as Function)(
      authedRequest({
        filters: { location: { lat: 40.7128, lng: -74.006 } },
      }),
    );
    expect(Array.isArray(result)).toBe(true);
  });

  it("passes valid input through unchanged and returns an array", async () => {
    jest.resetModules();
    const { findMeetings } = await import("../callable/findMeetings");

    const result = await (findMeetings as Function)(
      authedRequest({
        filters: {
          location: { lat: 40.7128, lng: -74.006 },
          day: "monday",
          type: "AA",
        },
        criteria: { city: "New York" },
      }),
    );
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("findMeetings directory orchestration (B4)", () => {
  const authedRequest = (data: unknown) => ({
    auth: { uid: "user-123", token: { email: "u@example.com" } },
    data,
  });

  const loadMocks = async () => {
    const meetings = await import("../utils/meetings");
    const recoveryApi = await import("../api/recoveryApi");
    return {
      getAlcoholicsAnonymousMeetings:
        meetings.getAlcoholicsAnonymousMeetings as jest.Mock,
      getCustomMeetings: meetings.getCustomMeetings as jest.Mock,
      fetchDirectoryMeetings: recoveryApi.fetchDirectoryMeetings as jest.Mock,
    };
  };

  const dirMeeting = (overrides: Record<string, unknown> = {}) => ({
    id: "dir-1",
    source: "external",
    provider: "NA",
    name: "Directory NA Group",
    day: 1,
    time: "19:30",
    location: {
      address: "123 Main St",
      city: "Austin",
      state: "TX",
      zip: "78701",
      lat: 30.267,
      lng: -97.743,
      geohash: "abc",
    },
    ...overrides,
  });

  it("NA type calls fetchDirectoryMeetings and NOT the Firestore AA fetcher", async () => {
    jest.resetModules();
    const { getAlcoholicsAnonymousMeetings, fetchDirectoryMeetings } =
      await loadMocks();
    fetchDirectoryMeetings.mockResolvedValueOnce([]);
    const { findMeetings } = await import("../callable/findMeetings");

    await (findMeetings as Function)(
      authedRequest({
        filters: { location: { lat: 30.2, lng: -97.7 }, type: "NA" },
      }),
    );

    expect(fetchDirectoryMeetings).toHaveBeenCalledTimes(1);
    expect(getAlcoholicsAnonymousMeetings).not.toHaveBeenCalled();
  });

  it("AA type calls getAlcoholicsAnonymousMeetings and NOT the directory", async () => {
    jest.resetModules();
    const { getAlcoholicsAnonymousMeetings, fetchDirectoryMeetings } =
      await loadMocks();
    getAlcoholicsAnonymousMeetings.mockResolvedValueOnce([]);
    const { findMeetings } = await import("../callable/findMeetings");

    await (findMeetings as Function)(
      authedRequest({
        filters: { location: { lat: 30.2, lng: -97.7 }, type: "AA" },
      }),
    );

    expect(getAlcoholicsAnonymousMeetings).toHaveBeenCalledTimes(1);
    expect(fetchDirectoryMeetings).not.toHaveBeenCalled();
  });

  it("filters directory results by provider for type 'all' (NA + CR only)", async () => {
    jest.resetModules();
    const {
      getAlcoholicsAnonymousMeetings,
      getCustomMeetings,
      fetchDirectoryMeetings,
    } = await loadMocks();
    getAlcoholicsAnonymousMeetings.mockResolvedValueOnce([]);
    getCustomMeetings.mockResolvedValueOnce([]);
    fetchDirectoryMeetings.mockResolvedValueOnce([
      dirMeeting({ id: "na-1", provider: "NA" }),
      dirMeeting({ id: "cr-1", provider: "CELEBRATE_RECOVERY" }),
      dirMeeting({ id: "aa-1", provider: "AA" }), // must be filtered OUT
    ]);
    const { findMeetings } = await import("../callable/findMeetings");

    const result = await (findMeetings as Function)(
      authedRequest({ filters: { location: { lat: 30.2, lng: -97.7 } } }),
    );

    const ids = (result as Array<{ id: string }>).map((m) => m.id).sort();
    expect(ids).toEqual(["cr-1", "na-1"]);
    expect(fetchDirectoryMeetings).toHaveBeenCalledTimes(1);
  });

  it("maps a directory meeting into the SerializedMeeting shape", async () => {
    jest.resetModules();
    const { fetchDirectoryMeetings } = await loadMocks();
    fetchDirectoryMeetings.mockResolvedValueOnce([
      dirMeeting({ id: "na-9", provider: "NA", day: 1, name: "Mapped NA" }),
    ]);
    const { findMeetings } = await import("../callable/findMeetings");

    const result = (await (findMeetings as Function)(
      authedRequest({
        filters: { location: { lat: 30.2, lng: -97.7 }, type: "NA" },
      }),
    )) as Array<Record<string, unknown>>;

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "na-9",
      name: "Mapped NA",
      type: "NA",
      day: "monday",
      verified: false,
      createdAt: "",
      updatedAt: "",
    });
  });
});
