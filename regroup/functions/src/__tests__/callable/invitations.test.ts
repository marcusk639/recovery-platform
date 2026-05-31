// src/__tests__/callable/invitations.test.ts

jest.mock("firebase-functions/v2/https", () => {
  const actual = jest.requireActual("firebase-functions/v2/https");
  return {
    ...actual,
    onCall: (_opts: any, handler?: Function) =>
      typeof _opts === "function" ? _opts : handler,
  };
});

jest.mock("firebase-functions", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

// The CF reads houses + writes invitations via admin.firestore().
const mockHouseGet = jest.fn();
const mockInvitationsSet = jest.fn();
const mockInvitationsDocGet = jest.fn();
const mockInvitationsDocUpdate = jest.fn();
// Stable refs so redeem tests can assert on these — the `auth: jest.fn(() => …)`
// pattern would otherwise return a fresh setCustomUserClaims jest.fn per call,
// making assertions impossible. mockCreateClaims is mocked via its own
// jest.mock factory below.
const mockSetCustomUserClaims = jest.fn();
const mockCreateClaims = jest.fn();

jest.mock("firebase-admin", () => ({
  auth: jest.fn(() => ({ setCustomUserClaims: mockSetCustomUserClaims })),
  firestore: () => ({
    collection: (name: string) => {
      if (name === "houses")
        return { doc: (_id: string) => ({ get: mockHouseGet }) };
      if (name === "invitations")
        return {
          doc: (_id: string) => ({
            get: mockInvitationsDocGet,
            set: mockInvitationsSet,
            update: mockInvitationsDocUpdate,
          }),
        };
      return {};
    },
  }),
}));

jest.mock("../../util/claims", () => ({
  createClaims: (...args: unknown[]) => mockCreateClaims(...args),
}));

// Token util — deterministic for testing.
jest.mock("../../util/tokens", () => ({
  generateInvitationToken: () => "TEST_TOKEN_FIXED",
}));

// Email helper — verify the CF calls it with the right args, don't
// actually send mail.
const mockSendOneInviteEmail = jest.fn();
jest.mock("../../util/inviteEmails", () => ({
  sendOneInviteEmail: (...args: unknown[]) => mockSendOneInviteEmail(...args),
}));

import { createInvitation, redeemInvitation } from "../../callable/invitations";

const fakeAuth = { uid: "inviter-uid", token: { email: "inviter@x.com" } };
const call = (fn: unknown, data: unknown, auth: object | null = fakeAuth) =>
  (fn as Function)({ data, auth: auth ?? undefined });

beforeEach(() => jest.clearAllMocks());

describe("createInvitation — happy path", () => {
  it("admin of the house writes an invitation doc and returns the token", async () => {
    mockHouseGet.mockResolvedValue({
      exists: true,
      data: () => ({
        ownerId: "someone-else",
        adminIds: ["inviter-admin-id"],
      }),
    });

    const result = await call(
      createInvitation,
      {
        email: "newadmin@x.com",
        houseId: "house-1",
        role: "admin",
      },
      { uid: "inviter-uid", token: { admin: { "house-1": true } } }
    );

    expect(result).toEqual({ token: "TEST_TOKEN_FIXED" });
    expect(mockInvitationsSet).toHaveBeenCalledTimes(1);
    const [doc] = mockInvitationsSet.mock.calls[0];
    expect(doc).toMatchObject({
      token: "TEST_TOKEN_FIXED",
      inviterUid: "inviter-uid",
      houseId: "house-1",
      role: "admin",
      invitedEmail: "newadmin@x.com",
    });
    expect(doc.expiresAt).toEqual(expect.any(String));
    expect(mockSendOneInviteEmail).toHaveBeenCalledTimes(1);
  });

  it("omits initialPhase from the doc when not provided (Firestore rejects undefined values)", async () => {
    mockHouseGet.mockResolvedValue({
      exists: true,
      data: () => ({ ownerId: "owner-uid" }),
    });
    await call(
      createInvitation,
      { email: "x@x.com", houseId: "h", role: "admin" },
      { uid: "owner-uid", token: {} }
    );
    const [doc] = mockInvitationsSet.mock.calls[0];
    expect(doc).not.toHaveProperty("initialPhase");
    expect(doc).toMatchObject({
      token: "TEST_TOKEN_FIXED",
      inviterUid: "owner-uid",
      houseId: "h",
      role: "admin",
      invitedEmail: "x@x.com",
    });
  });

  it("includes initialPhase in the doc when provided", async () => {
    mockHouseGet.mockResolvedValue({
      exists: true,
      data: () => ({ ownerId: "owner-uid" }),
    });
    await call(
      createInvitation,
      {
        email: "guest@x.com",
        houseId: "h",
        role: "guest",
        initialPhase: "Phase 1",
      },
      { uid: "owner-uid", token: {} }
    );
    const [doc] = mockInvitationsSet.mock.calls[0];
    expect(doc).toHaveProperty("initialPhase", "Phase 1");
    expect(doc).toMatchObject({
      token: "TEST_TOKEN_FIXED",
      inviterUid: "owner-uid",
      houseId: "h",
      role: "guest",
      invitedEmail: "guest@x.com",
    });
  });
});

describe("createInvitation — denials", () => {
  it("DENY unauthenticated caller", async () => {
    await expect(
      call(
        createInvitation,
        { email: "x@x.com", houseId: "h", role: "admin" },
        null
      )
    ).rejects.toMatchObject({ code: "unauthenticated" });
    expect(mockInvitationsSet).not.toHaveBeenCalled();
  });

  it("DENY caller who is neither owner nor admin/superAdmin of the house", async () => {
    mockHouseGet.mockResolvedValue({
      exists: true,
      data: () => ({ ownerId: "someone-else" }),
    });
    await expect(
      call(
        createInvitation,
        { email: "x@x.com", houseId: "house-1", role: "admin" },
        { uid: "random-uid", token: { admin: { "house-OTHER": true } } }
      )
    ).rejects.toMatchObject({ code: "permission-denied" });
    expect(mockInvitationsSet).not.toHaveBeenCalled();
  });

  it("DENY house that does not exist", async () => {
    mockHouseGet.mockResolvedValue({ exists: false });
    await expect(
      call(
        createInvitation,
        { email: "x@x.com", houseId: "ghost", role: "admin" },
        fakeAuth
      )
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("REJECT invalid role at schema boundary", async () => {
    mockHouseGet.mockResolvedValue({
      exists: true,
      data: () => ({ ownerId: "inviter-uid" }),
    });
    await expect(
      call(
        createInvitation,
        { email: "x@x.com", houseId: "h", role: "superAdmin" as any },
        fakeAuth
      )
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("ALLOW owner (token admin claim absent) — owner is the setup-wizard self-service path", async () => {
    mockHouseGet.mockResolvedValue({
      exists: true,
      data: () => ({ ownerId: "owner-uid" }),
    });
    const result = await call(
      createInvitation,
      { email: "x@x.com", houseId: "h", role: "admin" },
      { uid: "owner-uid", token: {} } // no admin claim yet
    );
    expect(result).toEqual({ token: "TEST_TOKEN_FIXED" });
  });
});

describe("peekInvitation", () => {
  it("returns role/email/houseId/initialPhase for a valid token", async () => {
    mockInvitationsDocGet.mockResolvedValue({
      exists: true,
      data: () => ({
        token: "TEST_TOKEN_FIXED",
        inviterUid: "inviter-uid",
        houseId: "house-1",
        role: "guest",
        invitedEmail: "guest@x.com",
        initialPhase: "Phase 1",
        expiresAt: new Date(Date.now() + 86400_000).toISOString(),
        createdAt: new Date().toISOString(),
      }),
    });

    const { peekInvitation } = require("../../callable/invitations");
    const result = await call(
      peekInvitation,
      { token: "TEST_TOKEN_FIXED" },
      null // peek is unauthenticated — the token IS the credential
    );
    expect(result).toEqual({
      houseId: "house-1",
      role: "guest",
      invitedEmail: "guest@x.com",
      initialPhase: "Phase 1",
      expiresAt: expect.any(String),
    });
  });

  it("DENY: token does not exist (404 with generic message)", async () => {
    mockInvitationsDocGet.mockResolvedValue({ exists: false });
    const { peekInvitation } = require("../../callable/invitations");
    await expect(
      call(peekInvitation, { token: "MISSING" }, null)
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("DENY: token already redeemed", async () => {
    mockInvitationsDocGet.mockResolvedValue({
      exists: true,
      data: () => ({
        token: "T",
        inviterUid: "i",
        houseId: "h",
        role: "guest",
        invitedEmail: "x@x.com",
        expiresAt: new Date(Date.now() + 86400_000).toISOString(),
        createdAt: new Date().toISOString(),
        redeemedAt: new Date().toISOString(),
        redeemedByUid: "someone",
      }),
    });
    const { peekInvitation } = require("../../callable/invitations");
    await expect(
      call(peekInvitation, { token: "T" }, null)
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("DENY: token expired", async () => {
    mockInvitationsDocGet.mockResolvedValue({
      exists: true,
      data: () => ({
        token: "T",
        inviterUid: "i",
        houseId: "h",
        role: "guest",
        invitedEmail: "x@x.com",
        expiresAt: new Date(Date.now() - 1000).toISOString(),
        createdAt: new Date().toISOString(),
      }),
    });
    const { peekInvitation } = require("../../callable/invitations");
    await expect(
      call(peekInvitation, { token: "T" }, null)
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });
});

describe("redeemInvitation", () => {
  const VALID = {
    token: "TEST_TOKEN_FIXED",
    inviterUid: "inviter-uid",
    houseId: "house-1",
    role: "admin" as const,
    invitedEmail: "alice@x.com",
    expiresAt: new Date(Date.now() + 86400_000).toISOString(),
    createdAt: new Date().toISOString(),
  };

  it("happy path: sets claims from the invitation doc and marks redeemed", async () => {
    mockInvitationsDocGet.mockResolvedValue({
      exists: true,
      data: () => ({ ...VALID }),
    });
    mockCreateClaims.mockResolvedValue({ admin: ["house-1"] });
    mockSetCustomUserClaims.mockResolvedValue(undefined);

    const result = await call(
      redeemInvitation,
      { token: "TEST_TOKEN_FIXED" },
      { uid: "alice-uid", token: { email: "alice@x.com" } }
    );

    expect(mockCreateClaims).toHaveBeenCalledWith(
      "alice-uid",
      ["house-1"],
      "admin",
      false
    );
    expect(mockSetCustomUserClaims).toHaveBeenCalledWith(
      "alice-uid",
      expect.objectContaining({ admin: ["house-1"] })
    );
    expect(mockInvitationsDocUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        redeemedAt: expect.any(String),
        redeemedByUid: "alice-uid",
      })
    );
    expect(result).toEqual({ houseId: "house-1", role: "admin" });
  });

  it("DENY: caller email does not match invitation email (case-insensitive)", async () => {
    mockInvitationsDocGet.mockResolvedValue({
      exists: true,
      data: () => ({ ...VALID }),
    });
    await expect(
      call(
        redeemInvitation,
        { token: "TEST_TOKEN_FIXED" },
        { uid: "attacker-uid", token: { email: "attacker@x.com" } }
      )
    ).rejects.toMatchObject({ code: "permission-denied" });
    expect(mockInvitationsDocUpdate).not.toHaveBeenCalled();
    expect(mockSetCustomUserClaims).not.toHaveBeenCalled();
  });

  it("DENY: already redeemed", async () => {
    mockInvitationsDocGet.mockResolvedValue({
      exists: true,
      data: () => ({
        ...VALID,
        redeemedAt: new Date().toISOString(),
        redeemedByUid: "someone-else",
      }),
    });
    await expect(
      call(
        redeemInvitation,
        { token: "TEST_TOKEN_FIXED" },
        { uid: "alice-uid", token: { email: "alice@x.com" } }
      )
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("DENY: expired", async () => {
    mockInvitationsDocGet.mockResolvedValue({
      exists: true,
      data: () => ({
        ...VALID,
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      }),
    });
    await expect(
      call(
        redeemInvitation,
        { token: "TEST_TOKEN_FIXED" },
        { uid: "alice-uid", token: { email: "alice@x.com" } }
      )
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("DENY: unauthenticated", async () => {
    await expect(
      call(redeemInvitation, { token: "T" }, null)
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("DENY: token not found", async () => {
    mockInvitationsDocGet.mockResolvedValue({ exists: false });
    await expect(
      call(
        redeemInvitation,
        { token: "GHOST" },
        { uid: "alice-uid", token: { email: "alice@x.com" } }
      )
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("role=guest maps to a guest claim (not admin)", async () => {
    mockInvitationsDocGet.mockResolvedValue({
      exists: true,
      data: () => ({ ...VALID, role: "guest" }),
    });
    mockCreateClaims.mockResolvedValue({ guest: ["house-1"] });
    await call(
      redeemInvitation,
      { token: "T" },
      { uid: "alice-uid", token: { email: "alice@x.com" } }
    );
    expect(mockCreateClaims).toHaveBeenCalledWith(
      "alice-uid",
      ["house-1"],
      "guest",
      false
    );
  });

  it("role=senior-peer maps to BOTH guest and admin claims", async () => {
    mockInvitationsDocGet.mockResolvedValue({
      exists: true,
      data: () => ({ ...VALID, role: "senior-peer" }),
    });
    mockCreateClaims.mockResolvedValue({ guest: ["house-1"] });
    await call(
      redeemInvitation,
      { token: "T" },
      { uid: "alice-uid", token: { email: "alice@x.com" } }
    );
    expect(mockCreateClaims).toHaveBeenCalledTimes(2);
    expect(mockCreateClaims).toHaveBeenNthCalledWith(
      1,
      "alice-uid",
      ["house-1"],
      "guest",
      false
    );
    expect(mockCreateClaims).toHaveBeenNthCalledWith(
      2,
      "alice-uid",
      ["house-1"],
      "admin",
      false
    );
    expect(mockSetCustomUserClaims).toHaveBeenCalledTimes(2);
  });
});
