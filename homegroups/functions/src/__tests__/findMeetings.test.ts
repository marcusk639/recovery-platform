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

// Mock the meetings utilities so tests don't make real HTTP calls
jest.mock("../utils/meetings", () => ({
  getNarcoticsAnoymousMeetings: jest.fn().mockResolvedValue([]),
  getAll12StepMeetings: jest.fn().mockResolvedValue([]),
  getCustomMeetings: jest.fn().mockResolvedValue([]),
  getAlcoholicsAnonymousMeetings: jest.fn().mockResolvedValue([]),
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
