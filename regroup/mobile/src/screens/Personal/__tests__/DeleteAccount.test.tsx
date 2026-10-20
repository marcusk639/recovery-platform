jest.mock("../../../components/screen-header", () => () => null);
jest.mock("../../../components/rats-scroll-view", () => {
  const { View } = require("react-native");
  return ({ children }: any) => <View>{children}</View>;
});
jest.mock("../../../components/rats-button/rats-button", () => {
  const { TouchableOpacity, Text } = require("react-native");
  return ({ title, onPress, testID, disabled }: any) => (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityState={{ disabled: !!disabled }}
    >
      <Text>{title}</Text>
    </TouchableOpacity>
  );
});
jest.mock("../../../components/rats-text", () => ({
  RatsText: ({ text }: any) => {
    const { Text } = require("react-native");
    return <Text>{text}</Text>;
  },
}));

const mockDeleteMyAccount = jest.fn();
jest.mock("../../../services/account", () => ({
  deleteMyAccount: (...a: any[]) => mockDeleteMyAccount(...a),
  DELETION_UNCONFIRMED_CODE: "account/deletion-unconfirmed",
}));
const mockLogException = jest.fn();
jest.mock("../../../util/logging", () => ({
  logException: (...a: any[]) => mockLogException(...a),
}));
const mockDispatch = jest.fn(() => Promise.resolve());
jest.mock("../../../state/store", () => ({
  useAppDispatch: () => mockDispatch,
}));
jest.mock("../../../state/slices/userSlice", () => ({
  logout: () => ({ type: "user/logout" }),
}));

import React from "react";
import { Alert } from "react-native";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import DeleteAccount from "../DeleteAccount";
import { Routes } from "../../../navigation/types";

const navigation: any = { navigate: jest.fn(), goBack: jest.fn() };

function setup() {
  const utils = render(<DeleteAccount navigation={navigation} />);
  fireEvent.changeText(utils.getByTestId("delete-password-input"), "pw");
  return utils;
}

describe("DeleteAccount", () => {
  beforeEach(() => jest.clearAllMocks());

  it("shows the incorrect-password message on auth/wrong-password and auth/invalid-credential", async () => {
    for (const code of ["auth/wrong-password", "auth/invalid-credential"]) {
      mockDeleteMyAccount.mockRejectedValueOnce({ code });
      const { getByTestId, findByText, unmount } = setup();
      fireEvent.press(getByTestId("delete-account-button"));
      expect(await findByText("That password is incorrect.")).toBeTruthy();
      unmount();
    }
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it("shows the generic message and logs on any other failure", async () => {
    mockDeleteMyAccount.mockRejectedValueOnce({ code: "functions/internal" });
    const { getByTestId, findByText } = setup();
    fireEvent.press(getByTestId("delete-account-button"));
    expect(
      await findByText("We couldn't delete your account. Try again.")
    ).toBeTruthy();
    expect(mockLogException).toHaveBeenCalled();
  });

  it("navigates to PriorAuth after deletion, having shown what is deleted and kept", async () => {
    mockDeleteMyAccount.mockResolvedValueOnce(undefined);
    const { getByTestId, getByText } = setup();
    expect(
      getByText(
        "This permanently deletes your Regroup login, your profile, notifications, applications, uploaded documents, and direct messages you sent. Your house keeps your name, dates and rent records for its records, without your contact, recovery or health details. Messages you posted in house group chat stay. If you have a Regroup subscription it is cancelled immediately, and houses you own are closed. This cannot be undone."
      )
    ).toBeTruthy();
    fireEvent.press(getByTestId("delete-account-button"));
    await waitFor(() =>
      expect(navigation.navigate).toHaveBeenCalledWith(Routes.PriorAuth)
    );
    expect(mockDeleteMyAccount).toHaveBeenCalledWith("pw");
  });

  it.each([
    ["permission-denied", "The demo account can't be deleted."],
    ["failed-precondition", "Please sign in again to delete your account"],
    ["functions/failed-precondition", "Please sign in again to delete your account"],
  ])("shows the server message for %s", async (code, message) => {
    mockDeleteMyAccount.mockRejectedValueOnce({ code, message });
    const { getByTestId, findByText, queryByText } = setup();
    fireEvent.press(getByTestId("delete-account-button"));
    expect(await findByText(message)).toBeTruthy();
    expect(queryByText("We couldn't delete your account. Try again.")).toBeNull();
    expect(mockLogException).not.toHaveBeenCalled();
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it("shows and logs the partial-deletion message from the server", async () => {
    const message =
      "Part of your account was already removed. Please try again; contact support if this keeps happening.";
    mockDeleteMyAccount.mockRejectedValueOnce({ code: "internal", message, details: { partial: true } });
    const { getByTestId, findByText } = setup();
    fireEvent.press(getByTestId("delete-account-button"));
    expect(await findByText(message)).toBeTruthy();
    expect(mockLogException).toHaveBeenCalled();
  });

  it("keeps the generic message for an internal error without partial details", async () => {
    mockDeleteMyAccount.mockRejectedValueOnce({ code: "internal", message: "INTERNAL" });
    const { getByTestId, findByText, queryByText } = setup();
    fireEvent.press(getByTestId("delete-account-button"));
    expect(await findByText("We couldn't delete your account. Try again.")).toBeTruthy();
    expect(queryByText("INTERNAL")).toBeNull();
  });

  it("alerts and leaves the signed-out session when deletion can't be confirmed", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const message = "We couldn't confirm your account was deleted. Sign in again to check.";
    mockDeleteMyAccount.mockRejectedValueOnce(
      Object.assign(new Error(message), { code: "account/deletion-unconfirmed" })
    );
    const { getByTestId } = setup();
    fireEvent.press(getByTestId("delete-account-button"));
    await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith(Routes.PriorAuth));
    expect(alert).toHaveBeenCalledWith("Delete account", message);
    expect(mockDispatch).toHaveBeenCalledWith({ type: "user/logout" });
    alert.mockRestore();
  });

  it("disables the button while deleting", async () => {
    let resolve: () => void = () => {};
    mockDeleteMyAccount.mockReturnValueOnce(
      new Promise<void>((r) => (resolve = r))
    );
    const { getByTestId } = setup();
    fireEvent.press(getByTestId("delete-account-button"));
    await waitFor(() =>
      expect(getByTestId("delete-account-button").props.accessibilityState.disabled).toBe(true)
    );
    fireEvent.press(getByTestId("delete-account-button"));
    expect(mockDeleteMyAccount).toHaveBeenCalledTimes(1);
    await act(async () => resolve());
  });
});
