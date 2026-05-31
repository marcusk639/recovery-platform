// functions/src/tests/getMeetingAttendance.test.ts
const mockGet = jest.fn();
const mockWhere = jest.fn().mockReturnThis();
const mockOrderBy = jest.fn().mockReturnThis();
const mockLimit = jest.fn().mockReturnThis();

const mockDb: any = {
  collection: jest.fn(() => ({
    where: mockWhere,
    orderBy: mockOrderBy,
    limit: mockLimit,
    get: mockGet,
  })),
};

jest.mock("firebase-admin", () => ({
  apps: [{ name: "[DEFAULT]" }],
  initializeApp: jest.fn(),
  firestore: Object.assign(
    jest.fn(() => mockDb),
    {
      Timestamp: { now: jest.fn() },
      FieldValue: { serverTimestamp: jest.fn() },
    },
  ),
}));

jest.mock("firebase-functions", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
  https: { onRequest: jest.fn() },
}));

jest.mock("firebase-functions/v2/https", () => ({
  onRequest: (opts: any, handler: any) => handler,
}));

import { getMeetingAttendanceHandler } from "../http/getMeetingAttendance";

// Helper to build fake Express req/res
function makeReq(overrides: Partial<any> = {}): any {
  return {
    method: "GET",
    headers: { authorization: "Bearer test-api-key" },
    query: { userId: "user-1", groupId: "group-1" },
    ...overrides,
  };
}

function makeRes(): any {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe("getMeetingAttendanceHandler", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...OLD_ENV, RATS_API_KEY: "test-api-key" };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it("returns 401 when Authorization header is missing", async () => {
    const req = makeReq({ headers: {} });
    const res = makeRes();
    await getMeetingAttendanceHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
  });

  it("returns 401 when API key is wrong", async () => {
    const req = makeReq({ headers: { authorization: "Bearer wrong-key" } });
    const res = makeRes();
    await getMeetingAttendanceHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("returns 400 when userId is missing", async () => {
    const req = makeReq({ query: { groupId: "group-1" } });
    const res = makeRes();
    await getMeetingAttendanceHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining("userId") }),
    );
  });

  it("returns 400 when groupId is missing", async () => {
    const req = makeReq({ query: { userId: "user-1" } });
    const res = makeRes();
    await getMeetingAttendanceHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining("groupId") }),
    );
  });

  it("returns empty checkIns array when no instances found", async () => {
    mockGet.mockResolvedValueOnce({ docs: [] });
    const req = makeReq();
    const res = makeRes();
    await getMeetingAttendanceHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      userId: "user-1",
      groupId: "group-1",
      checkIns: [],
      count: 0,
      truncated: false,
    });
  });

  it("returns serialized checkIns when instances found", async () => {
    const fakeTs = { toDate: () => new Date("2026-05-01T19:00:00Z") };
    mockGet.mockResolvedValueOnce({
      docs: [
        {
          id: "inst-1",
          data: () => ({
            meetingId: "mtg-1",
            scheduledAt: fakeTs,
            attendeeCount: 12,
          }),
        },
      ],
    });
    const req = makeReq();
    const res = makeRes();
    await getMeetingAttendanceHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      userId: "user-1",
      groupId: "group-1",
      checkIns: [
        {
          instanceId: "inst-1",
          meetingId: "mtg-1",
          scheduledAt: "2026-05-01T19:00:00.000Z",
          attendeeCount: 12,
        },
      ],
      count: 1,
      truncated: false,
    });
  });

  it("returns 500 and logs error when Firestore query throws", async () => {
    mockGet.mockRejectedValueOnce(new Error("Firestore down"));
    const req = makeReq();
    const res = makeRes();
    await getMeetingAttendanceHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Internal server error" });
  });
});
