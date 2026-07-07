/**
 * SignUpForm wrapper — updateUser .unwrap() regression
 *
 * Hardened 2026-07-05: `updateUser` dispatched the `updateUser` RTK thunk
 * without `.unwrap()`. dispatch(thunk) never rejects on its own — a failed
 * thunk resolves to a "rejected" action object instead of throwing — so the
 * surrounding `Promise.all([...]).catch(...)` in handleSubmit could never
 * catch a failed user update; the signup flow would navigate onward as if it
 * had succeeded. This test confirms the dispatched thunk's result is
 * unwrapped so a real failure propagates as a rejection.
 */

let capturedProps: any = null;
jest.mock("../SignUpFormView", () => (props: any) => {
  capturedProps = props;
  return null;
});

const mockUnwrap = jest.fn(() => Promise.resolve({ id: "user-1" }));
const mockDispatch = jest.fn(() => ({ unwrap: mockUnwrap }));
jest.mock("../../../state/store", () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: any) =>
    selector({
      user: { user: { id: "user-1" }, invitation: null, signUpRole: null },
    }),
}));

const mockCreateUserThunkCreator = jest.fn((arg: any) => ({
  type: "user/createUser",
  arg,
}));
const mockUpdateUserThunkCreator = jest.fn((arg: any) => ({
  type: "user/updateUser",
  arg,
}));
jest.mock("../../../state/slices/userSlice", () => ({
  createUser: (arg: any) => mockCreateUserThunkCreator(arg),
  updateUser: (arg: any) => mockUpdateUserThunkCreator(arg),
}));

jest.mock("../../../state/queries/guestQueries", () => ({
  useCreateGuest: () => ({ mutateAsync: jest.fn() }),
}));
jest.mock("../../../state/queries/adminQueries", () => ({
  useCreateAdmin: () => ({ mutateAsync: jest.fn() }),
}));

import React from "react";
import { render } from "@testing-library/react-native";
import SignUpFormWrapper from "../SignUpForm";

describe("SignUpFormWrapper", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("unwraps the updateUser thunk dispatch so a real failure propagates as a rejection", async () => {
    render(<SignUpFormWrapper navigation={{} as any} />);

    const user = { id: "user-1" } as any;
    const values = { isGuest: true, guestId: "guest-1" } as any;
    await capturedProps.updateUser(user, values);

    expect(mockUpdateUserThunkCreator).toHaveBeenCalledWith({
      user,
      updates: values,
    });
    expect(mockUnwrap).toHaveBeenCalled();
  });

  it("propagates a rejected updateUser thunk as a real rejection instead of swallowing it", async () => {
    mockUnwrap.mockRejectedValueOnce(new Error("update failed"));
    render(<SignUpFormWrapper navigation={{} as any} />);

    await expect(
      capturedProps.updateUser({ id: "user-1" } as any, {} as any)
    ).rejects.toThrow("update failed");
  });
});
