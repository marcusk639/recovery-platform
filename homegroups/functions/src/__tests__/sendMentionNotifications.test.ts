/**
 * Tests for sendMentionNotifications callable function (FH-2: auth check + groupId validation)
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

const mockSendEachForMulticast = jest.fn();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockCollection = jest.fn() as jest.MockedFunction<(name: string) => any>;

jest.mock("../utils/firebase", () => ({
  db: { collection: mockCollection },
  messaging: { sendEachForMulticast: mockSendEachForMulticast },
}));

// ---- Tests ----

describe("sendMentionNotifications auth check (FH-2)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("throws unauthenticated error when request.auth is null", async () => {
    jest.resetModules();
    const { sendMentionNotifications } =
      await import("../callable/sendMentionNotifications");

    const unauthRequest = {
      auth: null,
      data: {
        groupId: "group-1",
        messageId: "msg-1",
        message: {
          id: "msg-1",
          senderId: "user-1",
          senderName: "Alice",
          text: "@Bob hello",
          sentAt: {},
          groupId: "group-1",
          mentionedUserIds: ["user-2"],
        },
      },
    };

    await expect(
      (sendMentionNotifications as Function)(unauthRequest),
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("throws unauthenticated error when request.auth is undefined", async () => {
    jest.resetModules();
    const { sendMentionNotifications } =
      await import("../callable/sendMentionNotifications");

    const unauthRequest = {
      auth: undefined,
      data: {
        groupId: "group-1",
        messageId: "msg-1",
        message: {
          id: "msg-1",
          senderId: "user-1",
          senderName: "Alice",
          text: "Hello",
          sentAt: {},
          groupId: "group-1",
        },
      },
    };

    await expect(
      (sendMentionNotifications as Function)(unauthRequest),
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("throws invalid-argument when groupId is an empty string", async () => {
    jest.resetModules();
    const { sendMentionNotifications } =
      await import("../callable/sendMentionNotifications");

    const badRequest = {
      auth: { uid: "user-1", token: {} },
      data: {
        groupId: "   ", // whitespace-only — invalid
        messageId: "msg-1",
        message: {
          id: "msg-1",
          senderId: "user-1",
          senderName: "Alice",
          text: "Hello",
          sentAt: {},
          groupId: "   ",
        },
      },
    };

    await expect(
      (sendMentionNotifications as Function)(badRequest),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("throws invalid-argument when messageId is a whitespace-only string", async () => {
    jest.resetModules();
    const { sendMentionNotifications } =
      await import("../callable/sendMentionNotifications");

    const badRequest = {
      auth: { uid: "user-1", token: {} },
      data: {
        groupId: "group-1",
        messageId: "   ", // whitespace-only — invalid
        message: {
          id: "   ",
          senderId: "user-1",
          senderName: "Alice",
          text: "Hello",
          sentAt: {},
          groupId: "group-1",
        },
      },
    };

    await expect(
      (sendMentionNotifications as Function)(badRequest),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("proceeds past auth check when request.auth is present and data is valid", async () => {
    mockCollection.mockImplementation((name: string) => {
      if (name === "users") {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ exists: false }),
          }),
        };
      }
      if (name === "groups") {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => ({ name: "My Group" }),
            }),
          }),
        };
      }
      return {
        get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
      };
    });

    jest.resetModules();
    const { sendMentionNotifications } =
      await import("../callable/sendMentionNotifications");

    const authRequest = {
      auth: { uid: "user-1", token: {} },
      data: {
        groupId: "group-1",
        messageId: "msg-1",
        message: {
          id: "msg-1",
          senderId: "user-1",
          senderName: "Alice",
          text: "Hello @Bob",
          sentAt: {},
          groupId: "group-1",
          // No mentionedUserIds → no recipients → early return with sentCount 0
        },
      },
    };

    // Should NOT throw — should return successfully with sentCount 0
    const result = await (sendMentionNotifications as Function)(authRequest);
    expect(result).toEqual({ success: true, sentCount: 0 });
  });
});
