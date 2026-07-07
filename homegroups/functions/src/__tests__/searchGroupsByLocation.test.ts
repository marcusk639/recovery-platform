/**
 * Tests for searchGroupsByLocation callable function (FH-3: auth check)
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

jest.mock("firebase-functions/v1/https", () => ({
  HttpsError: mockHttpsError,
}));

// v2/https + logger mocks come from functions/jest.setup.ts (shared)

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockCollection = jest.fn() as jest.MockedFunction<(name: string) => any>;

jest.mock("../utils/firebase", () => ({
  db: { collection: mockCollection },
  messaging: { sendEachForMulticast: jest.fn() },
}));

// Mock geofire-common so tests don't compute real geohash bounds
jest.mock("geofire-common", () => ({
  geohashQueryBounds: jest.fn().mockReturnValue([["a", "z"]]),
  distanceBetween: jest.fn().mockReturnValue(1000), // 1000 meters
}));

// ---- Tests ----

describe("searchGroupsByLocation auth check (FH-3)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("throws unauthenticated error when request.auth is null", async () => {
    jest.resetModules();
    const { searchGroupsByLocation } =
      await import("../callable/searchGroupsByLocation");

    const unauthRequest = {
      auth: null,
      data: { lat: 40.7128, lng: -74.006, radius: 10 },
    };

    await expect(
      (searchGroupsByLocation as Function)(unauthRequest),
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("throws unauthenticated error when request.auth is undefined", async () => {
    jest.resetModules();
    const { searchGroupsByLocation } =
      await import("../callable/searchGroupsByLocation");

    const unauthRequest = {
      auth: undefined,
      data: { lat: 40.7128, lng: -74.006, radius: 10 },
    };

    await expect(
      (searchGroupsByLocation as Function)(unauthRequest),
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("proceeds past auth check when request.auth is present and returns groups array", async () => {
    mockCollection.mockImplementation(() => ({
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnValue({
        startAt: jest.fn().mockReturnValue({
          endAt: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ docs: [] }),
          }),
        }),
      }),
      get: jest.fn().mockResolvedValue({ docs: [] }),
    }));

    jest.resetModules();
    const { searchGroupsByLocation } =
      await import("../callable/searchGroupsByLocation");

    const authRequest = {
      auth: { uid: "user-123", token: {} },
      data: { lat: 40.7128, lng: -74.006, radius: 10 },
    };

    // Should not throw unauthenticated; returns an array (possibly empty)
    const result = await (searchGroupsByLocation as Function)(authRequest);
    expect(Array.isArray(result)).toBe(true);
  });

  it("still throws invalid-argument for bad coordinates after auth passes", async () => {
    jest.resetModules();
    const { searchGroupsByLocation } =
      await import("../callable/searchGroupsByLocation");

    const authRequest = {
      auth: { uid: "user-123", token: {} },
      data: { lat: 999, lng: -74.006, radius: 10 }, // invalid lat
    };

    await expect(
      (searchGroupsByLocation as Function)(authRequest),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("does not leak internal fields (stripeCustomerId, admins, etc.) in search results", async () => {
    jest.resetModules();
    const rawGroupData = {
      name: "Test Group",
      type: "AA",
      placeName: "Church Hall",
      city: "Phoenix",
      state: "AZ",
      isClaimed: true,
      lat: 33.45,
      lng: -112.07,
      geohash: "abc",
      publicProfileEnabled: true,
      stripeCustomerId: "cus_secret",
      stripeSubscriptionId: "sub_secret",
      admins: ["admin-uid"],
      treasurers: ["treasurer-uid"],
    };
    mockCollection.mockImplementation((name: string) => {
      if (name === "groups") {
        return {
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          startAt: jest.fn().mockReturnThis(),
          endAt: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({
            docs: [{ id: "group-1", data: () => rawGroupData }],
          }),
        };
      }
      return {};
    });
    const { searchGroupsByLocation: fn } =
      await import("../callable/searchGroupsByLocation");
    const request = {
      auth: { uid: "caller-uid" },
      data: { lat: 33.45, lng: -112.07, radius: 10 },
    };
    const result = await (fn as any)(request);
    expect(result).toHaveLength(1);
    const leaked = [
      "stripeCustomerId",
      "stripeSubscriptionId",
      "admins",
      "treasurers",
      "lat",
      "lng",
      "geohash",
    ];
    for (const field of leaked) {
      expect(result[0]).not.toHaveProperty(field);
    }
    expect(result[0]).toMatchObject({
      id: "group-1",
      name: "Test Group",
      type: "AA",
      placeName: "Church Hall",
      city: "Phoenix",
      state: "AZ",
      isClaimed: true,
    });
  });

  it("excludes groups with publicProfileEnabled set to false", async () => {
    jest.resetModules();
    mockCollection.mockImplementation((name: string) => {
      if (name === "groups") {
        return {
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          startAt: jest.fn().mockReturnThis(),
          endAt: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({
            docs: [
              {
                id: "hidden-group",
                data: () => ({
                  name: "Hidden Group",
                  lat: 33.45,
                  lng: -112.07,
                  publicProfileEnabled: false,
                }),
              },
            ],
          }),
        };
      }
      return {};
    });
    const { searchGroupsByLocation: fn } =
      await import("../callable/searchGroupsByLocation");
    const request = {
      auth: { uid: "caller-uid" },
      data: { lat: 33.45, lng: -112.07, radius: 10 },
    };
    const result = await (fn as any)(request);
    expect(result).toHaveLength(0);
  });
});
