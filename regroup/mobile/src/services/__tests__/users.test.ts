// src/services/__tests__/users.test.ts
//
// Unit tests for the users service (src/services/users.tsx).
//
// users.tsx imports from firebase-setup (auto-mocked via moduleNameMapper),
// @react-native-firebase/auth (mocked in jest.setup.js), lodash, and several
// sibling services. All sibling services are mocked below so native code is
// never reached.

// ─── Mocks (hoisted before imports) ─────────────────────────────────────────

jest.mock("../crud", () => ({
  get: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  deleteObject: jest.fn(),
  getByAttribute: jest.fn(),
  createId: jest.fn(() => "generated-id"),
}));

jest.mock("../house", () => ({
  houseCollection: { doc: jest.fn(() => ({ id: "house-doc-id" })) },
  updateHouseAwaitingVerification: jest.fn(),
}));

jest.mock("../guest", () => ({
  guestCollection: {
    doc: jest.fn(() => ({
      id: "guest-doc-id",
      update: jest.fn(() => Promise.resolve()),
    })),
  },
  createGuestId: jest.fn(() => "mock-guest-id"),
}));

jest.mock("../admin", () => ({
  adminCollection: {
    doc: jest.fn(() => ({
      id: "admin-doc-id",
      update: jest.fn(() => Promise.resolve()),
    })),
  },
}));

jest.mock("../storage", () => ({
  uploadUserAvatar: jest.fn(),
}));

jest.mock("../../util/logging", () => ({
  logException: jest.fn(),
}));

jest.mock("../../util/user", () => ({
  getFirebaseUserFromUserCredential: jest.fn((credential: any) => credential),
}));

// ─── Imports (after mocks) ───────────────────────────────────────────────────

import { firestore } from "../../../firebase-setup";
import * as crud from "../crud";
import * as houseService from "../house";
import { uploadUserAvatar } from "../storage";
import { getFirebaseUserFromUserCredential } from "../../util/user";
import {
  getUser,
  createAnonUser,
  updateUser,
  convertFirebaseUserToRatsUser,
  getHouseOwner,
  updateOptionalInfo,
  requestAccountVerification,
  createUserWithEmail,
  signInWithEmail,
  signOut,
  sendForgotPasswordEmail,
  anonymouslyLogin,
  userCollection,
} from "../users";
import { User } from "../../entities/User";
import auth from "@react-native-firebase/auth";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeUser = (overrides: Partial<User> = {}): User =>
  ({
    id: "u1",
    uid: "u1",
    email: "test@example.com",
    firstName: "John",
    lastName: "Doe",
    isAdmin: false,
    isManager: false,
    isGuest: false,
    isAnonymous: false,
    houseAccountVerified: false,
    houseCode: "",
    emailVerified: true,
    phoneNumber: "",
    avatar: "",
    ...overrides,
  } as unknown as User);

const makeFirebaseUserCredential = (overrides: any = {}): any => ({
  user: {
    uid: "firebase-uid-1",
    email: "test@example.com",
    phoneNumber: "",
    isAnonymous: false,
    ...overrides,
  },
});

/** Retrieves the mock auth instance returned by the auth() call */
const getMockAuth = () => (auth as unknown as jest.Mock)();

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("users service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── getUser ───────────────────────────────────────────────────────────────

  describe("getUser", () => {
    it("delegates to crud.get and returns the user", async () => {
      const user = makeUser();
      (crud.get as jest.Mock).mockResolvedValue(user);

      const result = await getUser("u1");

      expect(crud.get).toHaveBeenCalledTimes(1);
      expect(crud.get).toHaveBeenCalledWith(expect.anything(), "u1");
      expect(result.id).toBe("u1");
    });

    it("propagates errors from crud.get", async () => {
      (crud.get as jest.Mock).mockRejectedValue(new Error("Read failed"));

      await expect(getUser("u1")).rejects.toThrow("Read failed");
    });
  });

  // ── createAnonUser ────────────────────────────────────────────────────────

  describe("createAnonUser", () => {
    it("calls crud.create with the user collection, the user object, and user.uid", async () => {
      const user = makeUser({ uid: "anon-uid-1" });
      (crud.create as jest.Mock).mockResolvedValue(user);

      await createAnonUser(user);

      expect(crud.create).toHaveBeenCalledTimes(1);
      expect(crud.create).toHaveBeenCalledWith(
        expect.anything(),
        user,
        "anon-uid-1"
      );
    });

    it("returns the result from crud.create", async () => {
      const user = makeUser({ uid: "anon-uid-1" });
      (crud.create as jest.Mock).mockResolvedValue(user);

      const result = await createAnonUser(user);

      expect(result).toEqual(user);
    });

    it("propagates errors from crud.create", async () => {
      const user = makeUser();
      (crud.create as jest.Mock).mockRejectedValue(new Error("Create failed"));

      await expect(createAnonUser(user)).rejects.toThrow("Create failed");
    });
  });

  // ── updateUser ────────────────────────────────────────────────────────────

  describe("updateUser", () => {
    it("calls crud.update with merged values", async () => {
      const user = makeUser({ id: "u1" });
      (crud.update as jest.Mock).mockResolvedValue(undefined);

      await updateUser(user, { firstName: "Jane" });

      expect(crud.update).toHaveBeenCalledTimes(1);
      expect(crud.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: "u1", firstName: "Jane" })
      );
    });

    it("returns the merged user object", async () => {
      const user = makeUser({ id: "u1", firstName: "John" });
      (crud.update as jest.Mock).mockResolvedValue(undefined);

      const result = await updateUser(user, { firstName: "Jane" });

      expect(result.firstName).toBe("Jane");
    });

    it("propagates errors from crud.update", async () => {
      const user = makeUser();
      (crud.update as jest.Mock).mockRejectedValue(new Error("Update error"));

      await expect(updateUser(user, { firstName: "Jane" })).rejects.toThrow(
        "Update error"
      );
    });
  });

  // ── convertFirebaseUserToRatsUser ─────────────────────────────────────────

  describe("convertFirebaseUserToRatsUser", () => {
    it("maps the Firebase uid to the new user", () => {
      const partial: Partial<User> = { email: "test@example.com" };
      const credential = makeFirebaseUserCredential({ uid: "fb-uid-123" });

      const result = convertFirebaseUserToRatsUser(partial, credential);

      expect(result.uid).toBe("fb-uid-123");
    });

    it("uses the Firebase email when available", () => {
      const partial: Partial<User> = {};
      const credential = makeFirebaseUserCredential({
        email: "firebase@example.com",
      });

      const result = convertFirebaseUserToRatsUser(partial, credential);

      expect(result.email).toBe("firebase@example.com");
    });

    it("falls back to partial.email when Firebase email is null", () => {
      const partial: Partial<User> = { email: "partial@example.com" };
      const credential = makeFirebaseUserCredential({ email: null });

      const result = convertFirebaseUserToRatsUser(partial, credential);

      expect(result.email).toBe("partial@example.com");
    });

    it("clears the password field on the partial before mapping", () => {
      const partial: Partial<User> = {
        email: "test@example.com",
        password: "secret",
      };
      const credential = makeFirebaseUserCredential();

      const result = convertFirebaseUserToRatsUser(partial, credential);

      expect(result.password).toBeUndefined();
    });

    it("sets isAdmin to false", () => {
      const result = convertFirebaseUserToRatsUser(
        {},
        makeFirebaseUserCredential()
      );
      expect(result.isAdmin).toBe(false);
    });

    it("sets isManager to false", () => {
      const result = convertFirebaseUserToRatsUser(
        {},
        makeFirebaseUserCredential()
      );
      expect((result as any).isManager).toBe(false);
    });

    it("sets houseAccountVerified to false", () => {
      const result = convertFirebaseUserToRatsUser(
        {},
        makeFirebaseUserCredential()
      );
      expect(result.houseAccountVerified).toBe(false);
    });

    it("sets emailVerified to true (email verification disabled)", () => {
      const result = convertFirebaseUserToRatsUser(
        {},
        makeFirebaseUserCredential()
      );
      expect(result.emailVerified).toBe(true);
    });

    it("copies the isAnonymous flag from the Firebase user", () => {
      const result = convertFirebaseUserToRatsUser(
        {},
        makeFirebaseUserCredential({ isAnonymous: true })
      );
      expect(result.isAnonymous).toBe(true);
    });

    it("uses Firebase phoneNumber when available", () => {
      const result = convertFirebaseUserToRatsUser(
        {},
        makeFirebaseUserCredential({ phoneNumber: "+15551234567" })
      );
      expect(result.phoneNumber).toBe("+15551234567");
    });

    it("falls back to partial.phoneNumber when Firebase phoneNumber is null", () => {
      const result = convertFirebaseUserToRatsUser(
        { phoneNumber: "+15559876543" },
        makeFirebaseUserCredential({ phoneNumber: null })
      );
      expect(result.phoneNumber).toBe("+15559876543");
    });
  });

  // ── getHouseOwner ─────────────────────────────────────────────────────────

  describe("getHouseOwner", () => {
    // `userCollection` is the module-level CollectionReference created once at
    // import time via `firestore.collection('users')`. It is exported by
    // users.tsx so we can import it and manipulate its mock methods directly.
    // The global mock's `.where()` returns `this`, so `.where().get()` resolves
    // through the collection's own `.get` mock — we override it per test.

    it("returns the user whose housesOwned contains the given houseId", async () => {
      const mockUser = makeUser({ uid: "owner-1", email: "owner@example.com" });
      (userCollection as any).get = jest
        .fn()
        .mockResolvedValue({ docs: [{ data: () => mockUser }] });

      const result = await getHouseOwner("house-1");

      expect(result).toBeDefined();
      expect(result!.uid).toBe("owner-1");
    });

    it("uses where with array-contains on housesOwned", async () => {
      const mockUser = makeUser({ uid: "owner-2" });
      (userCollection as any).get = jest
        .fn()
        .mockResolvedValue({ docs: [{ data: () => mockUser }] });

      await getHouseOwner("house-42");

      expect((userCollection as any).where).toHaveBeenCalledWith(
        "housesOwned",
        "array-contains",
        "house-42"
      );
    });

    it("propagates Firestore errors from the query", async () => {
      (userCollection as any).get = jest
        .fn()
        .mockRejectedValue(new Error("Firestore query failed"));

      await expect(getHouseOwner("house-1")).rejects.toThrow(
        "Firestore query failed"
      );
    });
  });

  // ── updateOptionalInfo ────────────────────────────────────────────────────

  describe("updateOptionalInfo", () => {
    const makeBatch = () => ({
      set: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      commit: jest.fn(() => Promise.resolve()),
    });

    it("calls batch.commit to persist changes", async () => {
      const mockBatch = makeBatch();
      (firestore.batch as jest.Mock).mockReturnValue(mockBatch);

      const user = makeUser({ uid: "u1", avatar: "" });

      await updateOptionalInfo(user, null as any, null as any);

      expect(mockBatch.commit).toHaveBeenCalledTimes(1);
    });

    it("calls batch.update for the user document", async () => {
      const mockBatch = makeBatch();
      (firestore.batch as jest.Mock).mockReturnValue(mockBatch);

      const user = makeUser({ uid: "u1", avatar: "" });

      await updateOptionalInfo(user, null as any, null as any);

      expect(mockBatch.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ uid: "u1" })
      );
    });

    it("uploads avatar and replaces user.avatar with the download URL when user.avatar is set", async () => {
      const mockBatch = makeBatch();
      (firestore.batch as jest.Mock).mockReturnValue(mockBatch);

      const mockTaskSnapshot = { metadata: { fullPath: "users/u1/avatar" } };
      (uploadUserAvatar as jest.Mock).mockResolvedValue(mockTaskSnapshot);

      // storage().ref().getDownloadURL is mocked in jest.setup.js to return 'mock-url'
      const user = makeUser({ uid: "u1", avatar: "/local/path/avatar.jpg" });

      await updateOptionalInfo(user, null as any, null as any);

      expect(uploadUserAvatar).toHaveBeenCalledWith(
        "/local/path/avatar.jpg",
        "u1"
      );
    });

    it("catches avatar upload errors and continues to batch.commit", async () => {
      const mockBatch = makeBatch();
      (firestore.batch as jest.Mock).mockReturnValue(mockBatch);
      (uploadUserAvatar as jest.Mock).mockRejectedValue(
        new Error("Upload failed")
      );

      const user = makeUser({ uid: "u1", avatar: "/some/avatar.jpg" });

      // Should not throw — errors are caught internally via logException
      await expect(
        updateOptionalInfo(user, null as any, null as any)
      ).resolves.toBeUndefined();

      // batch.commit still called
      expect(mockBatch.commit).toHaveBeenCalledTimes(1);
    });

    it("also updates the guest document when guest is provided", async () => {
      const mockBatch = makeBatch();
      (firestore.batch as jest.Mock).mockReturnValue(mockBatch);

      const user = makeUser({ uid: "u1", avatar: "" });
      const guest: any = { id: "g1", avatar: "" };

      await updateOptionalInfo(user, guest, null as any);

      // batch.update should be called at least twice: once for user, once for guest
      expect(mockBatch.update).toHaveBeenCalledTimes(2);
    });

    it("also updates the admin document when admin is provided", async () => {
      const mockBatch = makeBatch();
      (firestore.batch as jest.Mock).mockReturnValue(mockBatch);

      const user = makeUser({ uid: "u1", avatar: "" });
      const admin: any = { id: "a1", avatar: "" };

      await updateOptionalInfo(user, null as any, admin);

      // batch.update should be called at least twice: once for user, once for admin
      expect(mockBatch.update).toHaveBeenCalledTimes(2);
    });

    it("propagates batch.commit errors", async () => {
      const mockBatch = makeBatch();
      mockBatch.commit.mockRejectedValue(new Error("Batch commit failed"));
      (firestore.batch as jest.Mock).mockReturnValue(mockBatch);

      const user = makeUser({ uid: "u1", avatar: "" });

      await expect(
        updateOptionalInfo(user, null as any, null as any)
      ).rejects.toThrow("Batch commit failed");
    });
  });

  // ── requestAccountVerification ────────────────────────────────────────────

  describe("requestAccountVerification", () => {
    it("delegates to houseService.updateHouseAwaitingVerification", async () => {
      (
        houseService.updateHouseAwaitingVerification as jest.Mock
      ).mockResolvedValue(undefined);

      await requestAccountVerification("HOUSE01", "Jane", "Doe", "u1");

      expect(houseService.updateHouseAwaitingVerification).toHaveBeenCalledWith(
        "HOUSE01",
        { firstName: "Jane", lastName: "Doe", userId: "u1" }
      );
    });

    it("propagates errors from updateHouseAwaitingVerification", async () => {
      (
        houseService.updateHouseAwaitingVerification as jest.Mock
      ).mockRejectedValue(new Error("Invalid house code"));

      await expect(
        requestAccountVerification("BADCODE", "Jane", "Doe", "u1")
      ).rejects.toThrow("Invalid house code");
    });
  });

  // ── Auth delegation functions ─────────────────────────────────────────────

  describe("createUserWithEmail", () => {
    it("calls auth().createUserWithEmailAndPassword with email and password", async () => {
      const credential = makeFirebaseUserCredential();
      getMockAuth().createUserWithEmailAndPassword.mockResolvedValue(
        credential
      );

      const result = await createUserWithEmail(
        "test@example.com",
        "password123"
      );

      expect(getMockAuth().createUserWithEmailAndPassword).toHaveBeenCalledWith(
        "test@example.com",
        "password123"
      );
      expect(result).toEqual(credential);
    });

    it("propagates auth errors", async () => {
      getMockAuth().createUserWithEmailAndPassword.mockRejectedValue(
        new Error("Email already in use")
      );

      await expect(
        createUserWithEmail("taken@example.com", "password123")
      ).rejects.toThrow("Email already in use");
    });
  });

  describe("signInWithEmail", () => {
    it("calls auth().signInWithEmailAndPassword with email and password", async () => {
      const credential = makeFirebaseUserCredential();
      getMockAuth().signInWithEmailAndPassword.mockResolvedValue(credential);

      const result = await signInWithEmail("test@example.com", "password123");

      expect(getMockAuth().signInWithEmailAndPassword).toHaveBeenCalledWith(
        "test@example.com",
        "password123"
      );
      expect(result).toEqual(credential);
    });

    it("propagates auth errors", async () => {
      getMockAuth().signInWithEmailAndPassword.mockRejectedValue(
        new Error("Wrong password")
      );

      await expect(
        signInWithEmail("test@example.com", "wrongpass")
      ).rejects.toThrow("Wrong password");
    });

    // Hardened 2026-07-04 added client-side rate limiting, email validation,
    // and sanitization directly to this live sign-in path — previously
    // untested (only pass-through/error-propagation were covered above).
    // Each test below uses its own unique email: SimpleValidationService's
    // rate-limit counter is a module-level Map keyed by "signin_{email}"
    // that persists for the lifetime of this test file, so reusing an email
    // across tests would let earlier calls silently count toward a later
    // test's limit.
    it("blocks the 6th sign-in attempt within the rate-limit window (5 attempts / 60s)", async () => {
      getMockAuth().signInWithEmailAndPassword.mockResolvedValue(
        makeFirebaseUserCredential()
      );
      const email = "ratelimit-signin-1@example.com";

      for (let i = 0; i < 5; i++) {
        await signInWithEmail(email, "password123");
      }

      await expect(signInWithEmail(email, "password123")).rejects.toMatchObject(
        { code: "auth/too-many-requests" }
      );
      // The 6th call must be rejected before ever reaching Firebase.
      expect(getMockAuth().signInWithEmailAndPassword).toHaveBeenCalledTimes(5);
    });

    it("rejects a malformed email before calling Firebase", async () => {
      await expect(
        signInWithEmail("not-an-email", "password123")
      ).rejects.toMatchObject({ code: "auth/invalid-email" });
      expect(getMockAuth().signInWithEmailAndPassword).not.toHaveBeenCalled();
    });

    it("rejects a missing password before calling Firebase", async () => {
      await expect(
        signInWithEmail("ratelimit-signin-2@example.com", "")
      ).rejects.toThrow("Password is required.");
      expect(getMockAuth().signInWithEmailAndPassword).not.toHaveBeenCalled();
    });

    it("sanitizes the email before passing it to Firebase", async () => {
      getMockAuth().signInWithEmailAndPassword.mockResolvedValue(
        makeFirebaseUserCredential()
      );

      // Passes validateEmail's regex (no whitespace/@ conflicts) but
      // contains characters sanitizeString strips.
      await signInWithEmail(
        "<script>ratelimit-signin-3@example.com",
        "password123"
      );

      expect(getMockAuth().signInWithEmailAndPassword).toHaveBeenCalledWith(
        "scriptratelimit-signin-3@example.com",
        "password123"
      );
    });
  });

  describe("anonymouslyLogin", () => {
    it("calls auth().signInAnonymously", async () => {
      const credential = makeFirebaseUserCredential({ isAnonymous: true });
      getMockAuth().signInAnonymously = jest.fn().mockResolvedValue(credential);

      const result = await anonymouslyLogin();

      expect(getMockAuth().signInAnonymously).toHaveBeenCalledTimes(1);
      expect(result).toEqual(credential);
    });

    it("propagates auth errors", async () => {
      getMockAuth().signInAnonymously = jest
        .fn()
        .mockRejectedValue(new Error("Anonymous sign-in failed"));

      await expect(anonymouslyLogin()).rejects.toThrow(
        "Anonymous sign-in failed"
      );
    });
  });

  describe("signOut", () => {
    it("calls auth().signOut", async () => {
      getMockAuth().signOut.mockResolvedValue(undefined);

      await signOut();

      expect(getMockAuth().signOut).toHaveBeenCalledTimes(1);
    });

    it("propagates auth errors", async () => {
      getMockAuth().signOut.mockRejectedValue(new Error("Sign out failed"));

      await expect(signOut()).rejects.toThrow("Sign out failed");
    });
  });

  describe("sendForgotPasswordEmail", () => {
    it("calls auth().sendPasswordResetEmail with the email", async () => {
      getMockAuth().sendPasswordResetEmail.mockResolvedValue(undefined);

      await sendForgotPasswordEmail("reset@example.com");

      expect(getMockAuth().sendPasswordResetEmail).toHaveBeenCalledWith(
        "reset@example.com"
      );
    });

    it("propagates auth errors", async () => {
      getMockAuth().sendPasswordResetEmail.mockRejectedValue(
        new Error("User not found")
      );

      await expect(
        sendForgotPasswordEmail("nobody@example.com")
      ).rejects.toThrow("User not found");
    });

    // Hardened 2026-07-04 added client-side rate limiting and email
    // validation/sanitization here too — previously untested. Unique emails
    // per test for the same reason as signInWithEmail above.
    it("blocks the 4th reset attempt within the rate-limit window (3 attempts / 5min)", async () => {
      getMockAuth().sendPasswordResetEmail.mockResolvedValue(undefined);
      const email = "ratelimit-reset-1@example.com";

      for (let i = 0; i < 3; i++) {
        await sendForgotPasswordEmail(email);
      }

      await expect(sendForgotPasswordEmail(email)).rejects.toMatchObject({
        code: "auth/too-many-requests",
      });
      expect(getMockAuth().sendPasswordResetEmail).toHaveBeenCalledTimes(3);
    });

    it("rejects a malformed email before calling Firebase", async () => {
      await expect(
        sendForgotPasswordEmail("not-an-email")
      ).rejects.toMatchObject({ code: "auth/invalid-email" });
      expect(getMockAuth().sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it("sanitizes the email before passing it to Firebase", async () => {
      getMockAuth().sendPasswordResetEmail.mockResolvedValue(undefined);

      await sendForgotPasswordEmail("<script>ratelimit-reset-2@example.com");

      expect(getMockAuth().sendPasswordResetEmail).toHaveBeenCalledWith(
        "scriptratelimit-reset-2@example.com"
      );
    });
  });
});
