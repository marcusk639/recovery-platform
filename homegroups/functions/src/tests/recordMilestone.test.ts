/**
 * Tests for recordMilestone Cloud Function
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// --- Mocks ---
const mockGet = jest.fn();
const mockSet = jest.fn();
const mockUpdate = jest.fn();
const mockDocRef: any = {
  get: mockGet,
  set: mockSet,
  update: mockUpdate,
  id: "member123",
};
const mockCollectionRef: any = {
  doc: jest.fn(() => mockDocRef),
  where: jest.fn(),
  get: jest.fn(),
};
const mockDb: any = {
  collection: jest.fn(() => mockCollectionRef),
};

const mockSendEachForMulticast = jest.fn().mockResolvedValue({ responses: [] });
const mockMessaging: any = {
  sendEachForMulticast: mockSendEachForMulticast,
};

jest.mock("firebase-admin", () => ({
  apps: [{ name: "[DEFAULT]" }],
  initializeApp: jest.fn(),
  firestore: jest.fn(() => mockDb),
  auth: jest.fn(),
}));

jest.mock("firebase-functions", () => ({
  https: {
    onCall: (handler: any) => handler,
  },
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock("firebase-functions/v1/https", () => ({
  HttpsError: class HttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
      this.name = "HttpsError";
    }
  },
}));

jest.mock("firebase-functions/v2/https", () => ({
  CallableRequest: {},
  onCall: jest
    .fn()
    .mockImplementation((arg1: unknown, arg2?: unknown) =>
      typeof arg1 === "function" ? arg1 : arg2,
    ),
  HttpsError: class HttpsError extends Error {
    code: string;
    details?: unknown;
    constructor(code: string, message: string, details?: unknown) {
      super(message);
      this.code = code;
      this.details = details;
    }
  },
}));

// logger mock comes from functions/jest.setup.ts (shared)

// Mock firebase-admin/firestore for Timestamp
jest.mock("firebase-admin/firestore", () => ({
  Timestamp: {
    fromDate: (date: Date) => ({
      toDate: () => date,
      toMillis: () => date.getTime(),
      seconds: Math.floor(date.getTime() / 1000),
      nanoseconds: 0,
    }),
    now: () => {
      const d = new Date();
      return {
        toDate: () => d,
        toMillis: () => d.getTime(),
        seconds: Math.floor(d.getTime() / 1000),
        nanoseconds: 0,
      };
    },
  },
}));

jest.mock("../utils/firebase", () => ({
  db: mockDb,
  messaging: mockMessaging,
  auth: {},
}));

// Must import after mocks
import { recordMilestoneHandler } from "../callable/recordMilestone";

function makeRequest(data: any, uid = "caller-admin-uid") {
  return {
    auth: { uid, token: { name: "Test Caller" } },
    data,
  } as any;
}

describe("recordMilestone", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.collection.mockReturnValue(mockCollectionRef);
    mockCollectionRef.doc.mockReturnValue(mockDocRef);
  });

  it("throws unauthenticated if no auth", async () => {
    const req = { auth: null, data: {} } as any;
    await expect(recordMilestoneHandler(req)).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  it("throws invalid-argument if groupId is missing", async () => {
    const req = makeRequest({ memberId: "m1", days: 30 });
    await expect(recordMilestoneHandler(req)).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  it("throws invalid-argument if memberId is missing", async () => {
    const req = makeRequest({ groupId: "g1", days: 30 });
    await expect(recordMilestoneHandler(req)).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  it("throws invalid-argument if days is 0 or negative", async () => {
    const req = makeRequest({ groupId: "g1", memberId: "m1", days: 0 });
    await expect(recordMilestoneHandler(req)).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  it("throws not-found if group does not exist", async () => {
    const groupDocRef: any = {
      get: jest.fn().mockResolvedValue({ exists: false }),
    };
    mockDb.collection.mockReturnValue({
      doc: jest.fn().mockReturnValue(groupDocRef),
    });

    const req = makeRequest({ groupId: "g1", memberId: "m1", days: 30 });
    await expect(recordMilestoneHandler(req)).rejects.toMatchObject({
      code: "not-found",
    });
  });

  it("throws permission-denied if caller is not admin", async () => {
    const groupDocGet = jest.fn().mockResolvedValue({
      exists: true,
      data: () => ({
        admins: ["other-admin"],
        adminUids: [],
        subscriptionStatus: "active",
      }),
    });
    const callerMemberGet = jest.fn().mockResolvedValue({
      exists: false,
    });

    mockDb.collection.mockImplementation((col: string) => {
      if (col === "groups") {
        return { doc: jest.fn().mockReturnValue({ get: groupDocGet }) };
      }
      if (col === "members") {
        return { doc: jest.fn().mockReturnValue({ get: callerMemberGet }) };
      }
      return mockCollectionRef;
    });

    const req = makeRequest({ groupId: "g1", memberId: "m1", days: 30 });
    await expect(recordMilestoneHandler(req)).rejects.toMatchObject({
      code: "permission-denied",
    });
  });

  it("throws not-found if target member does not exist", async () => {
    const callerId = "admin-uid";

    const groupDocGet = jest.fn().mockResolvedValue({
      exists: true,
      data: () => ({
        admins: [callerId],
        adminUids: [callerId],
        subscriptionStatus: "active",
      }),
    });
    const callerMemberGet = jest.fn().mockResolvedValue({
      exists: true,
      data: () => ({ roles: ["admin"], isAdmin: true }),
    });
    const targetMemberGet = jest.fn().mockResolvedValue({ exists: false });

    let memberCallCount = 0;
    mockDb.collection.mockImplementation((col: string) => {
      if (col === "groups") {
        return { doc: jest.fn().mockReturnValue({ get: groupDocGet }) };
      }
      if (col === "members") {
        memberCallCount++;
        const getResult =
          memberCallCount === 1 ? callerMemberGet : targetMemberGet;
        return { doc: jest.fn().mockReturnValue({ get: getResult }) };
      }
      return mockCollectionRef;
    });

    const req = makeRequest(
      {
        groupId: "g1",
        memberId: "g1_member123",
        days: 30,
        sobrietyDate: "2020-01-01",
      },
      callerId,
    );
    await expect(recordMilestoneHandler(req)).rejects.toMatchObject({
      code: "not-found",
    });
  });

  it("successfully records a milestone and returns success", async () => {
    const callerId = "admin-uid";
    const memberId = "g1_member123";
    const groupId = "g1";

    const groupDocGet = jest.fn().mockResolvedValue({
      exists: true,
      data: () => ({
        admins: [callerId],
        adminUids: [callerId],
        name: "Test Group",
        subscriptionStatus: "active",
      }),
    });
    const callerMemberGet = jest.fn().mockResolvedValue({
      exists: true,
      data: () => ({
        roles: ["admin"],
        isAdmin: true,
        displayName: "Admin User",
      }),
    });
    const targetMemberGet = jest.fn().mockResolvedValue({
      exists: true,
      data: () => ({
        userId: "user-123",
        displayName: "Jane Doe",
        sobrietyDate: { toDate: () => new Date("2020-01-01") },
        fcmTokens: ["token-abc"],
        notificationSettings: {
          allowPushNotifications: true,
          celebrations: true,
        },
      }),
    });
    const milestoneDocGet = jest.fn().mockResolvedValue({
      exists: false,
      data: () => null,
    });
    const milestoneSet = jest.fn().mockResolvedValue(undefined);
    const milestoneDoc: any = {
      get: milestoneDocGet,
      set: milestoneSet,
      update: jest.fn(),
    };

    const membersQueryGet = jest.fn().mockResolvedValue({
      docs: [
        {
          data: () => ({
            userId: "user-123",
            fcmTokens: ["token-abc"],
            notificationSettings: {
              allowPushNotifications: true,
              celebrations: true,
            },
          }),
        },
      ],
    });

    const userDocGet = jest.fn().mockResolvedValue({
      exists: true,
      data: () => ({
        fcmTokens: ["token-abc"],
        notificationSettings: {
          allowPushNotifications: true,
          celebrations: true,
        },
      }),
    });

    let memberCallCount = 0;
    mockDb.collection.mockImplementation((col: string) => {
      if (col === "groups") {
        return {
          doc: jest.fn().mockReturnValue({
            get: groupDocGet,
            collection: jest.fn().mockReturnValue({
              doc: jest.fn().mockReturnValue(milestoneDoc),
            }),
          }),
        };
      }
      if (col === "members") {
        memberCallCount++;
        if (memberCallCount === 1) {
          return { doc: jest.fn().mockReturnValue({ get: callerMemberGet }) };
        } else if (memberCallCount === 2) {
          return { doc: jest.fn().mockReturnValue({ get: targetMemberGet }) };
        } else {
          return { where: jest.fn().mockReturnThis(), get: membersQueryGet };
        }
      }
      if (col === "users") {
        return { doc: jest.fn().mockReturnValue({ get: userDocGet }) };
      }
      return mockCollectionRef;
    });

    const req = makeRequest(
      {
        groupId,
        memberId,
        days: 30,
        sobrietyDate: "2020-01-01",
        notes: "Great job!",
      },
      callerId,
    );

    const result = await recordMilestoneHandler(req);
    expect(result).toMatchObject({ success: true, days: 30 });
    expect(result.nextMilestoneDays).toBe(60);
  });
});
