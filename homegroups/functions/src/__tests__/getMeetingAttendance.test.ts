/**
 * Unit tests for getMeetingAttendance HTTP handler.
 *
 * Covers:
 *   P2-13 — safeStringEqual: equal strings, different strings, different lengths,
 *            empty string pair, prefix-match pair, no throws on variable-length input
 *   Auth:   missing Authorization header → 401
 *           wrong token → 401
 *           correct token → proceeds past auth gate (200 or later error)
 */

// ============================================================
// Mocks — must be defined before any imports that load modules
// ============================================================

jest.mock("firebase-admin", () => ({
  apps: ["mock-app"],
  initializeApp: jest.fn(),
  firestore: Object.assign(
    jest.fn().mockReturnValue({
      collection: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ docs: [] }),
      }),
    }),
    {
      Timestamp: { fromDate: (d: Date) => ({ toDate: () => d }) },
      FieldValue: { serverTimestamp: () => "__SERVER_TIMESTAMP__" },
    },
  ),
}));

jest.mock("firebase-functions/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

// onRequest(opts, handler) → return the handler directly
jest.mock("firebase-functions/v2/https", () => ({
  onRequest: (_opts: unknown, handler: unknown) => handler,
  HttpsError: class HttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

// ============================================================
// Imports after mocks
// ============================================================

import {
  safeStringEqual,
  getMeetingAttendanceHandler,
} from "../http/getMeetingAttendance";

// ============================================================
// Helpers
// ============================================================

function makeReq(
  headers: Record<string, string | undefined> = {},
  query: Record<string, string> = {},
) {
  return { headers, query } as unknown as Parameters<
    typeof getMeetingAttendanceHandler
  >[0];
}

function makeRes() {
  const res = {
    _status: 200,
    _body: {} as unknown,
    status(code: number) {
      this._status = code;
      return this;
    },
    json(body: unknown) {
      this._body = body;
      return this;
    },
  };
  return res;
}

// ============================================================
// safeStringEqual — P2-13
// ============================================================

describe("safeStringEqual", () => {
  it("returns true for two identical strings", () => {
    expect(safeStringEqual("hello", "hello")).toBe(true);
  });

  it("returns false for strings that differ by one character", () => {
    expect(safeStringEqual("hello", "hellx")).toBe(false);
  });

  it("returns false for a prefix match (shorter vs longer string)", () => {
    expect(safeStringEqual("abc", "abcdef")).toBe(false);
  });

  it("returns false when first argument is longer than second", () => {
    expect(safeStringEqual("abcdef", "abc")).toBe(false);
  });

  it("returns true for two empty strings", () => {
    expect(safeStringEqual("", "")).toBe(true);
  });

  it("returns false when one string is empty and the other is not", () => {
    expect(safeStringEqual("", "x")).toBe(false);
    expect(safeStringEqual("x", "")).toBe(false);
  });

  it("does not throw for inputs longer than the SHA-256 block size (64 bytes)", () => {
    const long = "a".repeat(128);
    expect(() => safeStringEqual(long, long)).not.toThrow();
    expect(safeStringEqual(long, long)).toBe(true);
    expect(safeStringEqual(long, long + "x")).toBe(false);
  });
});

// ============================================================
// getMeetingAttendanceHandler — auth rejection (P2-13 context)
// ============================================================

describe("getMeetingAttendanceHandler — authentication", () => {
  const RATS_KEY = "test-rats-key-12345";

  beforeEach(() => {
    process.env.RATS_API_KEY = RATS_KEY;
  });

  afterEach(() => {
    delete process.env.RATS_API_KEY;
  });

  it("returns 401 when Authorization header is missing", async () => {
    const req = makeReq({});
    const res = makeRes();
    await getMeetingAttendanceHandler(req, res as never);
    expect(res._status).toBe(401);
  });

  it("returns 401 when Authorization header has wrong token", async () => {
    const req = makeReq({ authorization: "Bearer wrong-key" });
    const res = makeRes();
    await getMeetingAttendanceHandler(req, res as never);
    expect(res._status).toBe(401);
  });

  it("returns 401 when Authorization header is malformed (no Bearer prefix)", async () => {
    const req = makeReq({ authorization: RATS_KEY });
    const res = makeRes();
    await getMeetingAttendanceHandler(req, res as never);
    expect(res._status).toBe(401);
  });

  it("proceeds past auth when correct Bearer token is provided", async () => {
    const req = makeReq(
      { authorization: `Bearer ${RATS_KEY}` },
      { userId: "user1", groupId: "group1" },
    );
    const res = makeRes();
    await getMeetingAttendanceHandler(req, res as never);
    // Should NOT be 401 — may be 400 (missing params) or 200 depending on mock data
    expect(res._status).not.toBe(401);
  });
});
