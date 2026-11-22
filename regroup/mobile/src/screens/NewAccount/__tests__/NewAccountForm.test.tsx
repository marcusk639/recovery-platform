/**
 * NewAccountForm wrapper — updateUser .unwrap() regression
 *
 * Hardened 2026-07-05: `updateUser` dispatched the `updateUser` RTK thunk
 * without `.unwrap()`, so it resolved to the raw {type, payload, meta} action
 * envelope instead of the User. Every field read off "updatedUser" downstream
 * (isGuest, guestId, infoEntered) was undefined — sending every guest to
 * Routes.House instead of Routes.Guest, and feeding an undefined-riddled
 * object into the Firestore guest patch. This test confirms the dispatched
 * thunk's result is unwrapped before being handed to the form.
 */

let capturedProps: any = null;
jest.mock("../NewAccountFormView", () => (props: any) => {
  capturedProps = props;
  return null;
});

const mockUnwrap = jest.fn(() =>
  Promise.resolve({ id: "user-1", isGuest: true })
);
const mockDispatch = jest.fn(() => ({ unwrap: mockUnwrap }));
jest.mock("../../../state/store", () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: any) =>
    selector({
      user: { user: { id: "user-1", isGuest: true }, invitation: null },
    }),
}));

const mockUpdateUserThunkCreator = jest.fn((arg: any) => ({
  type: "user/updateUser",
  arg,
}));
jest.mock("../../../state/slices/userSlice", () => ({
  updateUser: (arg: any) => mockUpdateUserThunkCreator(arg),
  clearInvitation: () => ({ type: "user/clearInvitation" }),
}));

jest.mock("../../../hooks/useSelectedGuest", () => ({
  useSelectedGuest: () => ({ guest: null }),
}));

const mockUpdateGuestMutateAsync = jest.fn(() => Promise.resolve());
jest.mock("../../../state/queries/guestQueries", () => ({
  useUpdateGuest: () => ({ mutateAsync: mockUpdateGuestMutateAsync }),
  guestKeys: { detail: (id: string) => ["guests", "detail", id] },
}));

jest.mock("@tanstack/react-query", () => ({
  // getGuest reads the resident record through the query client.
  useQueryClient: () => ({
    fetchQuery: jest.fn(() => Promise.resolve({ id: "guest-1", houseId: "h1" })),
  }),
}));

import React from "react";
import { act, render } from "@testing-library/react-native";
import NewAccountFormWrapper from "../NewAccountForm";

describe("NewAccountFormWrapper", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("unwraps the updateUser thunk dispatch instead of resolving to the raw action envelope", async () => {
    render(<NewAccountFormWrapper navigation={{} as any} />);

    const user = { id: "user-1", isGuest: true } as any;
    const values = { isGuest: true, guestId: "guest-1" } as any;
    const result = await capturedProps.updateUser(user, values);

    expect(mockUpdateUserThunkCreator).toHaveBeenCalledWith({
      user,
      updates: values,
    });
    expect(mockUnwrap).toHaveBeenCalled();
    // Resolves to the real User (from .unwrap()), not the {type, payload} envelope.
    expect(result).toEqual({ id: "user-1", isGuest: true });
  });

  describe("finishing sign-up clears the invitation", () => {
    it("clears state.user.invitation once the account is complete, then opens Main", async () => {
      const navigation = { navigate: jest.fn() };
      render(<NewAccountFormWrapper navigation={navigation as any} />);
      await act(async () => {
        await capturedProps.handleSubmit();
      });
      expect(mockDispatch).toHaveBeenCalledWith({ type: "user/clearInvitation" });
      expect(navigation.navigate).toHaveBeenCalledWith("main", expect.anything());
    });

    it("keeps the invitation when saving the account fails", async () => {
      mockUnwrap.mockImplementationOnce(() => Promise.reject(new Error("offline")));
      const navigation = { navigate: jest.fn() };
      render(<NewAccountFormWrapper navigation={navigation as any} />);
      await act(async () => {
        await capturedProps.handleSubmit();
      });
      expect(mockDispatch).not.toHaveBeenCalledWith({ type: "user/clearInvitation" });
      expect(navigation.navigate).not.toHaveBeenCalled();
    });
  });
});
