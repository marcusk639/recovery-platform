// src/state/slices/__tests__/userSlice.test.ts

// Mock firebase-setup before any imports that depend on it
jest.mock("../../../../firebase-setup", () => ({
  firestore: {
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(),
        set: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      })),
      get: jest.fn(),
      add: jest.fn(),
      where: jest.fn().mockReturnThis(),
    })),
  },
  functions: {
    httpsCallable: jest.fn(() => jest.fn()),
  },
}));

// Mock the users service so async thunks don't touch Firebase
jest.mock("../../../services/users", () => ({
  signInWithEmail: jest.fn(),
  anonymouslyLogin: jest.fn(),
  signOut: jest.fn(),
  getUser: jest.fn(),
  createUser: jest.fn(),
  createAnonUser: jest.fn(),
  updateUser: jest.fn(),
  getAuthUser: jest.fn(),
  requestAccountVerification: jest.fn(),
  convertFirebaseUserToRatsUser: jest.fn(),
  userCollection: {},
}));

// Mock user utility
jest.mock("../../../util/user", () => ({
  getFirebaseUserFromUserCredential: jest.fn(),
}));

// Mock subscription utility
jest.mock("../../../util/subscription", () => ({
  subscriptionStatus: jest.fn(),
}));

// Mock Firebase Auth
jest.mock("@react-native-firebase/auth", () => () => ({
  signInWithEmailAndPassword: jest.fn(),
  signInAnonymously: jest.fn(),
  signOut: jest.fn(),
  currentUser: null,
}));

// Mock navigation service
jest.mock("../../../navigation/service", () => ({
  __esModule: true,
  default: {
    navigate: jest.fn(),
    reset: jest.fn(),
    goBack: jest.fn(),
  },
  navigationRef: { current: null },
  improvedNavigationService: {},
}));

// Mock @react-navigation/native
jest.mock("@react-navigation/native", () => ({
  CommonActions: {
    reset: jest.fn((payload) => payload),
    navigate: jest.fn(),
  },
  createRef: jest.fn(() => ({ current: null })),
}));

import { configureStore } from "@reduxjs/toolkit";
import * as userService from "../../../services/users";
import { subscriptionStatus } from "../../../util/subscription";
import userReducer, {
  clearError,
  setSignUpRole,
  setSubscriptionStatus,
  resetUserState,
  autoLogin,
} from "../userSlice";

describe("userSlice", () => {
  // Derive initialState from the reducer itself — no hardcoding
  const initialState = userReducer(undefined, { type: "@@INIT" });

  describe("Initial State", () => {
    it("returns the correct initial state shape", () => {
      expect(initialState.loggedIn).toBe(false);
      expect(initialState.user).toBeNull();
      expect(initialState.loading).toBe(true);
      expect(initialState.error).toBeNull();
      expect(initialState.loginFailed).toBe(false);
      expect(initialState.updatingFailed).toBe(false);
      expect(initialState.accountVerifyFailed).toBe(false);
      expect(initialState.signUpRole).toBeNull();
      expect(initialState.subscriptionStatus).toBeNull();
    });
  });

  describe("clearError", () => {
    it("clears error field", () => {
      const stateWithError = {
        ...initialState,
        error: { message: "Something went wrong" },
      };
      const state = userReducer(stateWithError, clearError());
      expect(state.error).toBeNull();
    });

    it("resets loginFailed to false", () => {
      const stateWithLoginFailed = {
        ...initialState,
        loginFailed: true,
      };
      const state = userReducer(stateWithLoginFailed, clearError());
      expect(state.loginFailed).toBe(false);
    });

    it("resets updatingFailed to false", () => {
      const stateWithUpdatingFailed = {
        ...initialState,
        updatingFailed: true,
      };
      const state = userReducer(stateWithUpdatingFailed, clearError());
      expect(state.updatingFailed).toBe(false);
    });

    it("resets accountVerifyFailed to false", () => {
      const stateWithVerifyFailed = {
        ...initialState,
        accountVerifyFailed: true,
      };
      const state = userReducer(stateWithVerifyFailed, clearError());
      expect(state.accountVerifyFailed).toBe(false);
    });

    it("clears all error fields at once", () => {
      const errorState = {
        ...initialState,
        error: "auth/wrong-password",
        loginFailed: true,
        updatingFailed: true,
        accountVerifyFailed: true,
      };
      const state = userReducer(errorState, clearError());
      expect(state.error).toBeNull();
      expect(state.loginFailed).toBe(false);
      expect(state.updatingFailed).toBe(false);
      expect(state.accountVerifyFailed).toBe(false);
    });

    it("is a no-op when there is no error", () => {
      const state = userReducer(initialState, clearError());
      expect(state.error).toBeNull();
      expect(state.loginFailed).toBe(false);
      expect(state.updatingFailed).toBe(false);
      expect(state.accountVerifyFailed).toBe(false);
    });
  });

  describe("setSignUpRole", () => {
    it("sets signUpRole to the provided role", () => {
      const state = userReducer(initialState, setSignUpRole("admin" as any));
      expect(state.signUpRole).toBe("admin");
    });

    it("overwrites a previously set signUpRole", () => {
      const stateWithRole = {
        ...initialState,
        signUpRole: "guest" as any,
      };
      const state = userReducer(stateWithRole, setSignUpRole("admin" as any));
      expect(state.signUpRole).toBe("admin");
    });
  });

  describe("setSubscriptionStatus", () => {
    it("sets subscriptionStatus to the provided value", () => {
      const state = userReducer(initialState, setSubscriptionStatus("active"));
      expect(state.subscriptionStatus).toBe("active");
    });

    it("sets subscriptionStatus to undefined when called with undefined", () => {
      const stateWithStatus = {
        ...initialState,
        subscriptionStatus: "active",
      };
      const state = userReducer(
        stateWithStatus,
        setSubscriptionStatus(undefined)
      );
      expect(state.subscriptionStatus).toBeUndefined();
    });

    it("overwrites an existing subscriptionStatus", () => {
      const stateWithStatus = {
        ...initialState,
        subscriptionStatus: "active",
      };
      const state = userReducer(
        stateWithStatus,
        setSubscriptionStatus("expired")
      );
      expect(state.subscriptionStatus).toBe("expired");
    });
  });

  describe("resetUserState", () => {
    it("resets loggedIn to false", () => {
      const loggedInState = {
        ...initialState,
        loggedIn: true,
        user: { uid: "user-123", email: "test@example.com" },
      };
      const state = userReducer(loggedInState, resetUserState());
      expect(state.loggedIn).toBe(false);
    });

    it("resets user to null", () => {
      const loggedInState = {
        ...initialState,
        user: { uid: "user-123", email: "test@example.com" },
      };
      const state = userReducer(loggedInState, resetUserState());
      expect(state.user).toBeNull();
    });

    it("resets entire state to initial values", () => {
      const dirtyState = {
        ...initialState,
        loggedIn: true,
        loading: false,
        updating: true,
        updatingFailed: true,
        updatingSuccessful: true,
        user: { uid: "user-123" },
        loggingIn: true,
        loggingOut: true,
        creatingUser: true,
        accountVerifyFailed: true,
        error: "some-error",
        houseCodeErrorMessage: "invalid code",
        signUpRole: "admin" as any,
        autoLoggingIn: true,
        anonLoggingIn: true,
        anonUser: { uid: "anon-456" },
        anonymous: true,
        invitation: { id: "inv-1" } as any,
        loginFailed: true,
        loggingOutSuccessful: true,
        token: { claims: { admin: true } },
        subscriptionStatus: "active",
      };
      const state = userReducer(dirtyState, resetUserState());
      expect(state).toEqual(initialState);
    });
  });

  // Regression coverage for 2026-07-05: autoLogin (the path virtually every
  // returning user takes, unlike the explicit email/password `login` thunk)
  // never dispatched setSubscriptionStatus, so state.subscriptionStatus
  // stayed null until the user explicitly logged out and back in.
  describe("autoLogin", () => {
    function buildStore() {
      return configureStore({ reducer: { user: userReducer } });
    }

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it("dispatches setSubscriptionStatus so subscriptionStatus is populated on the auto-login path", async () => {
      const fakeUser = { id: "user-1" };
      (userService.getUser as jest.Mock).mockResolvedValue(fakeUser);
      (userService.getAuthUser as jest.Mock).mockResolvedValue({
        claims: {},
      });
      (subscriptionStatus as jest.Mock).mockReturnValue("active");

      const store = buildStore();
      await store.dispatch(autoLogin({ uid: "user-1" } as any) as any);

      expect(subscriptionStatus).toHaveBeenCalledWith(fakeUser);
      expect(store.getState().user.subscriptionStatus).toBe("active");
    });
  });
});
