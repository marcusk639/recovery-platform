// functions/src/tests/scheduledYearEndSummary.test.ts
const mockSendEach = jest.fn();
const mockMessagingGet = jest.fn();
const mockUpdate = jest.fn();

const mockDb: any = {
  collection: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  doc: jest.fn().mockReturnThis(),
  get: jest.fn(),
};

jest.mock("firebase-admin", () => ({
  apps: [{ name: "[DEFAULT]" }],
  initializeApp: jest.fn(),
  firestore: Object.assign(
    jest.fn(() => mockDb),
    {
      Timestamp: {
        fromDate: jest.fn((d: Date) => ({ _date: d })),
      },
    },
  ),
  messaging: jest.fn(() => ({ sendEachForMulticast: mockSendEach })),
}));

jest.mock("firebase-functions/v1", () => ({
  pubsub: {
    schedule: jest.fn(() => ({
      timeZone: jest.fn(() => ({
        onRun: (handler: any) => handler,
      })),
    })),
  },
}));

jest.mock("firebase-functions", () => ({
  logger: { info: jest.fn(), error: jest.fn() },
}));

import { sendYearEndSummaries } from "../triggers/pubsub/scheduledYearEndSummary";

describe("sendYearEndSummaries", () => {
  beforeEach(() => jest.clearAllMocks());

  it("does nothing when no qualifying groups", async () => {
    mockDb.get.mockResolvedValueOnce({ docs: [] });
    await sendYearEndSummaries();
    expect(mockSendEach).not.toHaveBeenCalled();
  });

  it("skips group when admin list is empty", async () => {
    mockDb.get.mockResolvedValueOnce({
      docs: [
        {
          id: "group-1",
          data: () => ({ name: "Sunday Group", admins: [] }),
        },
      ],
    });
    await sendYearEndSummaries();
    expect(mockSendEach).not.toHaveBeenCalled();
  });

  it("skips admin user when they have no FCM tokens", async () => {
    mockDb.get
      .mockResolvedValueOnce({
        docs: [
          {
            id: "group-1",
            data: () => ({ name: "Sunday Group", admins: ["admin-1"] }),
          },
        ],
      })
      .mockResolvedValueOnce({ exists: true, data: () => ({ fcmTokens: [] }) });
    await sendYearEndSummaries();
    expect(mockSendEach).not.toHaveBeenCalled();
  });

  it("sends FCM notification to admin with tokens", async () => {
    mockDb.get
      .mockResolvedValueOnce({
        docs: [
          {
            id: "group-1",
            data: () => ({
              name: "Sunday Group",
              admins: ["admin-1"],
            }),
          },
        ],
      })
      .mockResolvedValueOnce({
        exists: true,
        data: () => ({ fcmTokens: ["token-abc"] }),
      });
    mockSendEach.mockResolvedValueOnce({ successCount: 1, failureCount: 0 });

    await sendYearEndSummaries();

    expect(mockSendEach).toHaveBeenCalledWith(
      expect.objectContaining({
        tokens: ["token-abc"],
        notification: expect.objectContaining({
          title: expect.stringContaining("Sunday Group"),
        }),
        data: expect.objectContaining({
          type: "YEAR_END_SUMMARY",
          groupId: "group-1",
        }),
      }),
    );
  });

  it("continues processing other groups when one admin FCM send fails", async () => {
    mockDb.get
      .mockResolvedValueOnce({
        docs: [
          { id: "g1", data: () => ({ name: "G1", admins: ["a1"] }) },
          { id: "g2", data: () => ({ name: "G2", admins: ["a2"] }) },
        ],
      })
      .mockResolvedValueOnce({
        exists: true,
        data: () => ({ fcmTokens: ["token-1"] }),
      })
      .mockResolvedValueOnce({
        exists: true,
        data: () => ({ fcmTokens: ["token-2"] }),
      });

    mockSendEach
      .mockRejectedValueOnce(new Error("FCM error"))
      .mockResolvedValueOnce({ successCount: 1, failureCount: 0 });

    await expect(sendYearEndSummaries()).resolves.not.toThrow();
    expect(mockSendEach).toHaveBeenCalledTimes(2);
  });
});
