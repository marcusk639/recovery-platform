/**
 * Unit tests for getResidentMeetingAttendance — covers auth, authorization,
 * the cross-project HTTP bridge, and error mapping.
 *
 * The RC HTTP call is mocked via globalThis.fetch so we can control status
 * codes and body without any real network traffic.
 */

jest.mock("firebase-functions/v2/https", () => {
  const actual = jest.requireActual("firebase-functions/v2/https");
  return {
    ...actual,
    onCall: (_optsOrHandler: any, handler?: Function) => ({
      run: typeof _optsOrHandler === "function" ? _optsOrHandler : handler,
    }),
  };
});

jest.mock("firebase-functions", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock("firebase-functions/params", () => ({
  defineSecret: jest.fn((name: string) => ({ name })),
}));

jest.mock("../../config", () => ({
  RATS_API_KEY: { name: "RATS_API_KEY" },
}));

// ── fetch mock ─────────────────────────────────────────────────────────────────
const mockFetch = jest.fn();
global.fetch = mockFetch;

const RC_RESPONSE: import("../../callable/homegroups").MeetingAttendanceResult =
  {
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
  };

function makeOkResponse(body: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  });
}

function makeErrorResponse(status: number) {
  return Promise.resolve({
    ok: false,
    status,
    json: () => Promise.resolve({}),
  });
}

import { getResidentMeetingAttendance } from "../../callable/homegroups";

const run = (req: any) => (getResidentMeetingAttendance as any).run(req);

const adminToken = { admin: { "house-1": true } };
const emptyToken = {};

const makeRequest = (overrides: Partial<Record<string, any>> = {}) => ({
  auth: { uid: "user-1", token: adminToken },
  data: { userId: "user-1", groupId: "group-1" },
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  process.env.RATS_API_KEY = "test-api-key";
  process.env.RC_MEETING_ATTENDANCE_URL =
    "https://rc.example.com/getMeetingAttendance";
});

afterEach(() => {
  delete process.env.RATS_API_KEY;
  delete process.env.RC_MEETING_ATTENDANCE_URL;
});

// ── Auth guard ─────────────────────────────────────────────────────────────────
describe("getResidentMeetingAttendance — unauthenticated", () => {
  it("throws unauthenticated when auth is missing", async () => {
    await expect(run(makeRequest({ auth: null }))).rejects.toMatchObject({
      code: "unauthenticated",
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ── Authorization ──────────────────────────────────────────────────────────────
describe("getResidentMeetingAttendance — authorization", () => {
  it("allows a resident to fetch their own records", async () => {
    mockFetch.mockReturnValueOnce(makeOkResponse(RC_RESPONSE));
    // uid === userId, empty token (not an admin)
    await expect(
      run(makeRequest({ auth: { uid: "user-1", token: emptyToken } })),
    ).resolves.toMatchObject({ userId: "user-1" });
  });

  it("allows a house admin to fetch another resident's records", async () => {
    mockFetch.mockReturnValueOnce(makeOkResponse(RC_RESPONSE));
    await expect(
      run(
        makeRequest({
          auth: { uid: "admin-user", token: adminToken },
          data: { userId: "user-1", groupId: "group-1" },
        }),
      ),
    ).resolves.toMatchObject({ userId: "user-1" });
  });

  it("throws permission-denied when non-admin accesses another user's records", async () => {
    await expect(
      run(
        makeRequest({
          auth: { uid: "other-user", token: emptyToken },
          data: { userId: "user-1", groupId: "group-1" },
        }),
      ),
    ).rejects.toMatchObject({ code: "permission-denied" });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ── Secret guard ───────────────────────────────────────────────────────────────
describe("getResidentMeetingAttendance — missing secret", () => {
  it("throws internal when RATS_API_KEY env var is not set", async () => {
    delete process.env.RATS_API_KEY;
    await expect(run(makeRequest())).rejects.toMatchObject({
      code: "internal",
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ── RC HTTP bridge ─────────────────────────────────────────────────────────────
describe("getResidentMeetingAttendance — RC HTTP call", () => {
  it("calls RC with correct URL, userId, groupId, and Bearer token", async () => {
    mockFetch.mockReturnValueOnce(makeOkResponse(RC_RESPONSE));
    await run(makeRequest());

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toMatch(/userId=user-1/);
    expect(url).toMatch(/groupId=group-1/);
    expect(opts.headers.Authorization).toBe("Bearer test-api-key");
  });

  it("returns the RC response on success", async () => {
    mockFetch.mockReturnValueOnce(makeOkResponse(RC_RESPONSE));
    const result = await run(makeRequest());
    expect(result).toMatchObject({
      userId: "user-1",
      groupId: "group-1",
      count: 1,
      truncated: false,
      checkIns: [expect.objectContaining({ instanceId: "inst-1" })],
    });
  });

  it("throws internal when RC returns 401 (key mismatch)", async () => {
    mockFetch.mockReturnValueOnce(makeErrorResponse(401));
    await expect(run(makeRequest())).rejects.toMatchObject({
      code: "internal",
    });
  });

  it("throws internal when RC returns 500", async () => {
    mockFetch.mockReturnValueOnce(makeErrorResponse(500));
    await expect(run(makeRequest())).rejects.toMatchObject({
      code: "internal",
    });
  });

  it("throws unavailable on network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    await expect(run(makeRequest())).rejects.toMatchObject({
      code: "unavailable",
    });
  });
});
