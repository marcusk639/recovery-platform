/**
 * Tests for generateTreasuryReport.
 *
 * Regression coverage for two bugs:
 *
 * 1. D-9 (security): the callable used to accept any group member as
 *    authorized — including non-admin, non-treasurer members — letting them
 *    download the full transaction-level financial-PII PDF. Now restricted
 *    to admins and treasurers only.
 *
 * 2. (latent, batched fix) the callable used to query
 *    `groups/{groupId}/transactions` as a subcollection, but transactions
 *    live at the top-level `transactions` collection (per TreasuryModel and
 *    firestore.rules). Reports would have been empty.
 *
 * Refs: .audit/doc-code-discrepancies.md D-9
 */

export {};

// ---- Mocks ----

const gtrCollectionCalls: string[] = [];
const gtrFieldQueryCalls: Array<{ collection: string; field: string }> = [];

function makeQueryMock(name: string) {
  const q: Record<string, jest.Mock> = {};
  q.where = jest.fn((field: string) => {
    gtrFieldQueryCalls.push({ collection: name, field });
    return q;
  });
  q.orderBy = jest.fn(() => q);
  q.limit = jest.fn(() => q);
  q.get = jest.fn().mockResolvedValue({ docs: [], empty: true });
  return q;
}

const groupDocSnap = {
  exists: true,
  data: () => ({
    name: "Test Group",
    admins: [] as string[],
    treasurers: [] as string[],
    treasury: { prudentReserve: 0 },
  }),
};

const memberDocSnap = {
  exists: false,
  data: () => null,
};

const gtrMockDoc = jest.fn(() => ({
  get: jest
    .fn()
    .mockImplementation(() =>
      Promise.resolve(
        gtrCollectionCalls[gtrCollectionCalls.length - 1] === "members"
          ? memberDocSnap
          : groupDocSnap,
      ),
    ),
}));

const gtrMockCollection = jest.fn((name: string) => {
  gtrCollectionCalls.push(name);
  const q = makeQueryMock(name);
  (q as unknown as { doc: jest.Mock }).doc = gtrMockDoc;
  return q;
});

jest.mock("firebase-admin", () => ({
  apps: [],
  initializeApp: jest.fn(),
  firestore: Object.assign(
    jest.fn().mockReturnValue({ collection: gtrMockCollection }),
    { FieldValue: {}, Timestamp: { now: jest.fn(() => ({})) } },
  ),
  app: jest.fn().mockReturnValue({}),
  auth: jest.fn().mockReturnValue({}),
}));

jest.mock("firebase-functions", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  https: {
    onCall: jest.fn().mockImplementation((handler: Function) => handler),
  },
}));

jest.mock("firebase-functions/v1/https", () => ({
  HttpsError: class HttpsError extends Error {
    constructor(
      public code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));

// v2/https + logger mocks come from functions/jest.setup.ts (shared)

jest.mock("../utils/firebase", () => ({
  db: { collection: gtrMockCollection },
}));

// Mock pdfkit so we don't actually generate a PDF
jest.mock("pdfkit", () =>
  jest.fn().mockImplementation(() => ({
    on: jest.fn((event: string, cb: Function) => {
      if (event === "end") setTimeout(cb, 0);
    }),
    fontSize: jest.fn().mockReturnThis(),
    text: jest.fn().mockReturnThis(),
    moveDown: jest.fn().mockReturnThis(),
    addPage: jest.fn().mockReturnThis(),
    end: jest.fn(),
  })),
);

// ---- Test ----

import { generateTreasuryReport } from "../callable/generateTreasuryReport";

const validData = {
  groupId: "group-1",
  startDate: "2026-01-01",
  endDate: "2026-01-31",
};

describe("generateTreasuryReport — D-9 admin/treasurer-only authorization", () => {
  beforeEach(() => {
    gtrCollectionCalls.length = 0;
    gtrFieldQueryCalls.length = 0;
    groupDocSnap.data = () => ({
      name: "Test Group",
      admins: [],
      treasurers: [],
      treasury: { prudentReserve: 0 },
    });
    memberDocSnap.exists = false;
    memberDocSnap.data = () => null;
  });

  it("throws unauthenticated when no auth context", async () => {
    await expect(
      (generateTreasuryReport as unknown as Function)({
        auth: undefined,
        data: validData,
      }),
    ).rejects.toThrow(/authenticated/i);
  });

  it("throws permission-denied for plain group members (not admin/treasurer)", async () => {
    memberDocSnap.exists = true;
    memberDocSnap.data = () =>
      ({ isAdmin: false, isTreasurer: false }) as unknown as null;

    await expect(
      (generateTreasuryReport as unknown as Function)({
        auth: { uid: "plain-member" },
        data: validData,
      }),
    ).rejects.toThrow(/admin|treasurer/i);
  });

  /**
   * Helper: runs the handler and swallows ANY downstream error (PDF mock,
   * etc.). The handler may legitimately fail after the auth check passes;
   * we only care that the failure is NOT a permission-denied error.
   */
  async function runAndCaptureError(uid: string): Promise<unknown> {
    try {
      await (generateTreasuryReport as unknown as Function)({
        auth: { uid },
        data: validData,
      });
      return null;
    } catch (err) {
      return err;
    }
  }

  it("allows group admin via the group doc array (no permission-denied)", async () => {
    groupDocSnap.data = () => ({
      name: "Test Group",
      admins: ["user-admin"],
      treasurers: [],
      treasury: { prudentReserve: 0 },
    });
    const err = (await runAndCaptureError("user-admin")) as { code?: string };
    expect(err?.code).not.toBe("permission-denied");
  });

  it("allows group treasurer via the group doc array (no permission-denied)", async () => {
    groupDocSnap.data = () => ({
      name: "Test Group",
      admins: [],
      treasurers: ["user-treasurer"],
      treasury: { prudentReserve: 0 },
    });
    const err = (await runAndCaptureError("user-treasurer")) as {
      code?: string;
    };
    expect(err?.code).not.toBe("permission-denied");
  });

  it("allows member with isAdmin=true via members fallback (no permission-denied)", async () => {
    memberDocSnap.exists = true;
    memberDocSnap.data = () =>
      ({ isAdmin: true, isTreasurer: false }) as unknown as null;
    const err = (await runAndCaptureError("member-admin")) as {
      code?: string;
    };
    expect(err?.code).not.toBe("permission-denied");
  });
});

describe("generateTreasuryReport — top-level transactions collection (regression)", () => {
  beforeEach(() => {
    gtrCollectionCalls.length = 0;
    gtrFieldQueryCalls.length = 0;
    groupDocSnap.data = () => ({
      name: "Test Group",
      admins: ["user-admin"],
      treasurers: [],
      treasury: { prudentReserve: 0 },
    });
    memberDocSnap.exists = false;
  });

  it("queries the top-level transactions collection (not a group subcollection)", async () => {
    // Swallow downstream errors — we only care which collection was queried.
    try {
      await (generateTreasuryReport as unknown as Function)({
        auth: { uid: "user-admin" },
        data: validData,
      });
    } catch {
      // expected: PDF mock or similar downstream failure
    }

    // The callable must hit the top-level "transactions" collection.
    expect(gtrCollectionCalls).toContain("transactions");

    // And it must filter that collection by `groupId`. (If it instead queried
    // `groups/{gid}/transactions` as a subcollection, there'd be no
    // top-level `where('groupId', ...)`.)
    const txFieldQueries = gtrFieldQueryCalls.filter(
      (c) => c.collection === "transactions",
    );
    expect(txFieldQueries.map((q) => q.field)).toContain("groupId");
  });
});
