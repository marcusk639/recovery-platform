import * as admin from "firebase-admin";

jest.mock("firebase-admin", () => ({
  firestore: jest.fn(() => mockDb),
  messaging: jest.fn(() => mockMessaging),
  initializeApp: jest.fn(),
}));

const mockGet = jest.fn();
const mockWhere = jest.fn(() => ({ where: mockWhere, get: mockGet }));
const mockDoc = jest.fn(() => ({ get: mockGet }));
const mockCollection = jest.fn(() => ({ where: mockWhere, doc: mockDoc }));
const mockDb = { collection: mockCollection };
const mockSendEachForMulticast = jest.fn(() =>
  Promise.resolve({ successCount: 1, failureCount: 0, responses: [] }),
);
const mockMessaging = { sendEachForMulticast: mockSendEachForMulticast };

// Expose Timestamp.fromMillis on the mocked admin.firestore so the
// implementation can call admin.firestore.Timestamp.fromMillis(...)
(admin.firestore as any).Timestamp = {
  fromMillis: jest.fn((ms: number) => ({
    _seconds: ms / 1000,
    _nanoseconds: 0,
  })),
};

jest.mock("firebase-functions", () => ({
  logger: { info: jest.fn(), error: jest.fn() },
}));

jest.mock("firebase-functions/v1", () => ({
  pubsub: {
    schedule: jest.fn(() => ({
      timeZone: jest.fn(() => ({ onRun: jest.fn((fn) => fn) })),
      onRun: jest.fn((fn) => fn),
    })),
  },
}));

import { sendRenewalReminders } from "../triggers/pubsub/scheduledRenewalReminders";

describe("sendRenewalReminders", () => {
  beforeEach(() => jest.clearAllMocks());

  it("queries groups with subscriptionStatus active or trialing and expiresAt in 29-31 days", async () => {
    mockGet.mockResolvedValue({ docs: [] });
    await sendRenewalReminders();
    expect(mockCollection).toHaveBeenCalledWith("groups");
    expect(mockWhere).toHaveBeenCalledWith("subscriptionStatus", "in", [
      "active",
      "trialing",
    ]);
    // Verify Firestore Timestamp objects are used (not plain ms integers)
    const timestampCalls = (mockWhere.mock.calls as any[]).filter(
      (c) => c[0] === "subscriptionExpiresAt",
    );
    expect(timestampCalls).toHaveLength(2);
    timestampCalls.forEach((call) => {
      expect(call[2]).toHaveProperty("_seconds");
    });
  });

  it("sends FCM push to each admin FCM token found", async () => {
    mockGet
      .mockResolvedValueOnce({
        docs: [
          {
            id: "group1",
            data: () => ({
              name: "Test Group",
              admins: ["admin1"],
            }),
          },
        ],
      })
      .mockResolvedValueOnce({
        data: () => ({ fcmTokens: ["token-abc"] }),
        exists: true,
      });

    await sendRenewalReminders();

    expect(mockSendEachForMulticast).toHaveBeenCalledWith(
      expect.objectContaining({
        tokens: ["token-abc"],
        notification: expect.objectContaining({
          title: expect.stringContaining("renew"),
        }),
      }),
    );
  });

  it("skips admins with no FCM tokens", async () => {
    mockGet
      .mockResolvedValueOnce({
        docs: [
          {
            id: "group2",
            data: () => ({ name: "Empty Group", admins: ["admin2"] }),
          },
        ],
      })
      .mockResolvedValueOnce({
        data: () => ({ fcmTokens: [] }),
        exists: true,
      });

    await sendRenewalReminders();

    expect(mockSendEachForMulticast).not.toHaveBeenCalled();
  });

  it("skips non-existent user documents", async () => {
    mockGet
      .mockResolvedValueOnce({
        docs: [
          {
            id: "group3",
            data: () => ({ name: "Ghost Group", admins: ["ghost-admin"] }),
          },
        ],
      })
      .mockResolvedValueOnce({ exists: false });

    await sendRenewalReminders();

    expect(mockSendEachForMulticast).not.toHaveBeenCalled();
  });

  it("sends 7-day reminder and includes days count in notification body", async () => {
    mockGet
      .mockResolvedValueOnce({
        docs: [
          {
            id: "group-7d",
            data: () => ({
              name: "Seven Day Group",
              admins: ["admin-7d"],
            }),
          },
        ],
      })
      .mockResolvedValueOnce({
        data: () => ({ fcmTokens: ["token-7d"] }),
        exists: true,
      });

    await sendRenewalReminders(7);

    expect(mockSendEachForMulticast).toHaveBeenCalledWith(
      expect.objectContaining({
        tokens: ["token-7d"],
        notification: expect.objectContaining({
          body: expect.stringContaining("7 days"),
        }),
      }),
    );
  });
});
