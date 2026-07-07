/**
 * ManagerSettings Tests
 *
 * Regression coverage for 2026-07-05: removeAdmin's guest-administrator
 * branch cloned the guest, set `guest.isAdmin = false` on the clone, then
 * never used that variable — only dispatched an unchanged house clone. No
 * error, no revert; the guest stayed admin forever. This suite confirms:
 *  - Pressing "Remove" on a guest administrator revokes the real admin claim
 *    (removeAdminPrivilegesForGuests) and persists the Firestore guest doc
 *    (useUpdateGuest) with isAdmin: false.
 *  - Local state.setup.guests is synced so the UI reflects the removal.
 *  - A failure is logged and doesn't throw.
 */

const mockDispatch = jest.fn();
let mockState: any = {};
jest.mock("../../../state/store", () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: any) => selector(mockState),
}));

const mockRemoveAdminPrivilegesForGuests = jest.fn((_guests: any) =>
  Promise.resolve("success")
);
const mockRemoveAdminPrivileges = jest.fn(
  (_admin: any, _adminHouseIds: string[], _superAdminHouseIds: string[]) =>
    Promise.resolve("success")
);
jest.mock("../../../services/house", () => ({
  removeAdminPrivilegesForGuests: (guests: any) =>
    mockRemoveAdminPrivilegesForGuests(guests),
  removeAdminPrivileges: (
    admin: any,
    adminHouseIds: any,
    superAdminHouseIds: any
  ) => mockRemoveAdminPrivileges(admin, adminHouseIds, superAdminHouseIds),
}));

const mockMutateAsync = jest.fn(() => Promise.resolve());
jest.mock("../../../state/queries/guestQueries", () => ({
  useUpdateGuest: () => ({ mutateAsync: mockMutateAsync }),
}));

const mockUpdateHouseMutateAsync = jest.fn(() => Promise.resolve());
jest.mock("../../../state/queries/houseQueries", () => ({
  useUpdateHouse: () => ({ mutateAsync: mockUpdateHouseMutateAsync }),
}));

const mockLogException = jest.fn();
jest.mock("../../../util/logging", () => ({
  logException: (...args: any[]) => mockLogException(...args),
}));

jest.mock("../../../context", () => ({
  useModal: () => ({
    showFormModal: jest.fn(),
    dismissFormModal: jest.fn(),
  }),
}));

jest.mock("../AddManager", () => () => null);

// Captures leftButtonAction per admin row so tests can invoke "Remove" without
// depending on the real ActivityItemWithButtons UI internals.
const capturedActions: Record<string, () => void> = {};
jest.mock("../../../components/card-list/card-list", () => ({
  ActivityItemWithButtons: (props: any) => {
    capturedActions[props.descriptionHeader] = props.leftButtonAction;
    const react = require("react");
    const { TouchableOpacity, Text } = require("react-native");
    return react.createElement(
      TouchableOpacity,
      {
        testID: `remove-${props.descriptionHeader}`,
        onPress: props.leftButtonAction,
      },
      react.createElement(Text, null, props.descriptionHeader)
    );
  },
}));

jest.mock("../../../components/rats-button/rats-button", () => () => null);
jest.mock("../../SetupWizards/OperatorSetupWizard", () => ({
  SetupHeader: (props: any) => {
    const react = require("react");
    const { View } = require("react-native");
    return react.createElement(View, null, props.children);
  },
}));
jest.mock("../../../components/confirmation-buttons", () => () => null);
jest.mock("../../../components/rats-scroll-view", () => {
  const react = require("react");
  const { View } = require("react-native");
  return (props: any) => react.createElement(View, null, props.children);
});

import React from "react";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import ManagerSettings from "../ManagerSettings";

const GUEST_ADMIN = {
  id: "guest-1",
  userId: "user-1",
  houseId: "house-1",
  firstName: "Sam",
  lastName: "GuestAdmin",
  isAdmin: true,
};

const REAL_ADMIN = {
  id: "admin-1",
  userId: "user-admin-1",
  firstName: "Pat",
  lastName: "Manager",
  houseIds: ["house-1"],
  superAdmin: [] as string[],
};

const HOUSE = { id: "house-1", adminIds: ["admin-1"], superAdminIds: [] };

function renderScreen(
  admins: Record<string, any> = {},
  handleSubmit = jest.fn()
) {
  mockState = {
    setup: {
      guests: { [GUEST_ADMIN.id]: GUEST_ADMIN },
      admins,
      selectedHouse: HOUSE,
    },
  };
  const props = {
    initializeHouseSetup: jest.fn(),
    handleSubmit,
    navigation: {} as any,
  };
  return { ...render(<ManagerSettings {...props} />), handleSubmit };
}

describe("ManagerSettings", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRemoveAdminPrivilegesForGuests.mockResolvedValue("success");
    mockMutateAsync.mockResolvedValue(undefined);
  });

  describe("removing a guest administrator", () => {
    it("revokes the admin claim and persists isAdmin: false on the guest doc", async () => {
      const { getByTestId } = renderScreen();

      await act(async () => {
        fireEvent.press(getByTestId("remove-Sam GuestAdmin"));
      });

      await waitFor(() =>
        expect(mockRemoveAdminPrivilegesForGuests).toHaveBeenCalledWith([
          { ...GUEST_ADMIN, isAdmin: false },
        ])
      );
      expect(mockMutateAsync).toHaveBeenCalledWith({
        guest: { ...GUEST_ADMIN, isAdmin: false },
        updatedGuest: { id: GUEST_ADMIN.id, isAdmin: false },
      });
      expect(mockDispatch).toHaveBeenCalled();
    });

    it("logs the error without throwing when the claim revoke fails", async () => {
      mockRemoveAdminPrivilegesForGuests.mockRejectedValue(
        new Error("permission-denied")
      );
      const { getByTestId } = renderScreen();

      await act(async () => {
        fireEvent.press(getByTestId("remove-Sam GuestAdmin"));
      });

      await waitFor(() => expect(mockLogException).toHaveBeenCalled());
      expect(mockMutateAsync).not.toHaveBeenCalled();
    });
  });

  // Regression coverage for 2026-07-05: removeAdmin's real-Admin branch only
  // dispatched a locally-mutated house clone — it never persisted to
  // Firestore and never called the Cloud Function that revokes the admin's
  // custom claim, so a "removed" admin kept real access to the house.
  describe("removing a real admin", () => {
    // Regression coverage for 2026-07-07: this used to persist via
    // handleSubmit(_house) — HouseSettings.tsx's generic form-submission
    // handler, which unconditionally dismisses the whole Manager Settings
    // modal. Removing a real admin should persist WITHOUT dismissing,
    // exactly like removing a guest administrator (above) does — an operator
    // removing several admins in one sitting must not get kicked out after
    // the first one.
    it("persists directly via useUpdateHouse, without dismissing the modal through handleSubmit", async () => {
      const { getByTestId, handleSubmit } = renderScreen({
        "admin-1": REAL_ADMIN,
      });

      await act(async () => {
        fireEvent.press(getByTestId("remove-Pat Manager"));
      });

      await waitFor(() =>
        expect(mockRemoveAdminPrivileges).toHaveBeenCalledWith(
          REAL_ADMIN,
          ["house-1"],
          []
        )
      );
      expect(mockUpdateHouseMutateAsync).toHaveBeenCalledWith({
        houseId: "house-1",
        values: expect.objectContaining({ id: "house-1", adminIds: [] }),
      });
      expect(handleSubmit).not.toHaveBeenCalled();
      expect(mockDispatch).toHaveBeenCalled();
    });

    it("revokes the superAdmin claim instead when the admin is a super admin for this house", async () => {
      const superAdmin = { ...REAL_ADMIN, superAdmin: ["house-1"] };
      const { getByTestId } = renderScreen({ "admin-1": superAdmin });

      await act(async () => {
        fireEvent.press(getByTestId("remove-Pat Manager"));
      });

      await waitFor(() =>
        expect(mockRemoveAdminPrivileges).toHaveBeenCalledWith(
          superAdmin,
          [],
          ["house-1"]
        )
      );
    });

    it("logs the error without persisting when the claim revoke fails", async () => {
      mockRemoveAdminPrivileges.mockRejectedValueOnce(
        new Error("permission-denied")
      );
      const { getByTestId, handleSubmit } = renderScreen({
        "admin-1": REAL_ADMIN,
      });

      await act(async () => {
        fireEvent.press(getByTestId("remove-Pat Manager"));
      });

      await waitFor(() => expect(mockLogException).toHaveBeenCalled());
      expect(handleSubmit).not.toHaveBeenCalled();
      expect(mockUpdateHouseMutateAsync).not.toHaveBeenCalled();
    });
  });
});
