const calls: string[] = [];
const mockCallable = jest.fn();
const mockReauth = jest.fn();
const mockGetIdToken = jest.fn();
const mockSignOut = jest.fn();
const mockCredential = jest.fn();
const mockReload = jest.fn();
const mockLogException = jest.fn();

jest.mock("@react-native-firebase/auth", () => ({
  __esModule: true,
  default: {
    EmailAuthProvider: { credential: (...a: any[]) => mockCredential(...a) },
  },
}));
jest.mock("../../../firebase-setup", () => ({
  auth: {
    currentUser: {
      email: "a@b.com",
      reauthenticateWithCredential: (...a: any[]) => mockReauth(...a),
      getIdToken: (...a: any[]) => mockGetIdToken(...a),
      reload: () => mockReload(),
    },
    signOut: () => mockSignOut(),
  },
  functions: { httpsCallable: (name: string) => () => mockCallable(name) },
}));

jest.mock("../../util/logging", () => ({
  logException: (...a: any[]) => mockLogException(...a),
}));

import { deleteMyAccount, DELETION_UNCONFIRMED_CODE } from "../account";

describe("deleteMyAccount", () => {
  beforeEach(() => {
    calls.length = 0;
    jest.clearAllMocks();
    mockCredential.mockReturnValue("cred");
    mockReauth.mockImplementation(async () => void calls.push("reauth"));
    mockGetIdToken.mockImplementation(async () => void calls.push("token"));
    mockCallable.mockImplementation(async (n: string) => {
      calls.push("call:" + n);
      return { data: { deleted: true } };
    });
    mockSignOut.mockImplementation(async () => void calls.push("signOut"));
    mockReload.mockImplementation(async () => void calls.push("reload"));
  });

  it("re-authenticates, refreshes the token, calls deleteAccount, then signs out", async () => {
    await deleteMyAccount("pw");
    expect(mockCredential).toHaveBeenCalledWith("a@b.com", "pw");
    expect(mockReauth).toHaveBeenCalledWith("cred");
    expect(mockGetIdToken).toHaveBeenCalledWith(true);
    expect(calls).toEqual(["reauth", "token", "call:deleteAccount", "signOut"]);
  });

  it("rejects without calling anything when there is no email", async () => {
    const { auth } = require("../../../firebase-setup");
    const saved = auth.currentUser.email;
    auth.currentUser.email = null;
    try {
      await expect(deleteMyAccount("pw")).rejects.toThrow("No signed-in user");
    } finally {
      auth.currentUser.email = saved;
    }
    expect(mockReauth).not.toHaveBeenCalled();
    expect(mockCallable).not.toHaveBeenCalled();
  });

  it("does not call deleteAccount when re-authentication fails", async () => {
    mockReauth.mockRejectedValue({ code: "auth/wrong-password" });
    await expect(deleteMyAccount("bad")).rejects.toEqual({
      code: "auth/wrong-password",
    });
    expect(mockCallable).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockReload).not.toHaveBeenCalled();
  });

  it.each(["auth/user-not-found", "auth/invalid-credential", "auth/user-token-expired"])(
    "treats a %s re-auth failure as deleted when the account is gone",
    async (code) => {
      mockReauth.mockRejectedValue({ code });
      mockReload.mockRejectedValue({ code: "auth/user-not-found" });
      await expect(deleteMyAccount("pw")).resolves.toBeUndefined();
      expect(mockCallable).not.toHaveBeenCalled();
      expect(mockSignOut).toHaveBeenCalledTimes(1);
    }
  );

  it("still rejects auth/invalid-credential when the account exists (wrong password)", async () => {
    mockReauth.mockRejectedValue({ code: "auth/invalid-credential" });
    await expect(deleteMyAccount("bad")).rejects.toEqual({
      code: "auth/invalid-credential",
    });
    expect(mockReload).toHaveBeenCalledTimes(1);
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("rejects the original re-auth error when the existence check fails for another reason", async () => {
    mockReauth.mockRejectedValue({ code: "auth/user-not-found" });
    mockReload.mockRejectedValue({ code: "auth/network-request-failed" });
    await expect(deleteMyAccount("pw")).rejects.toEqual({ code: "auth/user-not-found" });
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("treats a callable error as success when the account is already gone", async () => {
    mockCallable.mockRejectedValue({ code: "functions/deadline-exceeded" });
    mockReload.mockRejectedValue({ code: "auth/user-not-found" });
    await expect(deleteMyAccount("pw")).resolves.toBeUndefined();
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it.each(["auth/user-token-expired", "auth/user-disabled"])(
    "does not report success after a callable error when reload says %s",
    async (code) => {
      mockCallable.mockRejectedValue({ code: "functions/deadline-exceeded" });
      mockReload.mockRejectedValue({ code });
      await expect(deleteMyAccount("pw")).rejects.toMatchObject({
        code: DELETION_UNCONFIRMED_CODE,
        message: "We couldn't confirm your account was deleted. Sign in again to check.",
      });
      expect(mockSignOut).toHaveBeenCalledTimes(1);
    }
  );

  it.each(["auth/user-disabled", "auth/user-token-expired"])(
    "does not report success when re-auth fails with %s and the account can't be confirmed gone",
    async (code) => {
      mockReauth.mockRejectedValue({ code });
      mockReload.mockRejectedValue({ code });
      await expect(deleteMyAccount("pw")).rejects.toThrow(
        "We couldn't confirm your account was deleted. Sign in again to check."
      );
      expect(mockCallable).not.toHaveBeenCalled();
      expect(mockSignOut).toHaveBeenCalledTimes(1);
    }
  );

  it("still rejects unconfirmed when sign-out also fails", async () => {
    mockCallable.mockRejectedValue({ code: "functions/internal" });
    mockReload.mockRejectedValue({ code: "auth/user-token-expired" });
    mockSignOut.mockRejectedValue(new Error("signout"));
    await expect(deleteMyAccount("pw")).rejects.toMatchObject({
      code: DELETION_UNCONFIRMED_CODE,
    });
  });

  it("rejects a callable error when the account still exists", async () => {
    mockCallable.mockRejectedValue({ code: "functions/internal" });
    await expect(deleteMyAccount("pw")).rejects.toEqual({ code: "functions/internal" });
    expect(calls).toEqual(["reauth", "token", "reload"]);
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("resolves and logs when sign-out fails after a successful deletion", async () => {
    const err = new Error("signout");
    mockSignOut.mockRejectedValue(err);
    await expect(deleteMyAccount("pw")).resolves.toBeUndefined();
    expect(mockLogException).toHaveBeenCalledWith(err, "Sign-out failed after account deletion");
  });
});
