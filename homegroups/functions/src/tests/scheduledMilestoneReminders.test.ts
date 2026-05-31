/**
 * Tests for scheduledMilestoneReminders Cloud Function
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// --- Mocks ---
const mockSendEachForMulticast = jest.fn().mockResolvedValue({ responses: [] });
const mockMessaging: any = { sendEachForMulticast: mockSendEachForMulticast };

const mockDb: any = {
  collectionGroup: jest.fn(),
  collection: jest.fn(),
};

jest.mock("firebase-admin", () => ({
  apps: [{ name: "[DEFAULT]" }],
  initializeApp: jest.fn(),
  firestore: jest.fn(() => mockDb),
  auth: jest.fn(),
}));

jest.mock("firebase-functions/v1", () => ({
  pubsub: {
    schedule: jest.fn(() => ({
      timeZone: jest.fn(() => ({
        onRun: (handler: any) => handler,
      })),
    })),
  },
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock("firebase-functions", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock("../utils/firebase", () => ({
  db: mockDb,
  messaging: mockMessaging,
  auth: {},
}));

import { scheduledMilestoneRemindersHandler } from "../triggers/pubsub/scheduledMilestoneReminders";

describe("scheduledMilestoneReminders", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does nothing when there are no upcoming milestones", async () => {
    const queryRef: any = {
      where: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({ docs: [] }),
    };
    mockDb.collectionGroup.mockReturnValue(queryRef);

    await scheduledMilestoneRemindersHandler();

    expect(mockSendEachForMulticast).not.toHaveBeenCalled();
  });

  it("sends FCM to group admins for upcoming milestones", async () => {
    const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

    const milestoneDocs = [
      {
        id: "g1_member-abc",
        ref: {
          parent: {
            parent: { id: "group-123" },
          },
          path: "groups/group-123/milestones/g1_member-abc",
        },
        data: () => ({
          userId: "user-abc",
          displayName: "John Doe",
          nextMilestoneDate: { toDate: () => threeDaysFromNow },
          nextMilestoneDays: 365,
        }),
      },
    ];

    const queryRef: any = {
      where: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({ docs: milestoneDocs }),
    };
    mockDb.collectionGroup.mockReturnValue(queryRef);

    const adminMemberDocs = [
      {
        data: () => ({
          userId: "admin-uid",
          displayName: "Admin User",
          isAdmin: true,
        }),
      },
    ];
    const adminUserDoc = {
      exists: true,
      data: () => ({
        fcmTokens: ["fcm-token-admin"],
        notificationSettings: {
          allowPushNotifications: true,
          celebrations: true,
        },
      }),
    };

    const membersQueryRef: any = {
      where: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({ docs: adminMemberDocs }),
    };
    const userDocRef: any = {
      get: jest.fn().mockResolvedValue(adminUserDoc),
    };

    mockDb.collection.mockImplementation((col: string) => {
      if (col === "members") {
        return membersQueryRef;
      }
      if (col === "users") {
        return { doc: jest.fn().mockReturnValue(userDocRef) };
      }
      return {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ docs: [] }),
      };
    });

    await scheduledMilestoneRemindersHandler();

    expect(mockSendEachForMulticast).toHaveBeenCalledTimes(1);
    const callArg = mockSendEachForMulticast.mock.calls[0][0];
    expect(callArg.tokens).toContain("fcm-token-admin");
    expect(callArg.notification.title).toContain("John Doe");
    // daysLabel for 365 days is "1 year"
    expect(callArg.notification.title).toContain("1 year");
  });

  it("skips admins who have disabled push notifications", async () => {
    const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

    const milestoneDocs = [
      {
        id: "g1_member-xyz",
        ref: {
          parent: { parent: { id: "group-xyz" } },
          path: "groups/group-xyz/milestones/g1_member-xyz",
        },
        data: () => ({
          userId: "user-abc",
          displayName: "Jane Smith",
          nextMilestoneDate: { toDate: () => threeDaysFromNow },
          nextMilestoneDays: 30,
        }),
      },
    ];

    const queryRef: any = {
      where: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({ docs: milestoneDocs }),
    };
    mockDb.collectionGroup.mockReturnValue(queryRef);

    const adminMemberDocs = [
      { data: () => ({ userId: "admin-uid-no-push", isAdmin: true }) },
    ];
    const adminUserDoc = {
      exists: true,
      data: () => ({
        fcmTokens: ["fcm-token-no-push"],
        notificationSettings: { allowPushNotifications: false },
      }),
    };

    mockDb.collection.mockImplementation((col: string) => {
      if (col === "members") {
        return {
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({ docs: adminMemberDocs }),
        };
      }
      if (col === "users") {
        return {
          doc: jest
            .fn()
            .mockReturnValue({
              get: jest.fn().mockResolvedValue(adminUserDoc),
            }),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ docs: [] }),
      };
    });

    await scheduledMilestoneRemindersHandler();

    // No tokens collected because push is disabled
    expect(mockSendEachForMulticast).not.toHaveBeenCalled();
  });
});
