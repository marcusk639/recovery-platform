/**
 * Tests for getMilestones Cloud Function
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// --- Mocks ---
const mockGet = jest.fn();
const mockDocRef: any = {
  get: mockGet,
};
const mockCollectionRef: any = {
  doc: jest.fn(() => mockDocRef),
  where: jest.fn(),
  get: jest.fn(),
  orderBy: jest.fn(),
  limit: jest.fn(),
};
const mockDb: any = {
  collection: jest.fn(() => mockCollectionRef),
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

jest.mock("../utils/firebase", () => ({
  db: mockDb,
  messaging: { sendEachForMulticast: jest.fn() },
  auth: {},
}));

import { getMilestonesHandler } from "../callable/getMilestones";

function makeRequest(data: any, uid = "member-uid") {
  return {
    auth: { uid, token: { name: "Test User" } },
    data,
  } as any;
}

describe("getMilestones", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.collection.mockReturnValue(mockCollectionRef);
    mockCollectionRef.doc.mockReturnValue(mockDocRef);
    mockCollectionRef.where.mockReturnThis();
    mockCollectionRef.orderBy.mockReturnThis();
    mockCollectionRef.limit.mockReturnThis();
  });

  it("throws unauthenticated if no auth", async () => {
    const req = { auth: null, data: { groupId: "g1" } } as any;
    await expect(getMilestonesHandler(req)).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  it("throws invalid-argument if groupId is missing", async () => {
    const req = makeRequest({});
    await expect(getMilestonesHandler(req)).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  it("throws permission-denied if caller is not a member", async () => {
    const memberDocGet = jest.fn().mockResolvedValue({ exists: false });
    mockDb.collection.mockImplementation((col: string) => {
      if (col === "members") {
        return { doc: jest.fn().mockReturnValue({ get: memberDocGet }) };
      }
      return mockCollectionRef;
    });

    const req = makeRequest({ groupId: "g1" });
    await expect(getMilestonesHandler(req)).rejects.toMatchObject({
      code: "permission-denied",
    });
  });

  it("returns milestone data for a group member", async () => {
    const callerId = "member-uid";
    const groupId = "g1";

    const memberDocGet = jest.fn().mockResolvedValue({
      exists: true,
      data: () => ({ userId: callerId, groupId }),
    });

    const now = new Date();
    const tenDaysFromNow = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);

    const milestoneDocs = [
      {
        id: "g1_member-a",
        data: () => ({
          userId: "user-a",
          displayName: "Alice",
          sobrietyDate: { toDate: () => new Date("2020-01-01") },
          milestones: [
            {
              days: 30,
              chipGivenAt: { toDate: () => new Date("2020-01-31") },
              chipGivenBy: "admin-uid",
            },
          ],
          nextMilestoneDate: { toDate: () => tenDaysFromNow },
          nextMilestoneDays: 60,
        }),
      },
    ];

    const milestonesQueryGet = jest
      .fn()
      .mockResolvedValue({ docs: milestoneDocs });

    mockDb.collection.mockImplementation((col: string) => {
      if (col === "members") {
        return { doc: jest.fn().mockReturnValue({ get: memberDocGet }) };
      }
      if (col === "groups") {
        return {
          doc: jest.fn().mockReturnValue({
            collection: jest.fn().mockReturnValue({
              get: milestonesQueryGet,
            }),
          }),
        };
      }
      return mockCollectionRef;
    });

    const req = makeRequest({ groupId }, callerId);
    const result = await getMilestonesHandler(req);

    expect(result).toHaveProperty("all");
    expect(result).toHaveProperty("upcoming");
    expect(result).toHaveProperty("recent");
    expect(Array.isArray(result.all)).toBe(true);
    expect(Array.isArray(result.upcoming)).toBe(true);
    expect(Array.isArray(result.recent)).toBe(true);
    expect(result.all).toHaveLength(1);
    expect(result.all[0].displayName).toBe("Alice");
    // upcoming: 10 days from now is within 30 days
    expect(result.upcoming).toHaveLength(1);
    expect(result.recent).toHaveLength(1);
  });

  it("returns empty arrays when there are no milestones", async () => {
    const callerId = "member-uid";
    const groupId = "g1";

    const memberDocGet = jest.fn().mockResolvedValue({
      exists: true,
      data: () => ({ userId: callerId, groupId }),
    });
    const milestonesQueryGet = jest.fn().mockResolvedValue({ docs: [] });

    mockDb.collection.mockImplementation((col: string) => {
      if (col === "members") {
        return { doc: jest.fn().mockReturnValue({ get: memberDocGet }) };
      }
      if (col === "groups") {
        return {
          doc: jest.fn().mockReturnValue({
            collection: jest.fn().mockReturnValue({
              get: milestonesQueryGet,
            }),
          }),
        };
      }
      return mockCollectionRef;
    });

    const req = makeRequest({ groupId }, callerId);
    const result = await getMilestonesHandler(req);

    expect(result.all).toHaveLength(0);
    expect(result.upcoming).toHaveLength(0);
    expect(result.recent).toHaveLength(0);
  });
});
