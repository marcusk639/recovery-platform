/**
 * Tests for scheduledDailyReflection Cloud Function.
 *
 * Mock pattern mirrors scheduledAnnouncementPublisher.test.ts exactly.
 */

// Make this file a TypeScript module to avoid global scope conflicts
export {};

// ---- Mocks must be defined before imports ----

const mockSendEachForMulticast = jest.fn();

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

jest.mock("firebase-admin/messaging", () => ({
  getMessaging: jest.fn().mockReturnValue({
    sendEachForMulticast: mockSendEachForMulticast,
  }),
}));

jest.mock("firebase-functions", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock("firebase-functions/v1", () => ({
  pubsub: {
    schedule: jest.fn().mockReturnValue({
      timeZone: jest.fn().mockReturnValue({
        onRun: jest.fn().mockImplementation((handler: Function) => handler),
      }),
    }),
  },
}));

jest.mock("../utils/firebase", () => ({
  db: { collection: mockCollection },
  messaging: { sendEachForMulticast: mockSendEachForMulticast },
}));

// ---- Helper ----
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createDoc = (id: string, data: Record<string, any>) => ({
  id,
  data: () => data,
});

// ---- Tests ----

describe("scheduledDailyReflection", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockSendEachForMulticast.mockResolvedValue({
      successCount: 1,
      failureCount: 0,
      responses: [{ success: true }],
    });
  });

  // ---------------------------------------------------------------------------
  // 1. Positive case: sends notification to eligible users
  // ---------------------------------------------------------------------------
  it("sends a notification to users with push enabled and FCM tokens", async () => {
    mockCollection.mockImplementation((name: string) => {
      if (name === "users") {
        return {
          get: jest.fn().mockResolvedValue({
            size: 1,
            docs: [
              createDoc("user-1", {
                fcmTokens: ["token-abc"],
                allowPushNotifications: true,
                notificationSettings: {
                  dailyReflection: true,
                  allowPushNotifications: true,
                },
              }),
            ],
          }),
        };
      }
      return { get: jest.fn().mockResolvedValue({ size: 0, docs: [] }) };
    });

    jest.resetModules();
    const { scheduledDailyReflection } = await import(
      "../triggers/pubsub/scheduledDailyReflection"
    );

    await (scheduledDailyReflection as Function)();

    expect(mockSendEachForMulticast).toHaveBeenCalledTimes(1);
    const call = mockSendEachForMulticast.mock.calls[0][0];
    expect(call.tokens).toContain("token-abc");
    expect(call.notification.title).toBeTruthy();
    expect(call.notification.body).toBeTruthy();
    expect(call.notification.title.length).toBeGreaterThan(0);
    expect(call.notification.body.length).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // 2. Negative: skips users with dailyReflection: false
  // ---------------------------------------------------------------------------
  it("skips users with notificationSettings.dailyReflection set to false", async () => {
    mockCollection.mockImplementation((name: string) => {
      if (name === "users") {
        return {
          get: jest.fn().mockResolvedValue({
            size: 1,
            docs: [
              createDoc("user-opted-out", {
                fcmTokens: ["token-xyz"],
                notificationSettings: {
                  dailyReflection: false,
                  allowPushNotifications: true,
                },
              }),
            ],
          }),
        };
      }
      return { get: jest.fn().mockResolvedValue({ size: 0, docs: [] }) };
    });

    jest.resetModules();
    const { scheduledDailyReflection } = await import(
      "../triggers/pubsub/scheduledDailyReflection"
    );

    await (scheduledDailyReflection as Function)();

    expect(mockSendEachForMulticast).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // 3. Negative: skips users with no FCM tokens
  // ---------------------------------------------------------------------------
  it("skips users with no FCM tokens", async () => {
    mockCollection.mockImplementation((name: string) => {
      if (name === "users") {
        return {
          get: jest.fn().mockResolvedValue({
            size: 1,
            docs: [
              createDoc("user-no-tokens", {
                fcmTokens: [],
                notificationSettings: {
                  dailyReflection: true,
                  allowPushNotifications: true,
                },
              }),
            ],
          }),
        };
      }
      return { get: jest.fn().mockResolvedValue({ size: 0, docs: [] }) };
    });

    jest.resetModules();
    const { scheduledDailyReflection } = await import(
      "../triggers/pubsub/scheduledDailyReflection"
    );

    await (scheduledDailyReflection as Function)();

    expect(mockSendEachForMulticast).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // 4. Negative: skips users with allowPushNotifications: false
  // ---------------------------------------------------------------------------
  it("skips users with allowPushNotifications set to false", async () => {
    mockCollection.mockImplementation((name: string) => {
      if (name === "users") {
        return {
          get: jest.fn().mockResolvedValue({
            size: 1,
            docs: [
              createDoc("user-push-disabled", {
                fcmTokens: ["token-push-off"],
                allowPushNotifications: false,
                notificationSettings: {
                  dailyReflection: true,
                  allowPushNotifications: false,
                },
              }),
            ],
          }),
        };
      }
      return { get: jest.fn().mockResolvedValue({ size: 0, docs: [] }) };
    });

    jest.resetModules();
    const { scheduledDailyReflection } = await import(
      "../triggers/pubsub/scheduledDailyReflection"
    );

    await (scheduledDailyReflection as Function)();

    expect(mockSendEachForMulticast).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // 5. Content: notification title and body are non-empty strings
  // ---------------------------------------------------------------------------
  it("sends a notification with non-empty title and body", async () => {
    mockCollection.mockImplementation((name: string) => {
      if (name === "users") {
        return {
          get: jest.fn().mockResolvedValue({
            size: 1,
            docs: [
              createDoc("user-content-check", {
                fcmTokens: ["token-content"],
                notificationSettings: {
                  dailyReflection: true,
                  allowPushNotifications: true,
                },
              }),
            ],
          }),
        };
      }
      return { get: jest.fn().mockResolvedValue({ size: 0, docs: [] }) };
    });

    jest.resetModules();
    const { scheduledDailyReflection } = await import(
      "../triggers/pubsub/scheduledDailyReflection"
    );

    await (scheduledDailyReflection as Function)();

    expect(mockSendEachForMulticast).toHaveBeenCalledTimes(1);
    const notification = mockSendEachForMulticast.mock.calls[0][0].notification;
    expect(typeof notification.title).toBe("string");
    expect(typeof notification.body).toBe("string");
    expect(notification.title.trim().length).toBeGreaterThan(0);
    expect(notification.body.trim().length).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // 6. Skips users with missing fcmTokens field entirely
  // ---------------------------------------------------------------------------
  it("skips users with undefined fcmTokens field", async () => {
    mockCollection.mockImplementation((name: string) => {
      if (name === "users") {
        return {
          get: jest.fn().mockResolvedValue({
            size: 1,
            docs: [
              createDoc("user-no-token-field", {
                // fcmTokens not set at all
                notificationSettings: {
                  dailyReflection: true,
                  allowPushNotifications: true,
                },
              }),
            ],
          }),
        };
      }
      return { get: jest.fn().mockResolvedValue({ size: 0, docs: [] }) };
    });

    jest.resetModules();
    const { scheduledDailyReflection } = await import(
      "../triggers/pubsub/scheduledDailyReflection"
    );

    await (scheduledDailyReflection as Function)();

    expect(mockSendEachForMulticast).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // 7. Mixed users: only eligible ones receive notification
  // ---------------------------------------------------------------------------
  it("sends to eligible users only when mixed user pool is present", async () => {
    mockCollection.mockImplementation((name: string) => {
      if (name === "users") {
        return {
          get: jest.fn().mockResolvedValue({
            size: 3,
            docs: [
              createDoc("user-eligible", {
                fcmTokens: ["token-eligible"],
                notificationSettings: {
                  dailyReflection: true,
                  allowPushNotifications: true,
                },
              }),
              createDoc("user-no-push", {
                fcmTokens: ["token-no-push"],
                notificationSettings: {
                  dailyReflection: true,
                  allowPushNotifications: false,
                },
              }),
              createDoc("user-opted-out", {
                fcmTokens: ["token-opted-out"],
                notificationSettings: {
                  dailyReflection: false,
                  allowPushNotifications: true,
                },
              }),
            ],
          }),
        };
      }
      return { get: jest.fn().mockResolvedValue({ size: 0, docs: [] }) };
    });

    jest.resetModules();
    const { scheduledDailyReflection } = await import(
      "../triggers/pubsub/scheduledDailyReflection"
    );

    await (scheduledDailyReflection as Function)();

    expect(mockSendEachForMulticast).toHaveBeenCalledTimes(1);
    const tokens = mockSendEachForMulticast.mock.calls[0][0].tokens;
    expect(tokens).toContain("token-eligible");
    expect(tokens).not.toContain("token-no-push");
    expect(tokens).not.toContain("token-opted-out");
  });

  // ---------------------------------------------------------------------------
  // 8. Empty user collection — no send
  // ---------------------------------------------------------------------------
  it("does not call sendEachForMulticast when no users exist", async () => {
    mockCollection.mockImplementation(() => ({
      get: jest.fn().mockResolvedValue({ size: 0, docs: [] }),
    }));

    jest.resetModules();
    const { scheduledDailyReflection } = await import(
      "../triggers/pubsub/scheduledDailyReflection"
    );

    await (scheduledDailyReflection as Function)();

    expect(mockSendEachForMulticast).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Unit tests for pure helper functions
// ============================================================================

describe("getReflectionForDay", () => {
  it("returns a non-empty title and body for day 0", async () => {
    jest.resetModules();
    const { getReflectionForDay } = await import(
      "../triggers/pubsub/scheduledDailyReflection"
    );
    const r = getReflectionForDay(0);
    expect(r.title.length).toBeGreaterThan(0);
    expect(r.body.length).toBeGreaterThan(0);
  });

  it("rotates content — day 0 and day N differ if N < array length", async () => {
    jest.resetModules();
    const { getReflectionForDay, DAILY_REFLECTIONS } = await import(
      "../triggers/pubsub/scheduledDailyReflection"
    );
    // If there are at least 2 entries, day 0 and day 1 should differ
    if (DAILY_REFLECTIONS.length >= 2) {
      expect(getReflectionForDay(0).title).not.toBe(getReflectionForDay(1).title);
    }
  });

  it("wraps around after the last entry", async () => {
    jest.resetModules();
    const { getReflectionForDay, DAILY_REFLECTIONS } = await import(
      "../triggers/pubsub/scheduledDailyReflection"
    );
    const { REFLECTIONS_365 } = await import("../utils/reflectionsLibrary");
    // getReflectionForDay uses REFLECTIONS_365, indexed as (dayOfYear - 1) % len.
    // Wrap-around occurs every REFLECTIONS_365.length days:
    // day 1 and day (1 + len) both map to index 0.
    const len = REFLECTIONS_365.length;
    expect(getReflectionForDay(1).title).toBe(getReflectionForDay(1 + len).title);
    // Also verify DAILY_REFLECTIONS still exports a non-empty fallback array
    expect(DAILY_REFLECTIONS.length).toBeGreaterThan(0);
  });
});

describe("getDayOfYear", () => {
  it("returns 1 for January 1st", async () => {
    jest.resetModules();
    const { getDayOfYear } = await import(
      "../triggers/pubsub/scheduledDailyReflection"
    );
    const jan1 = new Date(Date.UTC(2024, 0, 1));
    expect(getDayOfYear(jan1)).toBe(1);
  });

  it("returns a value between 1 and 366", async () => {
    jest.resetModules();
    const { getDayOfYear } = await import(
      "../triggers/pubsub/scheduledDailyReflection"
    );
    const day = getDayOfYear(new Date());
    expect(day).toBeGreaterThanOrEqual(1);
    expect(day).toBeLessThanOrEqual(366);
  });
});
