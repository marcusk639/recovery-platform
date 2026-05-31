// src/__tests__/callable/auth.test.ts

// Full manual mock — do NOT use jest.requireActual for firebase-functions/v2/https
// because that module pulls in native crypto bindings (buffer-equal-constant-time)
// that crash in Node test environments.
class HttpsError extends Error {
  code: string;
  details?: unknown;
  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = "HttpsError";
  }
}

jest.mock("firebase-functions/v2/https", () => ({
  onCall: (_opts: any, handler?: Function) =>
    typeof _opts === "function" ? _opts : handler,
  HttpsError,
}));

jest.mock("firebase-functions", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockCreateClaims = jest.fn();
const mockDeleteClaim = jest.fn();
const mockGetGuestsAsUsers = jest.fn();
const mockVerifyUserEmail = jest.fn();
const mockSetCustomUserClaims = jest.fn();
const mockAuthGetUser = jest.fn();
// Default house doc lookup used by authorization guard. Individual tests
// override the resolved value via mockResolvedValue / mockResolvedValueOnce.
const mockHouseGet = jest.fn();
// Mock for assertCanGrantClaimForHouses — individual tests override per scenario.
const mockAssertCanGrantClaimForHouses = jest.fn();

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

jest.mock("../../util/authGuard", () => ({
  assertCanGrantClaimForHouses: mockAssertCanGrantClaimForHouses,
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

const fakeAuth = { uid: "test-user", token: {} };
const call = (fn: unknown, data: unknown, auth: object | null = fakeAuth) =>
  (fn as Function)({ data, auth: auth ?? undefined });

beforeEach(() => jest.clearAllMocks());

// ──────────────────────────────────────────────────────────────────────────────
// addGuestAuthorization
// ──────────────────────────────────────────────────────────────────────────────

describe("addGuestAuthorization", () => {
  it("creates guest claims and sets them", async () => {
    mockAssertCanGrantClaimForHouses.mockResolvedValue(undefined);
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
      { uid: "u1", token: {} },
    );
    expect(mockCreateClaims).toHaveBeenCalledWith("u1", ["house-1"], "guest");
    expect(mockSetCustomUserClaims).toHaveBeenCalledWith("u1", fakeClaims);
    expect(result).toBe(true);
  });

  it("also creates admin claims when isAdmin is true", async () => {
    mockAssertCanGrantClaimForHouses.mockResolvedValue(undefined);
    mockCreateClaims.mockResolvedValue({});
    mockSetCustomUserClaims.mockResolvedValue(undefined);
    await call(
      addGuestAuthorization,
      {
        userId: "u1",
        houseId: "h1",
        isAdmin: true,
      },
      { uid: "u1", token: {} },
    );
    expect(mockCreateClaims).toHaveBeenCalledTimes(2);
    expect(mockCreateClaims).toHaveBeenNthCalledWith(1, "u1", ["h1"], "guest");
    expect(mockCreateClaims).toHaveBeenNthCalledWith(
      2,
      "u1",
      ["h1"],
      "admin",
      false,
    );
  });

  it("throws internal error when claims creation fails", async () => {
    mockAssertCanGrantClaimForHouses.mockResolvedValue(undefined);
    mockCreateClaims.mockRejectedValue(new Error("Firebase error"));
    await expect(
      call(
        addGuestAuthorization,
        {
          userId: "u1",
          houseId: "h1",
          isAdmin: false,
        },
        { uid: "u1", token: {} },
      ),
    ).rejects.toMatchObject({ code: "internal" });
  });
});

describe("addGuestAuthorization — authorization guard", () => {
  it("DENY caller granting themselves guest of a house they don't own", async () => {
    mockAssertCanGrantClaimForHouses.mockRejectedValue(
      new HttpsError("permission-denied", "Not authorized"),
    );
    await expect(
      call(
        addGuestAuthorization,
        { userId: "attacker-uid", houseId: "house-victim", isAdmin: false },
        { uid: "attacker-uid", token: {} },
      ),
    ).rejects.toMatchObject({ code: "permission-denied" });
    expect(mockSetCustomUserClaims).not.toHaveBeenCalled();
  });

  it("ALLOW owner of the house granting a new guest", async () => {
    mockAssertCanGrantClaimForHouses.mockResolvedValue(undefined);
    mockCreateClaims.mockResolvedValue({});
    mockSetCustomUserClaims.mockResolvedValue(undefined);
    const result = await call(
      addGuestAuthorization,
      { userId: "newguest-uid", houseId: "house-1", isAdmin: false },
      { uid: "owner-uid", token: {} },
    );
    expect(result).toBe(true);
  });

  it("ALLOW existing admin of the house granting a new guest", async () => {
    mockAssertCanGrantClaimForHouses.mockResolvedValue(undefined);
    mockCreateClaims.mockResolvedValue({});
    mockSetCustomUserClaims.mockResolvedValue(undefined);
    const result = await call(
      addGuestAuthorization,
      { userId: "newguest-uid", houseId: "house-1", isAdmin: false },
      { uid: "admin-uid", token: { admin: { "house-1": true } } },
    );
    expect(result).toBe(true);
  });

  it("DENY admin of a DIFFERENT house granting a guest", async () => {
    mockAssertCanGrantClaimForHouses.mockRejectedValue(
      new HttpsError("permission-denied", "Not authorized"),
    );
    await expect(
      call(
        addGuestAuthorization,
        { userId: "newguest-uid", houseId: "house-1", isAdmin: false },
        { uid: "admin-uid", token: { admin: { "house-OTHER": true } } },
      ),
    ).rejects.toMatchObject({ code: "permission-denied" });
    expect(mockSetCustomUserClaims).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// addAdminAuthorization
// ──────────────────────────────────────────────────────────────────────────────

describe("addAdminAuthorization", () => {
  it("creates admin and superAdmin claims and merges them", async () => {
    mockAssertCanGrantClaimForHouses.mockResolvedValue(undefined);
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
      { uid: "u1", token: {} },
    );

    expect(mockCreateClaims).toHaveBeenCalledTimes(2);
    expect(mockCreateClaims).toHaveBeenNthCalledWith(
      1,
      "u1",
      ["h1"],
      "admin",
      false,
    );
    expect(mockCreateClaims).toHaveBeenNthCalledWith(
      2,
      "u1",
      ["h2"],
      "superAdmin",
      false,
    );
    expect(mockSetCustomUserClaims).toHaveBeenCalledWith("u1", {
      ...adminClaims,
      ...superAdminClaims,
    });
    expect(result).toBe(true);
  });

  it("throws internal error when claims creation fails", async () => {
    mockAssertCanGrantClaimForHouses.mockResolvedValue(undefined);
    mockCreateClaims.mockRejectedValue(new Error("Firebase error"));
    await expect(
      call(
        addAdminAuthorization,
        {
          userId: "u1",
          houseIds: ["h1"],
          superAdmin: [],
        },
        { uid: "u1", token: {} },
      ),
    ).rejects.toMatchObject({ code: "internal" });
  });
});

describe("addAdminAuthorization — authorization guard", () => {
  it("DENY caller granting themselves admin of a house they don't own", async () => {
    mockAssertCanGrantClaimForHouses.mockRejectedValue(
      new HttpsError("permission-denied", "Not authorized"),
    );
    await expect(
      call(
        addAdminAuthorization,
        {
          userId: "attacker-uid",
          houseIds: ["house-victim"],
          superAdmin: [],
        },
        { uid: "attacker-uid", token: {} },
      ),
    ).rejects.toMatchObject({ code: "permission-denied" });
    expect(mockSetCustomUserClaims).not.toHaveBeenCalled();
  });

  it("DENY caller granting another user admin of a house the caller doesn't admin", async () => {
    mockAssertCanGrantClaimForHouses.mockRejectedValue(
      new HttpsError("permission-denied", "Not authorized"),
    );
    await expect(
      call(
        addAdminAuthorization,
        {
          userId: "target-uid",
          houseIds: ["house-victim"],
          superAdmin: [],
        },
        { uid: "attacker-uid", token: {} },
      ),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("ALLOW owner granting themselves admin of their own house (setup-wizard)", async () => {
    mockAssertCanGrantClaimForHouses.mockResolvedValue(undefined);
    mockCreateClaims.mockResolvedValue({});
    mockSetCustomUserClaims.mockResolvedValue(undefined);
    const result = await call(
      addAdminAuthorization,
      { userId: "owner-uid", houseIds: ["house-1"], superAdmin: [] },
      { uid: "owner-uid", token: {} },
    );
    expect(result).toBe(true);
  });

  it("ALLOW existing admin granting another user admin (delegation)", async () => {
    mockAssertCanGrantClaimForHouses.mockResolvedValue(undefined);
    mockCreateClaims.mockResolvedValue({});
    mockSetCustomUserClaims.mockResolvedValue(undefined);
    const result = await call(
      addAdminAuthorization,
      { userId: "newadmin-uid", houseIds: ["house-1"], superAdmin: [] },
      { uid: "existing-admin-uid", token: { admin: { "house-1": true } } },
    );
    expect(result).toBe(true);
  });

  it("DENY existing admin self-granting admin of the SAME house (no-op attempt)", async () => {
    mockAssertCanGrantClaimForHouses.mockRejectedValue(
      new HttpsError("permission-denied", "Not authorized"),
    );
    await expect(
      call(
        addAdminAuthorization,
        {
          userId: "existing-admin-uid",
          houseIds: ["house-1"],
          superAdmin: [],
        },
        { uid: "existing-admin-uid", token: { admin: { "house-1": true } } },
      ),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("DENY empty payload (both houseIds and superAdmin empty)", async () => {
    await expect(
      call(
        addAdminAuthorization,
        { userId: "anyone", houseIds: [], superAdmin: [] },
        { uid: "anyone", token: {} },
      ),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// deleteAdminAuthorization
// ──────────────────────────────────────────────────────────────────────────────

describe("deleteAdminAuthorization", () => {
  it("deletes admin claims for provided houseIds", async () => {
    mockAssertCanGrantClaimForHouses.mockResolvedValue(undefined);
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
    mockAssertCanGrantClaimForHouses.mockResolvedValue(undefined);
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
    mockAssertCanGrantClaimForHouses.mockResolvedValue(undefined);
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
    await expect(
      call(deleteAdminAuthorization, {
        admin: { userId: "u1" },
        adminHouseIds: [],
        superAdminHouseIds: [],
      }),
    ).rejects.toMatchObject({ code: "invalid-argument" });

    expect(mockDeleteClaim).not.toHaveBeenCalled();
  });
});

// ── Security: C1 — deleteAdminAuthorization authorization guard ───────────────

describe("deleteAdminAuthorization — authorization guard (C1)", () => {
  it("DENY non-admin caller — gets permission-denied", async () => {
    mockAssertCanGrantClaimForHouses.mockRejectedValue(
      new HttpsError("permission-denied", "Not authorized"),
    );
    await expect(
      call(
        deleteAdminAuthorization,
        {
          admin: { userId: "target-uid" },
          adminHouseIds: ["house-1"],
          superAdminHouseIds: [],
        },
        { uid: "attacker-uid", token: {} },
      ),
    ).rejects.toMatchObject({ code: "permission-denied" });
    expect(mockDeleteClaim).not.toHaveBeenCalled();
    expect(mockSetCustomUserClaims).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// promoteGuestsToAdmin
// ──────────────────────────────────────────────────────────────────────────────

describe("promoteGuestsToAdmin", () => {
  it("promotes guests to admin and sets claims", async () => {
    mockAssertCanGrantClaimForHouses.mockResolvedValue(undefined);
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
    mockAssertCanGrantClaimForHouses.mockResolvedValue(undefined);
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

// ── Security: C2 — promoteGuestsToAdmin authorization guard ──────────────────

describe("promoteGuestsToAdmin — authorization guard (C2)", () => {
  it("DENY non-admin caller — gets permission-denied", async () => {
    mockAssertCanGrantClaimForHouses.mockRejectedValue(
      new HttpsError("permission-denied", "Not authorized"),
    );
    const guests = [{ userId: "target-uid", houseId: "house-1" }];
    await expect(
      call(promoteGuestsToAdmin, guests, { uid: "attacker-uid", token: {} }),
    ).rejects.toMatchObject({ code: "permission-denied" });
    expect(mockGetGuestsAsUsers).not.toHaveBeenCalled();
    expect(mockSetCustomUserClaims).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// removePrivilegesForGuests
// ──────────────────────────────────────────────────────────────────────────────

describe("removePrivilegesForGuests", () => {
  it("removes privileges for guests and sets claims", async () => {
    mockAssertCanGrantClaimForHouses.mockResolvedValue(undefined);
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

// ── Security: C3 — removePrivilegesForGuests authorization guard ──────────────

describe("removePrivilegesForGuests — authorization guard (C3)", () => {
  it("DENY non-admin caller — gets permission-denied", async () => {
    mockAssertCanGrantClaimForHouses.mockRejectedValue(
      new HttpsError("permission-denied", "Not authorized"),
    );
    const guests = [{ userId: "target-uid", houseId: "house-1" }];
    await expect(
      call(
        removePrivilegesForGuests,
        { guests, role: "guest" },
        { uid: "attacker-uid", token: {} },
      ),
    ).rejects.toMatchObject({ code: "permission-denied" });
    expect(mockGetGuestsAsUsers).not.toHaveBeenCalled();
    expect(mockSetCustomUserClaims).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// verifyUserEmail
// ──────────────────────────────────────────────────────────────────────────────

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

// ──────────────────────────────────────────────────────────────────────────────
// givePotentialSuperAdminPrivilege
// ──────────────────────────────────────────────────────────────────────────────

describe("givePotentialSuperAdminPrivilege", () => {
  it("throws unauthenticated when no auth", async () => {
    await expect(
      call(givePotentialSuperAdminPrivilege, {}, null),
    ).rejects.toBeInstanceOf(HttpsError);
  });

  it("throws with unauthenticated code when no auth", async () => {
    try {
      await call(givePotentialSuperAdminPrivilege, {}, null);
    } catch (err) {
      expect((err as HttpsError).code).toBe("unauthenticated");
    }
  });

  it("sets potentialSuperAdmin=true when user has no existing claims", async () => {
    mockAuthGetUser.mockResolvedValue({ customClaims: {} });
    mockSetCustomUserClaims.mockResolvedValue(undefined);
    await call(givePotentialSuperAdminPrivilege, {}, { uid: "u1", token: {} });
    expect(mockAuthGetUser).toHaveBeenCalledWith("u1");
    expect(mockSetCustomUserClaims).toHaveBeenCalledWith("u1", {
      potentialSuperAdmin: true,
    });
  });
});

// ── Security: C4 — givePotentialSuperAdminPrivilege escalation guard ──────────

describe("givePotentialSuperAdminPrivilege — escalation guard (C4)", () => {
  it("DENY user with existing admin claims — gets permission-denied", async () => {
    await expect(
      call(
        givePotentialSuperAdminPrivilege,
        {},
        { uid: "u1", token: { admin: { "house-1": true } } },
      ),
    ).rejects.toMatchObject({ code: "permission-denied" });
    expect(mockSetCustomUserClaims).not.toHaveBeenCalled();
  });

  it("DENY user with existing superAdmin claims — gets permission-denied", async () => {
    await expect(
      call(
        givePotentialSuperAdminPrivilege,
        {},
        { uid: "u1", token: { superAdmin: { "house-1": true } } },
      ),
    ).rejects.toMatchObject({ code: "permission-denied" });
    expect(mockSetCustomUserClaims).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Input validation tests
// ──────────────────────────────────────────────────────────────────────────────

describe("addGuestAuthorization — input validation", () => {
  it("throws invalid-argument when userId is missing", async () => {
    await expect(
      call(addGuestAuthorization, { houseId: "h1" }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("throws invalid-argument when houseId is missing", async () => {
    await expect(
      call(addGuestAuthorization, { userId: "u1" }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });
});

describe("addAdminAuthorization — input validation", () => {
  it("throws invalid-argument when userId is missing", async () => {
    await expect(
      call(addAdminAuthorization, { houseIds: [], superAdmin: [] }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("throws invalid-argument when houseIds is not an array", async () => {
    await expect(
      call(addAdminAuthorization, {
        userId: "u1",
        houseIds: "bad",
        superAdmin: [],
      }),
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
      }),
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
      call(removePrivilegesForGuests, { guests, role: "invalid-role" }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });
});
