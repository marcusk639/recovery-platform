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

let mockInvitation: any = null;
const mockUnwrap = jest.fn(() => Promise.resolve({ id: "user-1" }));
const mockDispatch = jest.fn(() => ({ unwrap: mockUnwrap }));
jest.mock("../../../state/store", () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: any) =>
    selector({
      user: {
        user: { id: "user-1" },
        invitation: mockInvitation,
        signUpRole: null,
      },
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

const mockCreateGuest = jest.fn();
const mockCreateAdmin = jest.fn();
jest.mock("../../../state/queries/guestQueries", () => ({
  useCreateGuest: () => ({ mutateAsync: mockCreateGuest }),
}));
jest.mock("../../../state/queries/adminQueries", () => ({
  useCreateAdmin: () => ({ mutateAsync: mockCreateAdmin }),
}));

const mockRedeemInvitation = jest.fn();
jest.mock("../../../services/invitations", () => ({
  redeemInvitation: (token: string) => mockRedeemInvitation(token),
}));
const mockUpdateSubscriptionGuests = jest.fn();
jest.mock("../../../services/subscription", () => ({
  updateSubscriptionGuests: (arg: any) => mockUpdateSubscriptionGuests(arg),
}));
jest.mock("../../../services/users", () => ({
  getAuthUser: jest.fn(() => Promise.resolve({})),
}));

import React from "react";
import { render, act } from "@testing-library/react-native";
import SignUpFormWrapper from "../SignUpForm";
import { Routes } from "../../../navigation/types";

describe("SignUpFormWrapper", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInvitation = null;
    mockRedeemInvitation.mockResolvedValue(undefined);
    mockCreateGuest.mockResolvedValue(undefined);
    mockCreateAdmin.mockResolvedValue(undefined);
    mockUnwrap.mockResolvedValue({ id: "user-1" });
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

  describe("token invitation signup", () => {
    const mockNavigate = jest.fn();
    const mockSetError = jest.fn();
    const mockSetSubmittingForm = jest.fn();

    const submit = async () => {
      jest.useFakeTimers();
      try {
        render(
          <SignUpFormWrapper
            navigation={{ navigate: mockNavigate } as any}
            setError={mockSetError}
            setSubmittingForm={mockSetSubmittingForm}
          />
        );
        await act(async () => {
          await capturedProps.setValues({
            email: mockInvitation.email,
            password: "Passw0rd!Strong1",
            confirmPassword: "Passw0rd!Strong1",
            termsOfService: true,
            firstName: "Rae",
            lastName: "Resident",
          });
        });
        await act(async () => {
          const done = capturedProps.submitForm();
          await jest.advanceTimersByTimeAsync(1500);
          await done;
        });
      } finally {
        jest.useRealTimers();
      }
    };

    it("guest token signup completes without calling updateSubscriptionGuests", async () => {
      mockInvitation = {
        type: "guest",
        token: "t1",
        houseId: "h1",
        ownerId: "",
        email: "r@x.com",
      };
      await submit();
      expect(mockRedeemInvitation).toHaveBeenCalledWith("t1");
      expect(mockUpdateSubscriptionGuests).not.toHaveBeenCalled();
      expect(mockCreateGuest).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith(Routes.NewAccount);
      expect(mockSetError).not.toHaveBeenCalled();
    });

    it("senior-peer token signup completes", async () => {
      mockInvitation = {
        type: "senior-peer",
        token: "t2",
        houseId: "h1",
        ownerId: "",
        email: "r@x.com",
      };
      await submit();
      expect(mockRedeemInvitation).toHaveBeenCalledWith("t2");
      expect(mockUpdateSubscriptionGuests).not.toHaveBeenCalled();
      expect(mockCreateGuest).toHaveBeenCalledWith(
        expect.objectContaining({ isAdmin: true })
      );
      expect(mockNavigate).toHaveBeenCalledWith(Routes.NewAccount);
      expect(mockSetError).not.toHaveBeenCalled();
    });

    it("admin token signup is unchanged", async () => {
      mockInvitation = {
        type: "admin",
        token: "t3",
        houseId: "h1",
        ownerId: "",
        email: "a@x.com",
      };
      await submit();
      expect(mockRedeemInvitation).toHaveBeenCalledWith("t3");
      expect(mockCreateAdmin).toHaveBeenCalled();
      expect(mockUpdateUserThunkCreator).toHaveBeenCalled();
      expect(mockUpdateSubscriptionGuests).not.toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith(Routes.NewAccount);
      expect(mockSetError).not.toHaveBeenCalled();
    });

    it("a createGuest failure still surfaces an error", async () => {
      mockInvitation = {
        type: "guest",
        token: "t1",
        houseId: "h1",
        ownerId: "",
        email: "r@x.com",
      };
      mockCreateGuest.mockRejectedValueOnce(new Error("guest create failed"));
      await submit();
      expect(mockSetError).toHaveBeenCalledWith("guest create failed");
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });
});
