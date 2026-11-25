// The addMessagingToken thunk: the write goes through the arrayUnion service
// call, and the app's copy of the user gains the token once it lands.

jest.mock("../../../../firebase-setup", () => ({ firestore: {}, functions: {} }));
jest.mock("../../../services/users", () => ({ userCollection: {} }));
jest.mock("../../../services/messagingToken", () => ({ addMessagingToken: jest.fn() }));
jest.mock("../../../util/user", () => ({ getFirebaseUserFromUserCredential: jest.fn() }));
jest.mock("../../../util/subscription", () => ({ subscriptionStatus: jest.fn() }));
jest.mock("../../../navigation/service", () => ({
  __esModule: true,
  default: { navigate: jest.fn(), reset: jest.fn(), goBack: jest.fn() },
  navigationRef: { current: null },
}));
jest.mock("@react-navigation/native", () => ({
  CommonActions: { reset: jest.fn((payload) => payload), navigate: jest.fn() },
}));

import { configureStore } from "@reduxjs/toolkit";
import * as messagingTokenService from "../../../services/messagingToken";
import userReducer from "../userSlice";
import { addMessagingToken } from "../userMessagingToken";
import { User } from "../../../entities/User";

const mockAdd = messagingTokenService.addMessagingToken as jest.Mock;

function storeWith(messagingToken: string[] | undefined) {
  const initial = userReducer(undefined, { type: "@@INIT" });
  const user = { id: "u1", messagingToken } as unknown as User;
  return configureStore({
    reducer: { user: userReducer },
    preloadedState: { user: { ...initial, user } },
  });
}

beforeEach(() => {
  mockAdd.mockReset();
  mockAdd.mockResolvedValue(undefined);
});

describe("addMessagingToken thunk", () => {
  it("saves the token for the user and adds it to the stored user", async () => {
    const store = storeWith(["tok-old"]);
    const user = store.getState().user.user as User;

    await store.dispatch(addMessagingToken({ user, token: "tok-new" })).unwrap();

    expect(mockAdd).toHaveBeenCalledWith("u1", "tok-new");
    expect(store.getState().user.user?.messagingToken).toEqual(["tok-old", "tok-new"]);
  });

  it("starts the list for a user with no tokens", async () => {
    const store = storeWith(undefined);
    const user = store.getState().user.user as User;

    await store.dispatch(addMessagingToken({ user, token: "tok-new" })).unwrap();

    expect(store.getState().user.user?.messagingToken).toEqual(["tok-new"]);
  });

  it("does not list a token twice in the stored user", async () => {
    const store = storeWith(["tok-a"]);
    const user = store.getState().user.user as User;

    await store.dispatch(addMessagingToken({ user, token: "tok-a" })).unwrap();

    expect(store.getState().user.user?.messagingToken).toEqual(["tok-a"]);
  });

  it("leaves the stored user unchanged and rejects when the write fails", async () => {
    mockAdd.mockRejectedValue(new Error("permission-denied"));
    const store = storeWith(["tok-old"]);
    const user = store.getState().user.user as User;

    await expect(
      store.dispatch(addMessagingToken({ user, token: "tok-new" })).unwrap(),
    ).rejects.toMatchObject({ message: "permission-denied" });
    expect(store.getState().user.user?.messagingToken).toEqual(["tok-old"]);
  });
});
