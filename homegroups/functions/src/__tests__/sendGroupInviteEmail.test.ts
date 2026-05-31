/**
 * Tests for sendGroupInviteEmail (D-10 v2 migration).
 *
 * Migrated from v1 `functions.https.onCall(config, handler)` (where the
 * `region: "us-east1"` config was silently ignored) to v2 `onCall` from
 * `firebase-functions/v2/https` (which honors region).
 *
 * Behavior preservation: auth gate, missing-field validation, email-format
 * regex, group / invite lookup, member-only gate, status/expiry checks, and
 * the email-send happy path.
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
const mockSendEmail = jest.fn().mockResolvedValue(undefined);

function makeQueryMock(collectionName: string) {
  const filters: Array<{ field: string; op: string; value: unknown }> = [];
  const q: Record<string, jest.Mock> = {};
  q.where = jest.fn((field: string, op: string, value: unknown) => {
    filters.push({ field, op, value });
    return q;
  });
  q.limit = jest.fn(() => q);
  q.get = jest.fn().mockImplementation(() => {
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
  const q = makeQueryMock(name);
  (q as unknown as { doc: jest.Mock }).doc = jest.fn((id: string) =>
    mockDoc(`${name}/${id}`),
  );
  return q;
});

jest.mock("firebase-admin", () => ({
  apps: [],
  initializeApp: jest.fn(),
  firestore: Object.assign(
    jest.fn().mockReturnValue({ collection: mockCollection }),
    {
      FieldValue: {
        serverTimestamp: jest.fn(() => "SERVER_TS"),
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
  db: { collection: mockCollection },
}));

jest.mock("../utils/email", () => ({
  sendEmail: mockSendEmail,
}));

// ---- Tests ----

import { sendGroupInviteEmail } from "../callable/sendGroupInviteEmail";

const VALID_DATA = {
  groupId: "group-1",
  inviteeEmail: "newcomer@example.com",
  inviteCode: "ABC123",
};
const FUTURE = { toDate: () => new Date(Date.now() + 86_400_000) };
const PAST = { toDate: () => new Date(Date.now() - 86_400_000) };

function seedGroup(opts: { id?: string; name?: string } = {}) {
  const id = opts.id ?? "group-1";
  docsByPath[`groups/${id}`] = {
    exists: true,
    data: () => ({ name: opts.name ?? "Tuesday Big Book" }),
  };
}

function seedInvite(
  opts: {
    code?: string;
    status?: string;
    expiresAt?: { toDate: () => Date };
  } = {},
) {
  const code = opts.code ?? "ABC123";
  queryResults[`groupInvites:${code}`] = [
    {
      id: `invite-${code}`,
      data: () => ({
        status: opts.status ?? "pending",
        expiresAt: opts.expiresAt ?? FUTURE,
      }),
    },
  ];
}

function seedInviter(opts: { uid?: string; displayName?: string } = {}) {
  const uid = opts.uid ?? "inviter-1";
  docsByPath[`users/${uid}`] = {
    exists: true,
    data: () => ({ displayName: opts.displayName ?? "Alice S." }),
  };
}

function seedMember(opts: { groupId?: string; uid?: string } = {}) {
  const gid = opts.groupId ?? "group-1";
  const uid = opts.uid ?? "inviter-1";
  docsByPath[`members/${gid}_${uid}`] = {
    exists: true,
    data: () => ({ userId: uid, groupId: gid }),
  };
}

describe("sendGroupInviteEmail — D-10 v2 migration", () => {
  beforeEach(() => {
    Object.keys(docsByPath).forEach((k) => delete docsByPath[k]);
    Object.keys(queryResults).forEach((k) => delete queryResults[k]);
    mockDocRefUpdate.mockClear();
    mockSendEmail.mockClear();
  });

  // ---- Auth gate ----

  it("throws unauthenticated when no auth context", async () => {
    await expect(
      (sendGroupInviteEmail as unknown as Function)({
        auth: undefined,
        data: VALID_DATA,
      }),
    ).rejects.toThrow(/log(ged)? in/i);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  // ---- Input validation ----

  it("throws invalid-argument when groupId is missing", async () => {
    await expect(
      (sendGroupInviteEmail as unknown as Function)({
        auth: { uid: "inviter-1" },
        data: { ...VALID_DATA, groupId: "" },
      }),
    ).rejects.toThrow(/missing required/i);
  });

  it("throws invalid-argument for malformed email", async () => {
    await expect(
      (sendGroupInviteEmail as unknown as Function)({
        auth: { uid: "inviter-1" },
        data: { ...VALID_DATA, inviteeEmail: "not-an-email" },
      }),
    ).rejects.toThrow(/invalid email/i);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  // ---- Resource lookup ----

  it("throws not-found when group does not exist", async () => {
    seedInvite();
    seedInviter();
    // No group seeded
    await expect(
      (sendGroupInviteEmail as unknown as Function)({
        auth: { uid: "inviter-1" },
        data: VALID_DATA,
      }),
    ).rejects.toThrow(/group not found/i);
  });

  it("throws not-found when invite code is invalid for this group", async () => {
    seedGroup();
    seedInviter();
    // No invite seeded
    await expect(
      (sendGroupInviteEmail as unknown as Function)({
        auth: { uid: "inviter-1" },
        data: VALID_DATA,
      }),
    ).rejects.toThrow(/invalid for this group/i);
  });

  // ---- Member-only gate ----

  it("throws permission-denied when caller is not a group member", async () => {
    seedGroup();
    seedInvite();
    seedInviter({ uid: "non-member" });
    // No member doc seeded for non-member
    await expect(
      (sendGroupInviteEmail as unknown as Function)({
        auth: { uid: "non-member" },
        data: VALID_DATA,
      }),
    ).rejects.toThrow(/member of this group/i);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  // ---- Status / expiry ----

  it("throws failed-precondition when invite is no longer pending", async () => {
    seedGroup();
    seedInvite({ status: "used" });
    seedInviter();
    seedMember();
    await expect(
      (sendGroupInviteEmail as unknown as Function)({
        auth: { uid: "inviter-1" },
        data: VALID_DATA,
      }),
    ).rejects.toThrow(/already used/i);
  });

  it("throws failed-precondition and marks invite expired when past expiresAt", async () => {
    seedGroup();
    seedInvite({ expiresAt: PAST });
    seedInviter();
    seedMember();
    await expect(
      (sendGroupInviteEmail as unknown as Function)({
        auth: { uid: "inviter-1" },
        data: VALID_DATA,
      }),
    ).rejects.toThrow(/expired/i);
    expect(mockDocRefUpdate).toHaveBeenCalledWith({ status: "expired" });
  });

  // ---- Happy path ----

  it("sends email and updates the invite on the happy path", async () => {
    seedGroup({ name: "Tuesday Big Book" });
    seedInvite();
    seedInviter({ displayName: "Alice S." });
    seedMember();

    const result = await (sendGroupInviteEmail as unknown as Function)({
      auth: { uid: "inviter-1" },
      data: VALID_DATA,
    });

    expect(result).toEqual({ success: true });
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const emailArg = mockSendEmail.mock.calls[0][0];
    expect(emailArg.to).toBe("newcomer@example.com");
    expect(emailArg.subject).toContain("Tuesday Big Book");
    expect(emailArg.html).toContain("Alice S.");
    expect(emailArg.html).toContain("ABC123");
    expect(emailArg.html).toContain("https://homegroups-app.com/join?code=");

    // Invite was updated with email-sent metadata.
    expect(mockDocRefUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        emailSentTo: "newcomer@example.com",
      }),
    );
  });
});
