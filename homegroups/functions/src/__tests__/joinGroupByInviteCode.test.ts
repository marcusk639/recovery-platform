/**
 * Tests for joinGroupByInviteCode (D-10 v2 migration).
 *
 * The callable was previously a v1 `functions.https.onCall(config, handler)`
 * call where the `region: "us-west1"` config field was silently ignored — the
 * function actually deployed to us-central1. Migrated to v2 `onCall` from
 * `firebase-functions/v2/https`, which honors the region.
 *
 * These tests assert behavior preservation across the migration: auth gates,
 * input validation, expiry / status checks, and the already-member branch.
 *
 * Refs: .audit/doc-code-discrepancies.md D-10
 */

export {};

// ---- Mocks ----

const docsByPath: Record<string, { exists: boolean; data: () => unknown }> = {};
const queryResults: Record<
  string,
  Array<{ id: string; data: () => unknown }>
> = {};

const mockDocRefUpdate = jest.fn().mockResolvedValue(undefined);
const mockBatchCommit = jest.fn().mockResolvedValue(undefined);
const mockBatchSet = jest.fn();
const mockBatchUpdate = jest.fn();

const collectionAccessLog: string[] = [];

function makeQueryMock(collectionName: string) {
  const filters: Array<{ field: string; op: string; value: unknown }> = [];
  const q: Record<string, jest.Mock> = {};
  q.where = jest.fn((field: string, op: string, value: unknown) => {
    filters.push({ field, op, value });
    return q;
  });
  q.limit = jest.fn(() => q);
  q.get = jest.fn().mockImplementation(() => {
    // Look up canned results by collection + code filter
    const codeFilter = filters.find((f) => f.field === "code" && f.op === "==");
    const key = `${collectionName}:${codeFilter?.value ?? "*"}`;
    const docs = queryResults[key] ?? [];
    return Promise.resolve({
      empty: docs.length === 0,
      docs: docs.map((d) => ({
        id: d.id,
        data: d.data,
        ref: { update: mockDocRefUpdate },
      })),
    });
  });
  return q;
}

const mockDoc = jest.fn((path: string) => ({
  get: jest.fn().mockResolvedValue(
    docsByPath[path] ?? {
      exists: false,
      data: () => null,
    },
  ),
  update: mockDocRefUpdate,
}));

const mockCollection = jest.fn((name: string) => {
  collectionAccessLog.push(name);
  const q = makeQueryMock(name);
  (q as unknown as { doc: jest.Mock }).doc = jest.fn((id: string) =>
    mockDoc(`${name}/${id}`),
  );
  return q;
});

const mockBatch = jest.fn(() => ({
  set: mockBatchSet,
  update: mockBatchUpdate,
  commit: mockBatchCommit,
}));

jest.mock("firebase-admin", () => ({
  apps: [],
  initializeApp: jest.fn(),
  firestore: Object.assign(
    jest.fn().mockReturnValue({
      collection: mockCollection,
      batch: mockBatch,
    }),
    {
      FieldValue: {
        serverTimestamp: jest.fn(() => "SERVER_TS"),
        increment: jest.fn((n: number) => ({ __inc: n })),
        arrayUnion: jest.fn((v: unknown) => ({ __arrayUnion: v })),
      },
    },
  ),
  app: jest.fn().mockReturnValue({}),
  auth: jest.fn().mockReturnValue({}),
}));

jest.mock("firebase-functions/v2/https", () => ({
  onCall: jest
    .fn()
    .mockImplementation((_config: unknown, handler: Function) => handler),
  HttpsError: class HttpsError extends Error {
    constructor(
      public code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));

// logger mock comes from functions/jest.setup.ts (shared)

jest.mock("../utils/firebase", () => ({
  db: {
    collection: mockCollection,
    batch: mockBatch,
  },
}));

// ---- Tests ----

import { joinGroupByInviteCode } from "../callable/joinGroupByInviteCode";

const VALID_CODE = "ABC123";
const FUTURE = { toDate: () => new Date(Date.now() + 86_400_000) };
const PAST = { toDate: () => new Date(Date.now() - 86_400_000) };

function seedPendingInvite(opts: {
  code?: string;
  groupId?: string;
  expiresAt?: { toDate: () => Date };
  status?: string;
  groupName?: string;
}) {
  const code = opts.code ?? VALID_CODE;
  queryResults[`groupInvites:${code}`] = [
    {
      id: `invite-${code}`,
      data: () => ({
        groupId: opts.groupId ?? "group-1",
        status: opts.status ?? "pending",
        expiresAt: opts.expiresAt ?? FUTURE,
        groupName: opts.groupName ?? "Test Group",
      }),
    },
  ];
}

describe("joinGroupByInviteCode — D-10 v2 migration", () => {
  beforeEach(() => {
    Object.keys(docsByPath).forEach((k) => delete docsByPath[k]);
    Object.keys(queryResults).forEach((k) => delete queryResults[k]);
    collectionAccessLog.length = 0;
    mockDocRefUpdate.mockClear();
    mockBatchCommit.mockClear();
    mockBatchSet.mockClear();
    mockBatchUpdate.mockClear();
  });

  // ---- Auth gate ----

  it("throws unauthenticated when no auth context", async () => {
    await expect(
      (joinGroupByInviteCode as unknown as Function)({
        auth: undefined,
        data: { code: VALID_CODE },
      }),
    ).rejects.toThrow(/log(ged)? in/i);
  });

  // ---- Input validation ----

  it("throws invalid-argument when code is missing", async () => {
    await expect(
      (joinGroupByInviteCode as unknown as Function)({
        auth: { uid: "user-1" },
        data: { code: "" },
      }),
    ).rejects.toThrow(/invalid invite code format/i);
  });

  it("throws invalid-argument when code is not 6 characters", async () => {
    await expect(
      (joinGroupByInviteCode as unknown as Function)({
        auth: { uid: "user-1" },
        data: { code: "ABC" },
      }),
    ).rejects.toThrow(/invalid invite code format/i);
  });

  // ---- Invite lookup ----

  it("throws not-found when code does not match any invite", async () => {
    await expect(
      (joinGroupByInviteCode as unknown as Function)({
        auth: { uid: "user-1" },
        data: { code: "ZZZZZZ" },
      }),
    ).rejects.toThrow(/not found/i);
  });

  it("throws failed-precondition when invite status is not pending", async () => {
    seedPendingInvite({ status: "used" });

    await expect(
      (joinGroupByInviteCode as unknown as Function)({
        auth: { uid: "user-1" },
        data: { code: VALID_CODE },
      }),
    ).rejects.toThrow(/already been used/i);
  });

  it("throws failed-precondition and marks invite expired when past expiresAt", async () => {
    seedPendingInvite({ expiresAt: PAST });

    await expect(
      (joinGroupByInviteCode as unknown as Function)({
        auth: { uid: "user-1" },
        data: { code: VALID_CODE },
      }),
    ).rejects.toThrow(/expired/i);

    // The invite was marked expired as a side-effect.
    expect(mockDocRefUpdate).toHaveBeenCalledWith({ status: "expired" });
  });

  // ---- Already-member branch ----

  it("returns success without batching when user is already a member", async () => {
    seedPendingInvite({ groupId: "group-1" });
    docsByPath["members/group-1_user-1"] = {
      exists: true,
      data: () => ({ userId: "user-1", groupId: "group-1" }),
    };

    const result = await (joinGroupByInviteCode as unknown as Function)({
      auth: { uid: "user-1" },
      data: { code: VALID_CODE },
    });

    expect(result).toMatchObject({
      success: true,
      groupId: "group-1",
      message: expect.stringMatching(/already a member/i),
    });
    // Invite still marked used (not the batch path).
    expect(mockDocRefUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: "used", usedByUid: "user-1" }),
    );
    expect(mockBatchCommit).not.toHaveBeenCalled();
  });

  // ---- Happy path ----

  it("joins the group via batch commit and returns success on the happy path", async () => {
    seedPendingInvite({ groupId: "group-1", groupName: "Tuesday Big Book" });
    docsByPath["members/group-1_user-1"] = {
      exists: false,
      data: () => null,
    };
    docsByPath["groups/group-1"] = {
      exists: true,
      data: () => ({ name: "Tuesday Big Book" }),
    };
    docsByPath["users/user-1"] = {
      exists: true,
      data: () => ({
        displayName: "John D.",
        email: "john@example.com",
        showSobrietyDate: true,
      }),
    };

    const result = await (joinGroupByInviteCode as unknown as Function)({
      auth: { uid: "user-1" },
      data: { code: VALID_CODE },
    });

    expect(result).toEqual({
      success: true,
      groupId: "group-1",
      groupName: "Tuesday Big Book",
      message: "Successfully joined group.",
    });
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
    expect(mockBatchSet).toHaveBeenCalledTimes(1);
    // 3 updates: groups, invite, user
    expect(mockBatchUpdate).toHaveBeenCalledTimes(3);
  });

  it("normalizes lowercase invite codes to uppercase before lookup", async () => {
    seedPendingInvite({ code: "ABC123", groupId: "group-1" });
    docsByPath["members/group-1_user-1"] = { exists: false, data: () => null };
    docsByPath["groups/group-1"] = {
      exists: true,
      data: () => ({ name: "G" }),
    };
    docsByPath["users/user-1"] = {
      exists: true,
      data: () => ({ displayName: "User" }),
    };

    await (joinGroupByInviteCode as unknown as Function)({
      auth: { uid: "user-1" },
      data: { code: "abc123" }, // lowercase
    });

    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
  });
});
