// src/__tests__/callable/auth.test.ts

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

const mockCreateClaims = jest.fn();
const mockDeleteClaim = jest.fn();
const mockGetGuestsAsUsers = jest.fn();
const mockVerifyUserEmail = jest.fn();
const mockSetCustomUserClaims = jest.fn();
const mockAuthGetUser = jest.fn();
// Default house doc lookup used by addAdminAuthorization's authorization
// guard. Individual tests override the resolved value via mockResolvedValue /
// mockResolvedValueOnce so per-test ownerId / existence can be asserted.
const mockHouseGet = jest.fn();

jest.mock("../../util/claims", () => ({
  createClaims: mockCreateClaims,
  deleteClaim: mockDeleteClaim,
}));

jest.mock("../../util/user", () => ({
  getGuestsAsUsers: mockGetGuestsAsUsers,
  _verifyUserEmail: mockVerifyUserEmail,
}));

jest.mock("firebase-admin", () => ({
  auth: jest.fn(() => ({
    setCustomUserClaims: mockSetCustomUserClaims,
    getUser: mockAuthGetUser,
  })),
  firestore: jest.fn(() => ({
    collection: () => ({ doc: () => ({ get: mockHouseGet }) }),
  })),
}));

import {
  addGuestAuthorization,
  addAdminAuthorization,
  deleteAdminAuthorization,
  promoteGuestsToAdmin,
  removePrivilegesForGuests,
  verifyUserEmail,
  givePotentialSuperAdminPrivilege,
} from "../../callable/auth";
import { HttpsError } from "firebase-functions/v2/https";

const fakeAuth = { uid: "test-user" };
const call = (fn: unknown, data: unknown, auth: object | null = fakeAuth) =>
  (fn as Function)({ data, auth: auth ?? undefined });

beforeEach(() => jest.clearAllMocks());

describe("addGuestAuthorization", () => {
  it("creates guest claims and sets them", async () => {
    // Caller "u1" is also the target & owner of the house, so the
    // authorization guard's owner-branch allows the self-grant.
    mockHouseGet.mockResolvedValue({
      exists: true,
      data: () => ({ ownerId: "u1" }),
    });
    const fakeClaims = { guest: ["house-1"] };
    mockCreateClaims.mockResolvedValue(fakeClaims);
    mockSetCustomUserClaims.mockResolvedValue(undefined);

    const result = await call(
      addGuestAuthorization,
      {
        userId: "u1",
        houseId: "house-1",
        isAdmin: false,
      },
      { uid: "u1", token: {} }
    );
    expect(mockCreateClaims).toHaveBeenCalledWith("u1", ["house-1"], "guest");
    expect(mockSetCustomUserClaims).toHaveBeenCalledWith("u1", fakeClaims);
    expect(result).toBe(true);
  });

  it("also creates admin claims when isAdmin is true", async () => {
    mockHouseGet.mockResolvedValue({
      exists: true,
      data: () => ({ ownerId: "u1" }),
    });
    mockCreateClaims.mockResolvedValue({});
    mockSetCustomUserClaims.mockResolvedValue(undefined);
    await call(
      addGuestAuthorization,
      {
        userId: "u1",
        houseId: "h1",
        isAdmin: true,
      },
      { uid: "u1", token: {} }
    );
    expect(mockCreateClaims).toHaveBeenCalledTimes(2);
    expect(mockCreateClaims).toHaveBeenNthCalledWith(1, "u1", ["h1"], "guest");
    expect(mockCreateClaims).toHaveBeenNthCalledWith(
      2,
      "u1",
      ["h1"],
      "admin",
      false
    );
  });

  it("returns false when an error occurs", async () => {
    mockHouseGet.mockResolvedValue({
      exists: true,
      data: () => ({ ownerId: "u1" }),
    });
    mockCreateClaims.mockRejectedValue(new Error("Firebase error"));
    const result = await call(
      addGuestAuthorization,
      {
        userId: "u1",
        houseId: "h1",
        isAdmin: false,
      },
      { uid: "u1", token: {} }
    );
    expect(result).toBe(false);
  });
});

describe("addGuestAuthorization — authorization guard (post-S2)", () => {
  it("DENY caller granting themselves guest of a house they don't own", async () => {
    mockHouseGet.mockResolvedValue({
      exists: true,
      data: () => ({ ownerId: "someone-else" }),
    });
    await expect(
      call(
        addGuestAuthorization,
        { userId: "attacker-uid", houseId: "house-victim", isAdmin: false },
        { uid: "attacker-uid", token: {} }
      )
    ).rejects.toMatchObject({ code: "permission-denied" });
    expect(mockSetCustomUserClaims).not.toHaveBeenCalled();
  });

  it("ALLOW owner of the house granting a new guest", async () => {
    mockHouseGet.mockResolvedValue({
      exists: true,
      data: () => ({ ownerId: "owner-uid" }),
    });
    mockCreateClaims.mockResolvedValue({});
    mockSetCustomUserClaims.mockResolvedValue(undefined);
    const result = await call(
      addGuestAuthorization,
      { userId: "newguest-uid", houseId: "house-1", isAdmin: false },
      { uid: "owner-uid", token: {} }
    );
    expect(result).toBe(true);
  });

  it("ALLOW existing admin of the house granting a new guest", async () => {
    mockHouseGet.mockResolvedValue({
      exists: true,
      data: () => ({ ownerId: "someone-else" }),
    });
    mockCreateClaims.mockResolvedValue({});
    mockSetCustomUserClaims.mockResolvedValue(undefined);
    const result = await call(
      addGuestAuthorization,
      { userId: "newguest-uid", houseId: "house-1", isAdmin: false },
      { uid: "admin-uid", token: { admin: { "house-1": true } } }
    );
    expect(result).toBe(true);
  });

  it("DENY admin of a DIFFERENT house granting a guest", async () => {
    mockHouseGet.mockResolvedValue({
      exists: true,
      data: () => ({ ownerId: "someone-else" }),
    });
    await expect(
      call(
        addGuestAuthorization,
        { userId: "newguest-uid", houseId: "house-1", isAdmin: false },
        { uid: "admin-uid", token: { admin: { "house-OTHER": true } } }
      )
    ).rejects.toMatchObject({ code: "permission-denied" });
    expect(mockSetCustomUserClaims).not.toHaveBeenCalled();
  });
});

describe("addAdminAuthorization", () => {
  it("creates admin and superAdmin claims and merges them", async () => {
    // Caller "u1" is also the target & the owner of both houses, so the
    // authorization guard's owner-branch allows the self-grant
    // (mirrors the setup-wizard flow).
    mockHouseGet.mockResolvedValue({
      exists: true,
      data: () => ({ ownerId: "u1" }),
    });
    const adminClaims = { admin: ["h1"] };
    const superAdminClaims = { superAdmin: ["h2"] };
    mockCreateClaims
      .mockResolvedValueOnce(adminClaims)
      .mockResolvedValueOnce(superAdminClaims);
    mockSetCustomUserClaims.mockResolvedValue(undefined);

    const result = await call(
      addAdminAuthorization,
      {
        userId: "u1",
        houseIds: ["h1"],
        superAdmin: ["h2"],
      },
      { uid: "u1", token: {} }
    );

    expect(mockCreateClaims).toHaveBeenCalledTimes(2);
    expect(mockCreateClaims).toHaveBeenNthCalledWith(
      1,
      "u1",
      ["h1"],
      "admin",
      false
    );
    expect(mockCreateClaims).toHaveBeenNthCalledWith(
      2,
      "u1",
      ["h2"],
      "superAdmin",
      false
    );
    expect(mockSetCustomUserClaims).toHaveBeenCalledWith("u1", {
      ...adminClaims,
      ...superAdminClaims,
    });
    expect(result).toBe(true);
  });

  it("returns false when an error occurs", async () => {
    mockHouseGet.mockResolvedValue({
      exists: true,
      data: () => ({ ownerId: "u1" }),
    });
    mockCreateClaims.mockRejectedValue(new Error("Firebase error"));
    const result = await call(
      addAdminAuthorization,
      {
        userId: "u1",
        houseIds: ["h1"],
        superAdmin: [],
      },
      { uid: "u1", token: {} }
    );
    expect(result).toBe(false);
  });
});

describe("addAdminAuthorization — authorization guard (post-S2)", () => {
  it("DENY caller granting themselves admin of a house they don't own", async () => {
    mockHouseGet.mockResolvedValue({
      exists: true,
      data: () => ({ ownerId: "someone-else" }),
    });
    await expect(
      call(
        addAdminAuthorization,
        {
          userId: "attacker-uid",
          houseIds: ["house-victim"],
          superAdmin: [],
        },
        { uid: "attacker-uid", token: {} }
      )
    ).rejects.toMatchObject({ code: "permission-denied" });
    expect(mockSetCustomUserClaims).not.toHaveBeenCalled();
  });

  it("DENY caller granting another user admin of a house the caller doesn't admin", async () => {
    mockHouseGet.mockResolvedValue({
      exists: true,
      data: () => ({ ownerId: "someone-else" }),
    });
    await expect(
      call(
        addAdminAuthorization,
        {
          userId: "target-uid",
          houseIds: ["house-victim"],
          superAdmin: [],
        },
        { uid: "attacker-uid", token: {} }
      )
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("ALLOW owner granting themselves admin of their own house (setup-wizard)", async () => {
    mockHouseGet.mockResolvedValue({
      exists: true,
      data: () => ({ ownerId: "owner-uid" }),
    });
    mockCreateClaims.mockResolvedValue({});
    mockSetCustomUserClaims.mockResolvedValue(undefined);
    const result = await call(
      addAdminAuthorization,
      { userId: "owner-uid", houseIds: ["house-1"], superAdmin: [] },
      { uid: "owner-uid", token: {} }
    );
    expect(result).toBe(true);
  });

  it("ALLOW existing admin granting another user admin (delegation)", async () => {
    mockHouseGet.mockResolvedValue({
      exists: true,
      data: () => ({ ownerId: "someone-else" }),
    });
    mockCreateClaims.mockResolvedValue({});
    mockSetCustomUserClaims.mockResolvedValue(undefined);
    const result = await call(
      addAdminAuthorization,
      { userId: "newadmin-uid", houseIds: ["house-1"], superAdmin: [] },
      { uid: "existing-admin-uid", token: { admin: { "house-1": true } } }
    );
    expect(result).toBe(true);
  });

  it("DENY existing admin self-granting admin of the SAME house (no-op attempt)", async () => {
    // The guard requires isOwner OR (existingAdmin AND admin.userId !== callerUid).
    // Self-grants of houses you already admin are denied — there's no
    // legitimate use case, and the surface should be minimal.
    mockHouseGet.mockResolvedValue({
      exists: true,
      data: () => ({ ownerId: "someone-else" }),
    });
    await expect(
      call(
        addAdminAuthorization,
        {
          userId: "existing-admin-uid",
          houseIds: ["house-1"],
          superAdmin: [],
        },
        { uid: "existing-admin-uid", token: { admin: { "house-1": true } } }
      )
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("DENY empty payload (both houseIds and superAdmin empty)", async () => {
    await expect(
      call(
        addAdminAuthorization,
        { userId: "anyone", houseIds: [], superAdmin: [] },
        { uid: "anyone", token: {} }
      )
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });
});

describe("deleteAdminAuthorization", () => {
  it("deletes admin claims for provided houseIds", async () => {
    mockDeleteClaim.mockResolvedValue({ admin: [] });
    mockSetCustomUserClaims.mockResolvedValue(undefined);

    await call(deleteAdminAuthorization, {
      admin: { userId: "u1" },
      adminHouseIds: ["h1"],
      superAdminHouseIds: [],
    });

    expect(mockDeleteClaim).toHaveBeenCalledWith("u1", ["h1"], "admin");
    expect(mockDeleteClaim).toHaveBeenCalledTimes(1);
  });

  it("deletes superAdmin claims for provided superAdminHouseIds", async () => {
    mockDeleteClaim.mockResolvedValue({ superAdmin: [] });
    mockSetCustomUserClaims.mockResolvedValue(undefined);

    await call(deleteAdminAuthorization, {
      admin: { userId: "u1" },
      adminHouseIds: [],
      superAdminHouseIds: ["h2"],
    });

    expect(mockDeleteClaim).toHaveBeenCalledWith("u1", ["h2"], "superAdmin");
    expect(mockDeleteClaim).toHaveBeenCalledTimes(1);
  });

  it("deletes both admin and superAdmin claims when both arrays are non-empty", async () => {
    mockDeleteClaim
      .mockResolvedValueOnce({ admin: [] })
      .mockResolvedValueOnce({ superAdmin: [] });
    mockSetCustomUserClaims.mockResolvedValue(undefined);

    await call(deleteAdminAuthorization, {
      admin: { userId: "u1" },
      adminHouseIds: ["h1"],
      superAdminHouseIds: ["h2"],
    });

    expect(mockDeleteClaim).toHaveBeenCalledTimes(2);
  });

  it("does not call deleteClaim when both arrays are empty", async () => {
    await call(deleteAdminAuthorization, {
      admin: { userId: "u1" },
      adminHouseIds: [],
      superAdminHouseIds: [],
    });

    expect(mockDeleteClaim).not.toHaveBeenCalled();
  });
});

describe("promoteGuestsToAdmin", () => {
  it("promotes guests to admin and sets claims", async () => {
    const guests = [{ userId: "u1", houseId: "h1", isAdmin: false }];
    const users = [{ uid: "u1" }];
    mockGetGuestsAsUsers.mockResolvedValue(users);
    mockCreateClaims.mockResolvedValue({ admin: ["h1"] });
    mockSetCustomUserClaims.mockResolvedValue(undefined);

    const result = await call(promoteGuestsToAdmin, guests);

    expect(mockGetGuestsAsUsers).toHaveBeenCalledWith(guests);
    expect(mockCreateClaims).toHaveBeenCalledWith("u1", ["h1"], "admin", false);
    expect(mockSetCustomUserClaims).toHaveBeenCalled();
    expect(result).toBe("success");
  });

  it("handles multiple guests", async () => {
    const guests = [
      { userId: "u1", houseId: "h1", isAdmin: false },
      { userId: "u2", houseId: "h2", isAdmin: false },
    ];
    const users = [{ uid: "u1" }, { uid: "u2" }];
    mockGetGuestsAsUsers.mockResolvedValue(users);
    mockCreateClaims.mockResolvedValue({});
    mockSetCustomUserClaims.mockResolvedValue(undefined);

    const result = await call(promoteGuestsToAdmin, guests);

    expect(mockCreateClaims).toHaveBeenCalledTimes(2);
    expect(result).toBe("success");
  });
});

describe("removePrivilegesForGuests", () => {
  it("removes privileges for guests and sets claims", async () => {
    const guests = [{ userId: "u1", houseId: "h1", isAdmin: false }];
    const users = [{ uid: "u1" }];
    mockGetGuestsAsUsers.mockResolvedValue(users);
    mockDeleteClaim.mockResolvedValue({});
    mockSetCustomUserClaims.mockResolvedValue(undefined);

    const result = await call(removePrivilegesForGuests, {
      guests,
      role: "guest",
    });

    expect(mockGetGuestsAsUsers).toHaveBeenCalledWith(guests);
    expect(mockDeleteClaim).toHaveBeenCalledWith("u1", ["h1"], "guest", false);
    expect(result).toBe("success");
  });
});

describe("verifyUserEmail", () => {
  it("calls _verifyUserEmail with userId", async () => {
    mockVerifyUserEmail.mockResolvedValue(undefined);
    await call(verifyUserEmail, { userId: "u1" });
    expect(mockVerifyUserEmail).toHaveBeenCalledWith("u1");
  });

  it("returns the result of _verifyUserEmail", async () => {
    mockVerifyUserEmail.mockResolvedValue("verified");
    const result = await call(verifyUserEmail, { userId: "u2" });
    expect(result).toBe("verified");
  });
});

describe("givePotentialSuperAdminPrivilege", () => {
  it("throws unauthenticated when no auth", async () => {
    await expect(
      call(givePotentialSuperAdminPrivilege, {}, null)
    ).rejects.toBeInstanceOf(HttpsError);
  });

  it("throws with unauthenticated code when no auth", async () => {
    try {
      await call(givePotentialSuperAdminPrivilege, {}, null);
    } catch (err) {
      expect((err as HttpsError).code).toBe("unauthenticated");
    }
  });

  it("creates claims with potentialSuperAdmin=true when authenticated", async () => {
    mockCreateClaims.mockResolvedValue({ potentialSuperAdmin: true });
    mockSetCustomUserClaims.mockResolvedValue(undefined);
    await call(givePotentialSuperAdminPrivilege, {}, { uid: "u1" });
    expect(mockCreateClaims).toHaveBeenCalledWith("u1", [], null, true);
    expect(mockSetCustomUserClaims).toHaveBeenCalledWith("u1", {
      potentialSuperAdmin: true,
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Input validation tests
// ──────────────────────────────────────────────────────────────────────────────

describe("addGuestAuthorization — input validation", () => {
  it("throws invalid-argument when userId is missing", async () => {
    await expect(
      call(addGuestAuthorization, { houseId: "h1" })
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("throws invalid-argument when houseId is missing", async () => {
    await expect(
      call(addGuestAuthorization, { userId: "u1" })
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });
});

describe("addAdminAuthorization — input validation", () => {
  it("throws invalid-argument when userId is missing", async () => {
    await expect(
      call(addAdminAuthorization, { houseIds: [], superAdmin: [] })
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("throws invalid-argument when houseIds is not an array", async () => {
    await expect(
      call(addAdminAuthorization, {
        userId: "u1",
        houseIds: "bad",
        superAdmin: [],
      })
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });
});

describe("deleteAdminAuthorization — input validation", () => {
  it("throws invalid-argument when admin.userId is missing", async () => {
    await expect(
      call(deleteAdminAuthorization, {
        admin: {},
        adminHouseIds: [],
        superAdminHouseIds: [],
      })
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });
});

describe("verifyUserEmail — input validation", () => {
  it("throws invalid-argument when userId is missing", async () => {
    await expect(call(verifyUserEmail, {})).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  it("throws invalid-argument when userId is empty string", async () => {
    await expect(call(verifyUserEmail, { userId: "" })).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });
});

describe("removePrivilegesForGuests — input validation", () => {
  it("throws invalid-argument when role is not a valid Role", async () => {
    const guests = [{ userId: "u1", houseId: "h1" }];
    await expect(
      call(removePrivilegesForGuests, { guests, role: "invalid-role" })
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });
});
