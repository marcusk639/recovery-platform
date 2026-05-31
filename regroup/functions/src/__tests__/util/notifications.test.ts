// src/__tests__/util/notifications.test.ts

const mockSendEachForMulticast = jest.fn();
const mockMessagingSend = jest.fn();
const mockMessaging = jest.fn(() => ({
  sendEachForMulticast: mockSendEachForMulticast,
  send: mockMessagingSend,
}));
const mockUserDocUpdate = jest.fn();

// Per-doc Firestore get mocks: keyed by `${collection}/${id}`.
const docGetMocks: Record<string, jest.Mock> = {};
const getDocGetMock = (collection: string, id: string): jest.Mock => {
  const key = `${collection}/${id}`;
  if (!docGetMocks[key]) {
    docGetMocks[key] = jest.fn();
  }
  return docGetMocks[key];
};
const mockFirestoreCollection = jest.fn((collection: string) => ({
  doc: jest.fn((id: string) => ({ get: getDocGetMock(collection, id) })),
}));
const mockFirestore = jest.fn(() => ({ collection: mockFirestoreCollection }));

jest.mock("firebase-admin", () => ({
  messaging: mockMessaging,
  firestore: mockFirestore,
  default: { messaging: mockMessaging, firestore: mockFirestore },
  __esModule: true,
}));

const mockGetUser = jest.fn();
const mockAddNotification = jest.fn();
const mockApp = {};

jest.mock("../../api/firestore", () => ({
  getUser: mockGetUser,
  addNotification: mockAddNotification,
  userCollection: {
    doc: jest.fn(() => ({ update: mockUserDocUpdate })),
  },
  app: mockApp,
}));

jest.mock("firebase-functions", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock("../../util/date", () => ({
  getTodaysDate: jest.fn(() => "2026-02-23"),
}));

import {
  sendNotification,
  createInviteNotification,
  sendFcmToHouseAdmins,
} from "../../util/notifications";
import { userCollection } from "../../api/firestore";

beforeEach(() => {
  jest.clearAllMocks();
  // Reset per-doc Firestore mocks between tests
  Object.keys(docGetMocks).forEach((k) => delete docGetMocks[k]);
});

// ---------------------------------------------------------------------------
// sendNotification
// ---------------------------------------------------------------------------
describe("sendNotification", () => {
  const baseUser = { uid: "u1", messagingToken: ["token-abc"] };

  it("calls sendEachForMulticast with the user tokens", async () => {
    mockGetUser.mockResolvedValue(baseUser);
    mockSendEachForMulticast.mockResolvedValue({
      responses: [{ error: null }],
    });

    await sendNotification({ recipientId: "u1", title: "Hi", body: "World" });

    expect(mockSendEachForMulticast).toHaveBeenCalledWith(
      expect.objectContaining({ tokens: ["token-abc"] })
    );
  });

  it("passes the app instance to admin.messaging", async () => {
    mockGetUser.mockResolvedValue(baseUser);
    mockSendEachForMulticast.mockResolvedValue({
      responses: [{ error: null }],
    });

    await sendNotification({ recipientId: "u1", title: "Hi", body: "World" });

    expect(mockMessaging).toHaveBeenCalledWith(mockApp);
  });

  it("embeds title and body in the notifee JSON payload", async () => {
    mockGetUser.mockResolvedValue(baseUser);
    mockSendEachForMulticast.mockResolvedValue({
      responses: [{ error: null }],
    });

    await sendNotification({
      recipientId: "u1",
      title: "Alert",
      body: "Test body",
    });

    const call = mockSendEachForMulticast.mock.calls[0][0];
    const notifee = JSON.parse(call.data.notifee);
    expect(notifee.title).toBe("Alert");
    expect(notifee.body).toBe("Test body");
  });

  it("includes the android channelId in the notifee payload", async () => {
    mockGetUser.mockResolvedValue(baseUser);
    mockSendEachForMulticast.mockResolvedValue({
      responses: [{ error: null }],
    });

    await sendNotification({ recipientId: "u1", title: "Hi", body: "World" });

    const call = mockSendEachForMulticast.mock.calls[0][0];
    const notifee = JSON.parse(call.data.notifee);
    expect(notifee.android).toEqual({ channelId: "default" });
  });

  it("forwards the optional data field into the notifee payload", async () => {
    mockGetUser.mockResolvedValue(baseUser);
    mockSendEachForMulticast.mockResolvedValue({
      responses: [{ error: null }],
    });

    const extraData = { key: "value" };
    await sendNotification({
      recipientId: "u1",
      title: "Hi",
      body: "World",
      data: extraData,
    });

    const call = mockSendEachForMulticast.mock.calls[0][0];
    const notifee = JSON.parse(call.data.notifee);
    expect(notifee.data).toEqual(extraData);
  });

  it("removes tokens flagged as registration-token-not-registered", async () => {
    mockGetUser.mockResolvedValue({
      uid: "u1",
      messagingToken: ["valid", "invalid"],
    });
    mockSendEachForMulticast.mockResolvedValue({
      responses: [
        { error: null },
        { error: { code: "messaging/registration-token-not-registered" } },
      ],
    });

    await sendNotification({ recipientId: "u1", title: "Hi", body: "Body" });

    expect(mockUserDocUpdate).toHaveBeenCalledWith({
      messagingToken: ["valid"],
    });
  });

  it("removes tokens flagged as invalid-registration-token", async () => {
    mockGetUser.mockResolvedValue({
      uid: "u1",
      messagingToken: ["good", "bad"],
    });
    mockSendEachForMulticast.mockResolvedValue({
      responses: [
        { error: null },
        { error: { code: "messaging/invalid-registration-token" } },
      ],
    });

    await sendNotification({ recipientId: "u1", title: "Hi", body: "Body" });

    expect(mockUserDocUpdate).toHaveBeenCalledWith({
      messagingToken: ["good"],
    });
  });

  it("does not call update when all tokens are valid", async () => {
    mockGetUser.mockResolvedValue({
      uid: "u1",
      messagingToken: ["token1", "token2"],
    });
    mockSendEachForMulticast.mockResolvedValue({
      responses: [{ error: null }, { error: null }],
    });

    await sendNotification({ recipientId: "u1", title: "Hi", body: "Body" });

    expect(mockUserDocUpdate).not.toHaveBeenCalled();
  });

  it("does not throw when user is not found (null)", async () => {
    mockGetUser.mockResolvedValue(null);

    await expect(
      sendNotification({ recipientId: "unknown", title: "Hi", body: "B" })
    ).resolves.toBeUndefined();
  });

  it("does not throw when user is not found (undefined)", async () => {
    mockGetUser.mockResolvedValue(undefined);

    await expect(
      sendNotification({ recipientId: "unknown", title: "Hi", body: "B" })
    ).resolves.toBeUndefined();
  });

  it("does not throw when getUser rejects", async () => {
    mockGetUser.mockRejectedValue(new Error("Firestore unavailable"));

    await expect(
      sendNotification({ recipientId: "u1", title: "Hi", body: "B" })
    ).resolves.toBeUndefined();
  });

  it("calls userCollection.doc with the user uid when removing tokens", async () => {
    mockGetUser.mockResolvedValue({ uid: "u1", messagingToken: ["a", "b"] });
    mockSendEachForMulticast.mockResolvedValue({
      responses: [
        { error: null },
        { error: { code: "messaging/registration-token-not-registered" } },
      ],
    });

    await sendNotification({ recipientId: "u1", title: "Hi", body: "Body" });

    expect(userCollection.doc as jest.Mock).toHaveBeenCalledWith("u1");
  });
});

// ---------------------------------------------------------------------------
// createInviteNotification
// ---------------------------------------------------------------------------
describe("createInviteNotification", () => {
  const fakeUser = { uid: "u2" } as any;
  const fakeInvite = { email: "test@example.com" } as any;

  it("calls addNotification with the correct notification shape", async () => {
    mockAddNotification.mockResolvedValue(undefined);

    await createInviteNotification(fakeUser, fakeInvite);

    expect(mockAddNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u2",
        message: "You have been invited to help manage a home!",
        subject: "Admin Invite",
        type: "invite",
      })
    );
  });

  it("returns the result of addNotification", async () => {
    const sentinel = { id: "notif-123" };
    mockAddNotification.mockResolvedValue(sentinel);

    const result = await createInviteNotification(fakeUser, fakeInvite);

    expect(result).toBe(sentinel);
  });

  it("includes a date in the notification", async () => {
    mockAddNotification.mockResolvedValue(undefined);

    await createInviteNotification(fakeUser, fakeInvite);

    const notification = mockAddNotification.mock.calls[0][0];
    expect(notification.date).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// sendFcmToHouseAdmins
// ---------------------------------------------------------------------------
describe("sendFcmToHouseAdmins", () => {
  it("sends FCM to all admins of a house using messagingToken", async () => {
    getDocGetMock("houses", "house-1").mockResolvedValue({
      exists: true,
      data: () => ({ adminIds: ["uid-1"] }),
    });
    getDocGetMock("users", "uid-1").mockResolvedValue({
      exists: true,
      data: () => ({ messagingToken: ["test-token-123"] }),
    });
    mockMessagingSend.mockResolvedValue({});

    await expect(
      sendFcmToHouseAdmins("house-1", "Test Title", "Test Body")
    ).resolves.not.toThrow();

    expect(mockMessagingSend).toHaveBeenCalledWith(
      expect.objectContaining({
        token: "test-token-123",
        notification: { title: "Test Title", body: "Test Body" },
      })
    );
  });

  it("deduplicates admin IDs across adminIds, adminId, superAdminIds, superAdminId, and ownerId", async () => {
    getDocGetMock("houses", "house-1").mockResolvedValue({
      exists: true,
      data: () => ({
        adminIds: ["uid-1"],
        adminId: "uid-1", // duplicate of adminIds
        superAdminIds: ["uid-2"],
        superAdminId: "uid-3",
        ownerId: "uid-4",
      }),
    });
    getDocGetMock("users", "uid-1").mockResolvedValue({
      exists: true,
      data: () => ({ messagingToken: ["t1"] }),
    });
    getDocGetMock("users", "uid-2").mockResolvedValue({
      exists: true,
      data: () => ({ messagingToken: ["t2"] }),
    });
    getDocGetMock("users", "uid-3").mockResolvedValue({
      exists: true,
      data: () => ({ messagingToken: ["t3"] }),
    });
    getDocGetMock("users", "uid-4").mockResolvedValue({
      exists: true,
      data: () => ({ messagingToken: ["t4"] }),
    });
    mockMessagingSend.mockResolvedValue({});

    await sendFcmToHouseAdmins("house-1", "Title", "Body");

    // Should be called 4 times (uid-1 deduped), once per unique token.
    expect(mockMessagingSend).toHaveBeenCalledTimes(4);
  });

  it("does not throw when the house document does not exist", async () => {
    getDocGetMock("houses", "house-1").mockResolvedValue({
      exists: false,
      data: () => undefined,
    });

    await expect(
      sendFcmToHouseAdmins("house-1", "Test Title", "Test Body")
    ).resolves.not.toThrow();

    expect(mockMessagingSend).not.toHaveBeenCalled();
  });

  it("does not throw when the house has no admin IDs", async () => {
    getDocGetMock("houses", "house-1").mockResolvedValue({
      exists: true,
      data: () => ({ adminIds: [], superAdminIds: [] }),
    });

    await expect(
      sendFcmToHouseAdmins("house-1", "Test Title", "Test Body")
    ).resolves.not.toThrow();

    expect(mockMessagingSend).not.toHaveBeenCalled();
  });

  it("does not throw when admins have no messagingToken", async () => {
    getDocGetMock("houses", "house-1").mockResolvedValue({
      exists: true,
      data: () => ({ adminIds: ["uid-1"] }),
    });
    getDocGetMock("users", "uid-1").mockResolvedValue({
      exists: true,
      data: () => ({}),
    });

    await expect(
      sendFcmToHouseAdmins("house-1", "Test Title", "Test Body")
    ).resolves.not.toThrow();

    expect(mockMessagingSend).not.toHaveBeenCalled();
  });

  it("swallows per-token send errors without throwing", async () => {
    getDocGetMock("houses", "house-1").mockResolvedValue({
      exists: true,
      data: () => ({ adminIds: ["uid-1"] }),
    });
    getDocGetMock("users", "uid-1").mockResolvedValue({
      exists: true,
      data: () => ({ messagingToken: ["bad-token"] }),
    });
    mockMessagingSend.mockRejectedValue(new Error("invalid token"));

    await expect(
      sendFcmToHouseAdmins("house-1", "Test Title", "Test Body")
    ).resolves.not.toThrow();
  });

  it("does not throw when firestore house lookup fails", async () => {
    getDocGetMock("houses", "house-1").mockRejectedValue(
      new Error("firestore down")
    );

    await expect(
      sendFcmToHouseAdmins("house-1", "Test Title", "Test Body")
    ).resolves.not.toThrow();
  });
});
