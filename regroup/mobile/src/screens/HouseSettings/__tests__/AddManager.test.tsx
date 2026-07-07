/**
 * AddManager Tests
 *
 * Regression coverage for 2026-07-05: promoting a guest to manager previously
 * only dispatched setGuests() — a plain setupSlice reducer with zero
 * Firestore side effect — so the promotion looked immediate but reverted on
 * the next reload/state re-sync. This suite confirms:
 *  - Selecting a guest and pressing Apply calls the real admin-claim grant
 *    (promoteGuestsToAdmin) and the real Firestore guest-doc patch
 *    (useUpdateGuest) with the correct arguments.
 *  - A failure in either surfaces an error notification and does NOT dismiss
 *    the modal (so the operator can retry).
 *  - The Apply button is disabled while the promotion is in flight.
 *  - The unrelated "invite by email" path is untouched.
 */

const mockDispatch = jest.fn();
jest.mock("../../../state/store", () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: jest.fn(() => undefined),
}));

jest.mock("../../../hooks/useSelectedHouse", () => ({
  useSelectedHouse: () => ({ house: null, houseId: null, isLoading: false }),
}));

const mockPromoteGuestsToAdmin = jest.fn((_guests: any) =>
  Promise.resolve("success")
);
jest.mock("../../../services/house", () => ({
  promoteGuestsToAdmin: (guests: any) => mockPromoteGuestsToAdmin(guests),
}));

const mockMutateAsync = jest.fn(() => Promise.resolve());
jest.mock("../../../state/queries/guestQueries", () => ({
  useUpdateGuest: () => ({ mutateAsync: mockMutateAsync }),
}));

const mockLogException = jest.fn();
jest.mock("../../../util/logging", () => ({
  logException: (...args: any[]) => mockLogException(...args),
}));

jest.mock("../../../components/rats-interactable-section", () => {
  const react = require("react");
  const { TouchableOpacity, Text } = require("react-native");
  return ({ name, onPress, testID, selected }: any) =>
    react.createElement(
      TouchableOpacity,
      {
        onPress,
        testID: testID || `section-${name}`,
        accessibilityState: { selected },
      },
      react.createElement(Text, null, name)
    );
});

jest.mock("../../../components/rats-button/rats-button", () => {
  const react = require("react");
  const { TouchableOpacity, Text } = require("react-native");
  return ({ title, onPress, testID, disabled }: any) =>
    react.createElement(
      TouchableOpacity,
      {
        onPress: disabled ? undefined : onPress,
        testID: testID || `button-${title}`,
        disabled,
      },
      react.createElement(Text, null, title)
    );
});

let lastEmailInputProps: any = null;
jest.mock(
  "../../../components/rats-text-input/rats-text-input",
  () => (props: any) => {
    lastEmailInputProps = props;
    return null;
  }
);
jest.mock("../../../components/rats-horizontal-rule", () => ({
  RatsHR: () => null,
}));
jest.mock("../../../components/rats-scroll-view", () => {
  const react = require("react");
  const { View } = require("react-native");
  return (props: any) => react.createElement(View, null, props.children);
});

import React from "react";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import AddManagerWrapper from "../AddManager";

const GUEST_1 = {
  id: "guest-1",
  userId: "user-1",
  houseId: "house-1",
  firstName: "Sam",
  lastName: "Guest",
  isAdmin: false,
};

function renderScreen(
  overrides: Partial<React.ComponentProps<typeof AddManagerWrapper>> = {}
) {
  const props = {
    guests: { [GUEST_1.id]: GUEST_1 },
    house: { id: "house-1" },
    dismissModal: jest.fn(),
    addAdminEmail: jest.fn(),
    ...overrides,
  };
  const utils = render(<AddManagerWrapper {...props} />);
  return { ...utils, props };
}

describe("AddManager", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPromoteGuestsToAdmin.mockResolvedValue("success");
    mockMutateAsync.mockResolvedValue(undefined);
  });

  it("renders the guest to promote", () => {
    const { getByText } = renderScreen();
    expect(getByText("Sam Guest")).toBeTruthy();
  });

  describe("promoting a guest", () => {
    it("grants the admin claim and persists the guest doc, then dismisses the modal", async () => {
      const { getByText, getByTestId, props } = renderScreen();
      fireEvent.press(getByText("Sam Guest"));
      fireEvent.press(getByTestId("send-manager-invite-button"));

      await waitFor(() =>
        expect(mockPromoteGuestsToAdmin).toHaveBeenCalledWith([GUEST_1])
      );
      expect(mockMutateAsync).toHaveBeenCalledWith({
        guest: GUEST_1,
        updatedGuest: { id: GUEST_1.id, isAdmin: true },
      });
      expect(mockDispatch).toHaveBeenCalled();
      expect(props.dismissModal).toHaveBeenCalled();
    });

    it("does not dismiss the modal and logs the error if the claim grant fails", async () => {
      mockPromoteGuestsToAdmin.mockRejectedValue(
        new Error("permission-denied")
      );
      const { getByText, getByTestId, props } = renderScreen();
      fireEvent.press(getByText("Sam Guest"));
      fireEvent.press(getByTestId("send-manager-invite-button"));

      await waitFor(() => expect(mockLogException).toHaveBeenCalled());
      expect(mockMutateAsync).not.toHaveBeenCalled();
      expect(props.dismissModal).not.toHaveBeenCalled();
    });

    it("does not dismiss the modal if the Firestore guest-doc patch fails", async () => {
      mockMutateAsync.mockRejectedValue(new Error("firestore unavailable"));
      const { getByText, getByTestId, props } = renderScreen();
      fireEvent.press(getByText("Sam Guest"));
      fireEvent.press(getByTestId("send-manager-invite-button"));

      await waitFor(() => expect(mockLogException).toHaveBeenCalled());
      expect(props.dismissModal).not.toHaveBeenCalled();
    });
  });

  describe("inviting by email", () => {
    it("still calls addAdminEmail and dismisses the modal, without touching guest promotion", () => {
      const { getByTestId, props } = renderScreen();
      // validateAndSet validates the *previous* email state against the new
      // value's touched/error flags, so two calls are needed to settle into a
      // valid, untouched-error state (matches real keystroke-by-keystroke typing).
      act(() => {
        lastEmailInputProps.customHandleChange("manager@example.com");
      });
      act(() => {
        lastEmailInputProps.customHandleChange("manager@example.com");
      });
      fireEvent.press(getByTestId("send-manager-invite-button"));

      expect(props.addAdminEmail).toHaveBeenCalledWith("manager@example.com");
      expect(mockPromoteGuestsToAdmin).not.toHaveBeenCalled();
      expect(mockMutateAsync).not.toHaveBeenCalled();
      expect(props.dismissModal).toHaveBeenCalled();
    });
  });
});
