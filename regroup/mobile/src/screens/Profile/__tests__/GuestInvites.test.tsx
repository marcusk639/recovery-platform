/**
 * GuestInvites Tests
 *
 * Regression coverage for 2026-07-05: this screen dispatched a nonexistent
 * `updateHouse` thunk from housesSlice (which exports no such action) —
 * TypeError: updateHouse is not a function, thrown synchronously and outside
 * the nearby try/catch — so pressing "Send Invites" always crashed before
 * ever calling sendAllInvites. This suite confirms:
 *  - Submitting calls the real useUpdateHouse mutation, then sendAllInvites.
 *  - A failure in either is caught, logged, and surfaces as a failure state
 *    instead of an uncaught crash.
 */

let capturedOnSubmit: any = null;
jest.mock("../../SetupWizards/GuestSetup", () => ({
  GuestSetupForm: (props: any) => {
    capturedOnSubmit = props.onSubmit;
    return null;
  },
}));

const mockUpdateHouseMutateAsync = jest.fn(() => Promise.resolve());
jest.mock("../../../state/queries/houseQueries", () => ({
  useUpdateHouse: () => ({ mutateAsync: mockUpdateHouseMutateAsync }),
}));

const mockSendAllInvites = jest.fn(
  (_houses: any, _user: any, _a?: any, _b?: any, _c?: any) => Promise.resolve()
);
jest.mock("../../../services/setup-wizard", () => ({
  sendAllInvites: (houses: any, user: any, a?: any, b?: any, c?: any) =>
    mockSendAllInvites(houses, user, a, b, c),
}));

const mockExtractGuestEmails = jest.fn((house: any, guestEmails: any) => ({
  ...house,
  pendingGuestInvites: guestEmails,
}));
jest.mock("../../../util/house", () => ({
  extractGuestEmails: (house: any, guestEmails: any) =>
    mockExtractGuestEmails(house, guestEmails),
}));

const mockLogException = jest.fn();
jest.mock("../../../util/logging", () => ({
  logException: (...args: any[]) => mockLogException(...args),
}));

const mockSetLoadingModalState = jest.fn();
jest.mock("../../../context", () => ({
  useModal: () => ({ setLoadingModalState: mockSetLoadingModalState }),
}));

jest.mock("../../../hooks/useSelectedHouse", () => ({
  useSelectedHouse: () => ({ house: mockHouse, houseId: mockHouse.id }),
}));

jest.mock("../../../state/store", () => ({
  useAppSelector: (selector: any) => selector({ user: { user: mockUser } }),
}));

jest.mock("../../../components/screen-header", () => () => null);

const mockHouse = { id: "house-1", pendingGuestInvites: [] as string[] };
const mockUser = { uid: "user-1", id: "user-1" };

import React from "react";
import { render } from "@testing-library/react-native";
import GuestInvites from "../GuestInvites";

describe("GuestInvites", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateHouseMutateAsync.mockResolvedValue(undefined);
    mockSendAllInvites.mockResolvedValue(undefined);
  });

  function renderScreen() {
    const mockNavigation: any = { goBack: jest.fn(), navigate: jest.fn() };
    const utils = render(<GuestInvites navigation={mockNavigation} />);
    return { ...utils, mockNavigation };
  }

  it("persists the house via the real useUpdateHouse mutation, then sends invites", async () => {
    const { mockNavigation } = renderScreen();

    await capturedOnSubmit({ guestEmails: ["a@b.com"] }, {});

    expect(mockUpdateHouseMutateAsync).toHaveBeenCalledWith({
      houseId: "house-1",
      values: expect.objectContaining({ id: "house-1" }),
    });
    expect(mockSendAllInvites).toHaveBeenCalled();
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  it("logs and surfaces a failure instead of crashing when the house update fails", async () => {
    mockUpdateHouseMutateAsync.mockRejectedValueOnce(
      new Error("network error")
    );
    const { mockNavigation } = renderScreen();

    await expect(
      capturedOnSubmit({ guestEmails: ["a@b.com"] }, {})
    ).resolves.not.toThrow();

    expect(mockLogException).toHaveBeenCalled();
    expect(mockSendAllInvites).not.toHaveBeenCalled();
    expect(mockNavigation.goBack).not.toHaveBeenCalled();
  });

  it("logs and surfaces a failure instead of crashing when sendAllInvites fails", async () => {
    mockSendAllInvites.mockRejectedValueOnce(new Error("email service down"));
    const { mockNavigation } = renderScreen();

    await capturedOnSubmit({ guestEmails: ["a@b.com"] }, {});

    expect(mockLogException).toHaveBeenCalled();
    expect(mockNavigation.goBack).not.toHaveBeenCalled();
  });
});
