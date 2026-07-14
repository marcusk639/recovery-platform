/**
 * EditUserInfoForm — silent failure on profile-update rejection
 *
 * Bug: `updateUser` dispatched the `updateUser` RTK thunk without
 * `.unwrap()`, so dispatch(thunk) resolved to the action envelope
 * (fulfilled OR rejected) instead of rejecting on failure. handleSubmit's
 * `await updateUser(user, values)` therefore never threw on a real failure,
 * so a failed profile update did nothing visible to the user: no error
 * alert, and the form still called navigation.goBack() as if the save had
 * succeeded.
 *
 * Mirrors the established test pattern from NewAccountForm.test.tsx /
 * SignUpForm.test.tsx (mock the inner *View component to capture the props
 * Formik injects, mock state/store + userSlice to control the dispatch
 * result).
 */

let capturedProps: any = null;
jest.mock("../EditUserInfoFormView", () => (props: any) => {
  capturedProps = props;
  return null;
});

const mockUnwrap = jest.fn(() => Promise.resolve({ id: "user-1" }));
const mockDispatch = jest.fn(() => ({ unwrap: mockUnwrap }));
jest.mock("../../../state/store", () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: any) =>
    selector({
      user: { user: { id: "user-1" } },
      guests: { userAsGuest: null },
      admin: { userAsAdmin: null },
    }),
}));

const mockUpdateUserThunkCreator = jest.fn((arg: any) => ({
  type: "user/updateUser",
  arg,
}));
jest.mock("../../../state/slices/userSlice", () => ({
  updateUser: (arg: any) => mockUpdateUserThunkCreator(arg),
}));

jest.mock("../../../state/queries/guestQueries", () => ({
  useUpdateGuest: () => ({ mutateAsync: jest.fn() }),
}));
jest.mock("../../../state/queries/adminQueries", () => ({
  useUpdateAdmin: () => ({ mutateAsync: jest.fn() }),
}));
jest.mock("../../../hooks/useSelectedHouse", () => ({
  useSelectedHouse: () => ({ house: null }),
}));

const mockAlert = jest.spyOn(require("react-native").Alert, "alert");

import React from "react";
import { render, act, waitFor } from "@testing-library/react-native";
import EditUserInfoFormWrapper from "../EditUserInfoForm";

describe("EditUserInfoFormWrapper", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("unwraps the updateUser thunk dispatch instead of resolving to the raw action envelope", async () => {
    render(<EditUserInfoFormWrapper navigation={{} as any} />);

    const user = { id: "user-1" } as any;
    const values = { phoneNumber: "5551234567" } as any;
    const result = await capturedProps.updateUser(user, values);

    expect(mockUpdateUserThunkCreator).toHaveBeenCalledWith({
      user,
      updates: values,
    });
    expect(mockUnwrap).toHaveBeenCalled();
    expect(result).toEqual({ id: "user-1" });
  });

  it("propagates a rejected updateUser thunk as a real rejection instead of swallowing it", async () => {
    mockUnwrap.mockRejectedValueOnce(new Error("update failed"));
    render(<EditUserInfoFormWrapper navigation={{} as any} />);

    await expect(
      capturedProps.updateUser({ id: "user-1" } as any, {} as any),
    ).rejects.toThrow("update failed");
  });

  it("shows a visible error and does not navigate away when the profile update fails", async () => {
    mockUnwrap.mockRejectedValueOnce(new Error("network down"));
    const mockGoBack = jest.fn();
    render(
      <EditUserInfoFormWrapper navigation={{ goBack: mockGoBack } as any} />,
    );

    // Formik's own handleSubmit, injected as a prop into EditUserInfoFormView.
    // Formik's handleSubmit() promise doesn't reliably chain through to the
    // config handleSubmit's completion (see MiscellaneousForm.test.tsx for
    // the same caveat) — poll instead of awaiting it directly.
    act(() => {
      capturedProps.handleSubmit();
    });

    await waitFor(() =>
      expect(mockAlert).toHaveBeenCalledWith(
        "Update Failed",
        expect.any(String),
      ),
    );
    expect(mockGoBack).not.toHaveBeenCalled();
  });

  it("navigates back after a successful profile update, without showing an error", async () => {
    const mockGoBack = jest.fn();
    render(
      <EditUserInfoFormWrapper navigation={{ goBack: mockGoBack } as any} />,
    );

    act(() => {
      capturedProps.handleSubmit();
    });

    await waitFor(() => expect(mockGoBack).toHaveBeenCalled());
    expect(mockAlert).not.toHaveBeenCalled();
  });
});
