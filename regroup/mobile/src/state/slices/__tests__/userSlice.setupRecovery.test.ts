// src/state/slices/__tests__/userSlice.setupRecovery.test.ts
//
// Login/relaunch recovery for an operator whose houses were created but whose
// setup never finished (orgSetupCompleted false). The login thunks load the
// user through getUserFinishingSetup, which calls finishOperatorSetup only
// when the user doc records owned houses; on success the token is refreshed
// and the reloaded user routes as a completed operator. On failure routing
// falls through to the setup wizard. Real thunks, users service, recovery
// service and navigation service; only Firebase and the user doc are faked.

const mockCallable = jest.fn();
jest.mock("../../../../firebase-setup", () => ({
  firestore: { collection: jest.fn(() => ({ doc: jest.fn() })) },
  functions: { httpsCallable: jest.fn(() => mockCallable) },
}));

const mockGetIdTokenResult = jest.fn();
jest.mock("@react-native-firebase/auth", () => () => ({
  currentUser: { getIdTokenResult: mockGetIdTokenResult },
  signInWithEmailAndPassword: jest.fn(() => Promise.resolve({ uid: "op-uid" })),
}));

jest.mock("../../../services/crud", () => ({ get: jest.fn(), update: jest.fn() }));
jest.mock("../../../services/house", () => ({}));
jest.mock("../../../services/guest", () => ({ guestCollection: {} }));
jest.mock("../../../services/admin", () => ({ adminCollection: {} }));
jest.mock("../../../services/storage", () => ({ uploadUserAvatar: jest.fn() }));
jest.mock("../../../util/logging", () => ({ logException: jest.fn() }));
jest.mock("../../../util/subscription", () => ({ subscriptionStatus: jest.fn() }));
jest.mock("../../../util/user", () => ({
  getFirebaseUserFromUserCredential: jest.fn((credential: unknown) => credential),
}));
jest.mock("../../../navigation/service", () => ({
  __esModule: true,
  default: {},
  navigationRef: { current: null },
}));

import { configureStore } from "@reduxjs/toolkit";
import { functions } from "../../../../firebase-setup";
import * as crud from "../../../services/crud";
import { logException } from "../../../util/logging";
import improvedNavigationService from "../../../navigation/improved-navigation-service";
import { Routes } from "../../../navigation/types";
import userReducer, { autoLogin, login } from "../userSlice";

const UID = "op-uid";
const incomplete = {
  id: UID,
  uid: UID,
  email: "op@example.com",
  isSuperAdmin: true,
  potentialSuperAdmin: true,
  orgSetupCompleted: false,
  housesOwned: ["h1"],
  subscriptionMetadata: { houses: { h1: {} } },
};
const completed = { ...incomplete, isAdmin: true, orgSetupCompleted: true };

const buildStore = () => configureStore({ reducer: { user: userReducer } });
const routeFor = (user: unknown) => improvedNavigationService.getInitialNavigation(user as any);
const order: string[] = [];

beforeEach(() => {
  order.length = 0;
  mockGetIdTokenResult.mockImplementation(async (force: boolean) => {
    order.push(`token:${force}`);
    return { claims: {} };
  });
  mockCallable.mockImplementation(async () => {
    order.push("finishOperatorSetup");
    return { data: { completed: true, houseIds: ["h1"] } };
  });
});

const seedUserDocs = (...docs: unknown[]) => {
  docs.forEach((doc) =>
    (crud.get as jest.Mock).mockImplementationOnce(async () => {
      order.push("getUser");
      return doc;
    }),
  );
};

describe.each([
  ["autoLogin (relaunch)", () => autoLogin({ uid: UID } as any)],
  ["login", () => login({ email: "op@example.com", password: "password123" })],
])("%s — operator setup recovery", (_label, thunk) => {
  it("finishes setup, refreshes the token and routes as a completed operator", async () => {
    seedUserDocs(incomplete, completed);
    const store = buildStore();
    await store.dispatch(thunk() as any);

    expect(functions.httpsCallable).toHaveBeenCalledWith("finishOperatorSetup");
    expect(order.slice(0, 4)).toEqual(["getUser", "finishOperatorSetup", "token:true", "getUser"]);
    const user = store.getState().user.user;
    expect(user?.orgSetupCompleted).toBe(true);
    expect(routeFor(user)).toMatchObject({
      initialRoute: Routes.Main,
      initialMainRoute: Routes.House,
    });
  });

  it("falls back to the setup wizard when the callable fails", async () => {
    seedUserDocs(incomplete);
    mockCallable.mockRejectedValueOnce(Object.assign(new Error("x"), { code: "internal" }));
    const store = buildStore();
    await store.dispatch(thunk() as any);

    expect(logException).toHaveBeenCalled();
    const user = store.getState().user.user;
    expect(user?.orgSetupCompleted).toBe(false);
    expect(store.getState().user.loggedIn).toBe(true);
    expect(routeFor(user).initialRoute).toBe(Routes.Setup);
  });

  it("falls back to the setup wizard when the server had nothing to finish", async () => {
    seedUserDocs(incomplete);
    mockCallable.mockResolvedValueOnce({ data: { completed: false } });
    const store = buildStore();
    await store.dispatch(thunk() as any);

    expect(crud.get).toHaveBeenCalledTimes(1);
    expect(routeFor(store.getState().user.user).initialRoute).toBe(Routes.Setup);
  });

  it("does not call finishOperatorSetup when the operator owns no houses", async () => {
    seedUserDocs({ ...incomplete, housesOwned: [], subscriptionMetadata: { houses: {} } });
    const store = buildStore();
    await store.dispatch(thunk() as any);

    expect(functions.httpsCallable).not.toHaveBeenCalled();
    expect(routeFor(store.getState().user.user).initialRoute).toBe(Routes.Setup);
  });

  it("does not call finishOperatorSetup once setup is completed", async () => {
    seedUserDocs(completed);
    const store = buildStore();
    await store.dispatch(thunk() as any);

    expect(functions.httpsCallable).not.toHaveBeenCalled();
    expect(routeFor(store.getState().user.user).initialRoute).toBe(Routes.Main);
  });
});
