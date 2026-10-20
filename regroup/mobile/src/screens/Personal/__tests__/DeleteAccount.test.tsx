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

  it("navigates to PriorAuth after deletion", async () => {
    mockDeleteMyAccount.mockResolvedValueOnce(undefined);
    const { getByTestId } = setup();
    fireEvent.press(getByTestId("delete-account-button"));
    await waitFor(() =>
      expect(navigation.navigate).toHaveBeenCalledWith(Routes.PriorAuth)
    );
    expect(mockDeleteMyAccount).toHaveBeenCalledWith("pw");
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
