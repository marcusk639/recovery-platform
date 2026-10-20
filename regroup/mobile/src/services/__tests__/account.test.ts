const calls: string[] = [];
const mockCallable = jest.fn();
const mockReauth = jest.fn();
const mockGetIdToken = jest.fn();
const mockSignOut = jest.fn();
const mockCredential = jest.fn();

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
    },
    signOut: () => mockSignOut(),
  },
  functions: { httpsCallable: (name: string) => () => mockCallable(name) },
}));

import { deleteMyAccount } from "../account";

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
  });
});
