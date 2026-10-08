/**
 * Tests for V2.2 Meeting Enhancements:
 *  - scheduledMeetingReminders (Cloud Scheduler)
 *  - checkInToMeeting (Callable)
 */

// ---- Mocks must be defined before any imports ----

const mockUpdate = jest.fn().mockResolvedValue(undefined);
const mockSet = jest.fn().mockResolvedValue(undefined);
const mockSendEachForMulticast = jest.fn();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockCollection = jest.fn() as jest.MockedFunction<(name: string) => any>;

// Track calls to arrayUnion and increment helpers
const mockArrayUnion = jest.fn((...args: any[]) => ({
  _methodName: "FieldValue.arrayUnion",
  args,
}));
const mockIncrement = jest.fn((n: number) => ({
  _methodName: "FieldValue.increment",
  n,
}));
const mockServerTimestamp = jest.fn(() => ({
  _methodName: "FieldValue.serverTimestamp",
}));

// Transaction + root-level doc() support. checkInToMeeting writes the per-user
// attendance record and the instance's attendeeCount inside one transaction.
const mockTxnGet = jest.fn().mockResolvedValue({ exists: false });
const mockTxnSet = jest.fn();
const mockTxnUpdate = jest.fn();
const mockRunTransaction = jest.fn(async (fn: any) =>
  fn({ get: mockTxnGet, set: mockTxnSet, update: mockTxnUpdate }),
);
const mockDoc = jest.fn((path: string) => ({ path }));

// checkInToMeeting imports `* as logger from "firebase-functions/logger"` — a different
// module from the "firebase-functions" mock below. Without this mock the PII assertion
// reads a logger the production code never writes to, and passes vacuously.
const mockLoggerInfo = jest.fn();
const mockLoggerWarn = jest.fn();
const mockLoggerError = jest.fn();
jest.mock("firebase-functions/logger", () => ({
  info: mockLoggerInfo,
  warn: mockLoggerWarn,
  error: mockLoggerError,
  log: mockLoggerInfo,
  debug: jest.fn(),
}));

jest.mock("firebase-admin", () => {
  const fromDate = (date: Date) => ({
    toDate: () => date,
    seconds: Math.floor(date.getTime() / 1000),
    nanoseconds: 0,
    toMillis: () => date.getTime(),
  });

  return {
    apps: [],
    initializeApp: jest.fn(),
    firestore: Object.assign(
      jest.fn().mockReturnValue({
        collection: mockCollection,
        doc: mockDoc,
        runTransaction: mockRunTransaction,
      }),
      {
        Timestamp: {
          fromDate,
          now: () => fromDate(new Date()),
        },
        FieldValue: {
          arrayUnion: mockArrayUnion,
          arrayRemove: jest.fn(),
          increment: mockIncrement,
          serverTimestamp: mockServerTimestamp,
          delete: jest.fn(),
        },
      },
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
  https: {
    onCall: jest.fn().mockImplementation((handler: Function) => handler),
  },
}));

// The scheduledMeetingReminders uses functionsV1.pubsub.schedule().timeZone().onRun(handler)
// We want the export to BE the handler so we can call it directly
jest.mock("firebase-functions/v1", () => ({
  pubsub: {
    schedule: jest.fn().mockReturnValue({
      timeZone: jest.fn().mockReturnValue({
        onRun: jest.fn().mockImplementation((handler: Function) => handler),
      }),
    }),
  },
  https: {
    HttpsError: class HttpsError extends Error {
      code: string;
      details: any;
      constructor(code: string, message: string, details?: any) {
        super(message);
        this.code = code;
        this.details = details;
      }
    },
  },
}));

// v2/https + logger mocks come from functions/jest.setup.ts (shared)

jest.mock("../utils/firebase", () => ({
  db: {
    collection: mockCollection,
    doc: mockDoc,
    runTransaction: mockRunTransaction,
  },
  messaging: { sendEachForMulticast: mockSendEachForMulticast },
}));

// ---- Helpers ----

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createDoc = (id: string, data: Record<string, any>) => ({
  id,
  data: () => data,
  ref: { update: mockUpdate, set: mockSet },
});

/**
 * Creates a mock Firestore Timestamp-like object from a Date.
 */
const makeTimestamp = (date: Date) => ({
  toDate: () => date,
  seconds: Math.floor(date.getTime() / 1000),
  nanoseconds: 0,
  toMillis: () => date.getTime(),
});

// ============================================================
// scheduledMeetingReminders Tests
// ============================================================

describe("scheduledMeetingReminders", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSendEachForMulticast.mockResolvedValue({
      successCount: 1,
      failureCount: 0,
      responses: [{ success: true }],
    });
  });

  it("Positive: sends notification when a favorited meeting starts in ~60 min", async () => {
    const now = new Date();
    const meetingTime = new Date(now.getTime() + 60 * 60 * 1000); // exactly 60 min from now
    const groupId = "group-1";
    const meetingId = "meeting-1";

    const instanceDoc = createDoc("instance-1", {
      groupId,
      meetingId,
      name: "Friday Big Book Study",
      isCancelled: false,
      scheduledAt: makeTimestamp(meetingTime),
    });

    mockCollection.mockImplementation((name: string) => {
      if (name === "meetingInstances") {
        return {
          where: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                get: jest.fn().mockResolvedValue({
                  empty: false,
                  size: 1,
                  docs: [instanceDoc],
                }),
              }),
            }),
          }),
        };
      }
      if (name === "members") {
        return {
          where: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              empty: false,
              docs: [
                createDoc(`${groupId}_user-1`, { userId: "user-1", groupId }),
              ],
            }),
          }),
        };
      }
      if (name === "users") {
        return {
          where: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              docs: [
                createDoc("user-1", {
                  favoriteMeetings: [meetingId], // has favorited this meeting
                  fcmTokens: ["token-abc"],
                  notificationSettings: {
                    meetings: true,
                    allowPushNotifications: true,
                  },
                }),
              ],
            }),
          }),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
      };
    });

    jest.resetModules();
    const { scheduledMeetingReminders } =
      await import("../triggers/pubsub/scheduledMeetingReminders");

    await (scheduledMeetingReminders as Function)();

    expect(mockSendEachForMulticast).toHaveBeenCalledTimes(1);
    expect(mockSendEachForMulticast).toHaveBeenCalledWith(
      expect.objectContaining({
        tokens: ["token-abc"],
        notification: expect.objectContaining({
          title: "Meeting Starting Soon",
          body: expect.stringContaining("Friday Big Book Study"),
        }),
        data: expect.objectContaining({
          type: "meeting_reminder",
          groupId,
          meetingId,
        }),
      }),
    );
  });

  it("Negative: does NOT send notification when meeting starts in 3 hours (outside window)", async () => {
    const now = new Date();
    const meetingTime = new Date(now.getTime() + 3 * 60 * 60 * 1000); // 3 hours from now

    mockCollection.mockImplementation((name: string) => {
      if (name === "meetingInstances") {
        return {
          where: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                get: jest.fn().mockResolvedValue({
                  empty: true,
                  size: 0,
                  docs: [],
                }),
              }),
            }),
          }),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
      };
    });

    jest.resetModules();
    const { scheduledMeetingReminders } =
      await import("../triggers/pubsub/scheduledMeetingReminders");

    await (scheduledMeetingReminders as Function)();

    // No notifications should be sent — nothing is in the window
    expect(mockSendEachForMulticast).not.toHaveBeenCalled();
  });

  it("Negative: does NOT send notification for a cancelled meeting", async () => {
    // The query itself filters isCancelled == false, so cancelled meetings are never returned.
    // This test verifies the empty result case.
    mockCollection.mockImplementation((name: string) => {
      if (name === "meetingInstances") {
        return {
          where: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                get: jest.fn().mockResolvedValue({
                  empty: true,
                  size: 0,
                  docs: [], // Firestore filtered out the cancelled one
                }),
              }),
            }),
          }),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
      };
    });

    jest.resetModules();
    const { scheduledMeetingReminders } =
      await import("../triggers/pubsub/scheduledMeetingReminders");

    await (scheduledMeetingReminders as Function)();

    expect(mockSendEachForMulticast).not.toHaveBeenCalled();
  });

  it("Negative: does NOT send notification when member has not favorited the meeting", async () => {
    const now = new Date();
    const meetingTime = new Date(now.getTime() + 60 * 60 * 1000);
    const groupId = "group-2";
    const meetingId = "meeting-2";

    const instanceDoc = createDoc("instance-2", {
      groupId,
      meetingId,
      name: "Monday Meditation",
      isCancelled: false,
      scheduledAt: makeTimestamp(meetingTime),
    });

    mockCollection.mockImplementation((name: string) => {
      if (name === "meetingInstances") {
        return {
          where: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                get: jest.fn().mockResolvedValue({
                  empty: false,
                  size: 1,
                  docs: [instanceDoc],
                }),
              }),
            }),
          }),
        };
      }
      if (name === "members") {
        return {
          where: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              docs: [
                createDoc(`${groupId}_user-2`, { userId: "user-2", groupId }),
              ],
            }),
          }),
        };
      }
      if (name === "users") {
        return {
          where: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              docs: [
                createDoc("user-2", {
                  favoriteMeetings: ["meeting-OTHER"], // different meeting — not favorited
                  fcmTokens: ["token-xyz"],
                  notificationSettings: {
                    meetings: true,
                    allowPushNotifications: true,
                  },
                }),
              ],
            }),
          }),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
      };
    });

    jest.resetModules();
    const { scheduledMeetingReminders } =
      await import("../triggers/pubsub/scheduledMeetingReminders");

    await (scheduledMeetingReminders as Function)();

    // No FCM tokens should be included — user hasn't favorited the meeting
    expect(mockSendEachForMulticast).not.toHaveBeenCalled();
  });

  it("Negative: skips user without FCM tokens even if meeting is favorited", async () => {
    const now = new Date();
    const meetingTime = new Date(now.getTime() + 60 * 60 * 1000);
    const groupId = "group-3";
    const meetingId = "meeting-3";

    const instanceDoc = createDoc("instance-3", {
      groupId,
      meetingId,
      name: "Thursday Serenity",
      isCancelled: false,
      scheduledAt: makeTimestamp(meetingTime),
    });

    mockCollection.mockImplementation((name: string) => {
      if (name === "meetingInstances") {
        return {
          where: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                get: jest.fn().mockResolvedValue({
                  empty: false,
                  size: 1,
                  docs: [instanceDoc],
                }),
              }),
            }),
          }),
        };
      }
      if (name === "members") {
        return {
          where: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              docs: [
                createDoc(`${groupId}_user-3`, { userId: "user-3", groupId }),
              ],
            }),
          }),
        };
      }
      if (name === "users") {
        return {
          where: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              docs: [
                createDoc("user-3", {
                  favoriteMeetings: [meetingId],
                  fcmTokens: [], // no FCM tokens
                  notificationSettings: {
                    meetings: true,
                    allowPushNotifications: true,
                  },
                }),
              ],
            }),
          }),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
      };
    });

    jest.resetModules();
    const { scheduledMeetingReminders } =
      await import("../triggers/pubsub/scheduledMeetingReminders");

    await (scheduledMeetingReminders as Function)();

    // No tokens — sendEachForMulticast should not be called
    expect(mockSendEachForMulticast).not.toHaveBeenCalled();
  });

  it("Edge: meeting starting in exactly 55 minutes IS included (window boundary)", async () => {
    // The window is [now+55min, now+70min]. A meeting at +55min should be included.
    // We simulate this by returning that instance from the Firestore query.
    const groupId = "group-4";
    const meetingId = "meeting-4";
    const now = new Date();
    const meetingTime = new Date(now.getTime() + 55 * 60 * 1000);

    const instanceDoc = createDoc("instance-4", {
      groupId,
      meetingId,
      name: "Boundary Edge Case Meeting",
      isCancelled: false,
      scheduledAt: makeTimestamp(meetingTime),
    });

    mockCollection.mockImplementation((name: string) => {
      if (name === "meetingInstances") {
        return {
          where: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                get: jest.fn().mockResolvedValue({
                  empty: false,
                  size: 1,
                  docs: [instanceDoc],
                }),
              }),
            }),
          }),
        };
      }
      if (name === "members") {
        return {
          where: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              docs: [
                createDoc(`${groupId}_user-4`, { userId: "user-4", groupId }),
              ],
            }),
          }),
        };
      }
      if (name === "users") {
        return {
          where: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              docs: [
                createDoc("user-4", {
                  favoriteMeetings: [meetingId],
                  fcmTokens: ["token-boundary"],
                  notificationSettings: {
                    meetings: true,
                    allowPushNotifications: true,
                  },
                }),
              ],
            }),
          }),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
      };
    });

    jest.resetModules();
    const { scheduledMeetingReminders } =
      await import("../triggers/pubsub/scheduledMeetingReminders");

    await (scheduledMeetingReminders as Function)();

    // Should be included in the reminder window
    expect(mockSendEachForMulticast).toHaveBeenCalledTimes(1);
    expect(mockSendEachForMulticast).toHaveBeenCalledWith(
      expect.objectContaining({
        tokens: ["token-boundary"],
      }),
    );
  });
});

// ============================================================
// checkInToMeeting Tests
// ============================================================

describe("checkInToMeeting", () => {
  // Mock HttpsError from v1 for throwing
  const MockHttpsError = class HttpsError extends Error {
    code: string;
    details: any;
    constructor(code: string, message: string, details?: any) {
      super(message);
      this.code = code;
      this.details = details;
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Re-mock HttpsError for each test
    jest.mock("firebase-functions/v1/https", () => ({
      HttpsError: MockHttpsError,
    }));
  });

  const makeAuthRequest = (uid: string, data: Record<string, any>) => ({
    auth: { uid, token: {} },
    data,
  });

  it("Positive: successfully checks in a member who has not yet checked in", async () => {
    const userId = "user-a";
    const groupId = "group-x";
    const instanceId = "instance-x";

    mockTxnGet.mockResolvedValue({ exists: false }); // no attendance record yet

    const mockDocGet = jest.fn();

    mockCollection.mockImplementation((name: string) => {
      if (name === "members") {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => ({ userId, groupId }),
            }),
          }),
        };
      }
      if (name === "meetingInstances") {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => ({
                groupId,
                isCancelled: false,
                attendeeCount: 0, // nobody checked in yet
              }),
            }),
            update: mockUpdate,
          }),
        };
      }
      if (name === "users") {
        return {
          doc: jest.fn().mockReturnValue({
            update: mockUpdate,
          }),
        };
      }
      return {
        doc: jest.fn().mockReturnValue({ get: jest.fn(), update: mockUpdate }),
      };
    });

    jest.resetModules();
    const { checkInToMeeting } = await import("../callable/checkInToMeeting");

    const result = await (checkInToMeeting as Function)(
      makeAuthRequest(userId, { groupId, instanceId }),
    );

    expect(result).toEqual({
      success: true,
      attendeeCount: 1,
      alreadyCheckedIn: false,
    });

    // Writes the per-user attendance record inside the transaction
    expect(mockTxnSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ instanceId, groupId }),
    );
    // and increments the public count in the same transaction
    expect(mockTxnUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ attendeeCount: expect.anything() }),
    );
  });

  it("Idempotent: returns alreadyCheckedIn=true when user checks in twice", async () => {
    const userId = "user-b";
    const groupId = "group-y";
    const instanceId = "instance-y";

    mockTxnGet.mockResolvedValue({ exists: true }); // attendance already recorded

    mockCollection.mockImplementation((name: string) => {
      if (name === "members") {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => ({ userId, groupId }),
            }),
          }),
        };
      }
      if (name === "meetingInstances") {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => ({
                groupId,
                isCancelled: false,
                attendeeCount: 1, // this user is already counted
              }),
            }),
            update: mockUpdate,
          }),
        };
      }
      return {
        doc: jest.fn().mockReturnValue({ get: jest.fn(), update: mockUpdate }),
      };
    });

    jest.resetModules();
    const { checkInToMeeting } = await import("../callable/checkInToMeeting");

    const result = await (checkInToMeeting as Function)(
      makeAuthRequest(userId, { groupId, instanceId }),
    );

    expect(result).toEqual({
      success: true,
      attendeeCount: 1,
      alreadyCheckedIn: true,
    });

    // Should write nothing when the attendance record already exists
    expect(mockTxnSet).not.toHaveBeenCalled();
    expect(mockTxnUpdate).not.toHaveBeenCalled();
  });

  it("Privacy: never logs the attending user id or the instance id", async () => {
    const userId = "user-pii";
    const groupId = "group-pii";
    const instanceId = "instance-pii";

    mockTxnGet.mockResolvedValue({ exists: false });

    mockCollection.mockImplementation((name: string) => {
      if (name === "members") {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => ({ userId, groupId }),
            }),
          }),
        };
      }
      if (name === "meetingInstances") {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => ({ groupId, isCancelled: false, attendeeCount: 0 }),
            }),
            update: mockUpdate,
          }),
        };
      }
      return {
        doc: jest.fn().mockReturnValue({ get: jest.fn(), update: mockUpdate }),
      };
    });

    jest.resetModules();
    const { checkInToMeeting } = await import("../callable/checkInToMeeting");

    await (checkInToMeeting as Function)(
      makeAuthRequest(userId, { groupId, instanceId }),
    );

    // Attendance at a 12-step meeting is recovery-status PII. Cloud Functions logs
    // sit outside Firestore rules, so a user id joined to an instance id here is a
    // disclosure the rules fix cannot close.
    const logged = JSON.stringify([
      ...mockLoggerInfo.mock.calls,
      ...mockLoggerWarn.mock.calls,
      ...mockLoggerError.mock.calls,
    ]);
    expect(logged).not.toContain(userId);
    expect(logged).not.toContain(instanceId);
  });

  it("Negative: throws unauthenticated when no auth context", async () => {
    jest.resetModules();
    const { checkInToMeeting } = await import("../callable/checkInToMeeting");

    const unauthRequest = {
      auth: null,
      data: { groupId: "g", instanceId: "i" },
    };

    await expect(
      (checkInToMeeting as Function)(unauthRequest),
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("Negative: throws permission-denied when caller is not a group member", async () => {
    const userId = "user-c";

    mockCollection.mockImplementation((name: string) => {
      if (name === "members") {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ exists: false }), // not a member
          }),
        };
      }
      return { doc: jest.fn().mockReturnValue({ get: jest.fn() }) };
    });

    jest.resetModules();
    const { checkInToMeeting } = await import("../callable/checkInToMeeting");

    await expect(
      (checkInToMeeting as Function)(
        makeAuthRequest(userId, {
          groupId: "group-z",
          instanceId: "instance-z",
        }),
      ),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("Negative: throws not-found when meeting instance does not exist", async () => {
    const userId = "user-d";
    const groupId = "group-w";

    mockCollection.mockImplementation((name: string) => {
      if (name === "members") {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => ({ userId, groupId }),
            }),
          }),
        };
      }
      if (name === "meetingInstances") {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ exists: false }),
          }),
        };
      }
      return { doc: jest.fn().mockReturnValue({ get: jest.fn() }) };
    });

    jest.resetModules();
    const { checkInToMeeting } = await import("../callable/checkInToMeeting");

    await expect(
      (checkInToMeeting as Function)(
        makeAuthRequest(userId, { groupId, instanceId: "nonexistent" }),
      ),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("Negative: throws failed-precondition when meeting is cancelled", async () => {
    const userId = "user-e";
    const groupId = "group-v";

    mockCollection.mockImplementation((name: string) => {
      if (name === "members") {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => ({ userId, groupId }),
            }),
          }),
        };
      }
      if (name === "meetingInstances") {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => ({
                groupId,
                isCancelled: true, // cancelled!
                attendees: [],
              }),
            }),
          }),
        };
      }
      return { doc: jest.fn().mockReturnValue({ get: jest.fn() }) };
    });

    jest.resetModules();
    const { checkInToMeeting } = await import("../callable/checkInToMeeting");

    await expect(
      (checkInToMeeting as Function)(
        makeAuthRequest(userId, { groupId, instanceId: "cancelled-instance" }),
      ),
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("Negative: throws invalid-argument when groupId or instanceId missing", async () => {
    jest.resetModules();
    const { checkInToMeeting } = await import("../callable/checkInToMeeting");

    await expect(
      (checkInToMeeting as Function)(
        makeAuthRequest("user-f", { groupId: "", instanceId: "" }),
      ),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("Negative: throws permission-denied when instance belongs to different group", async () => {
    const userId = "user-g";
    const groupId = "group-real";

    mockCollection.mockImplementation((name: string) => {
      if (name === "members") {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => ({ userId, groupId }),
            }),
          }),
        };
      }
      if (name === "meetingInstances") {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => ({
                groupId: "group-OTHER", // belongs to a different group!
                isCancelled: false,
                attendees: [],
              }),
            }),
          }),
        };
      }
      return { doc: jest.fn().mockReturnValue({ get: jest.fn() }) };
    });

    jest.resetModules();
    const { checkInToMeeting } = await import("../callable/checkInToMeeting");

    await expect(
      (checkInToMeeting as Function)(
        makeAuthRequest(userId, {
          groupId,
          instanceId: "wrong-group-instance",
        }),
      ),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });
});
