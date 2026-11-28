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
import { keyboardAncestor } from "../../../components/rats-keyboard/__tests__/keyboardAncestor";
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

  it("surfaces a failure when sendAllInvites reports failed invitations", async () => {
    mockSendAllInvites.mockResolvedValueOnce({ sent: 0, failed: 1 } as any);
    const { mockNavigation } = renderScreen();

    await capturedOnSubmit({ guestEmails: ["a@b.com"] }, {});

    expect(mockLogException).toHaveBeenCalled();
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

// M3 (2026-11-27): createInvitation now refuses an invitation whose email
// failed. The screen used to show nothing on a failure (its failure state was
// never rendered), and every submit re-sent the whole accumulated
// pendingGuestInvites list, so a retry re-invited guests already invited (each
// pending invitation holds a resident slot).
describe("GuestInvites: what is sent and what the operator is told", () => {
  const { Alert } = require("react-native");
  let alertSpy: jest.SpyInstance;
  const sentEmails = () =>
    mockSendAllInvites.mock.calls.flatMap(
      ([houses]: any[]) => Object.values(houses).flatMap((h: any) => h.pendingGuestInvites)
    );
  const bag = () => ({ setFieldValue: jest.fn() });

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    mockUpdateHouseMutateAsync.mockResolvedValue(undefined);
    mockSendAllInvites.mockResolvedValue({ sent: 1, failed: 0, failures: [] } as any);
    mockExtractGuestEmails.mockImplementation((house: any, guestEmails: any) => ({
      ...house,
      pendingGuestInvites: ["earlier@x.com", ...guestEmails.map((e: string) => e.trim().toLowerCase())],
    }));
  });
  afterEach(() => alertSpy.mockRestore());

  function renderScreen() {
    const navigation: any = { goBack: jest.fn(), navigate: jest.fn() };
    render(<GuestInvites navigation={navigation} />);
    return navigation;
  }

  it("invites only the addresses entered now, not guests already pending", async () => {
    renderScreen();
    await capturedOnSubmit({ guestEmails: ["New@X.com ", "two@x.com"] }, bag());
    expect(sentEmails().sort()).toEqual(["new@x.com", "two@x.com"]);
    expect(mockUpdateHouseMutateAsync).toHaveBeenCalledWith({
      houseId: "house-1",
      values: expect.objectContaining({
        pendingGuestInvites: ["earlier@x.com", "new@x.com", "two@x.com"],
      }),
    });
  });

  it("tells the operator which were not sent and leaves only those in the form", async () => {
    mockSendAllInvites.mockImplementation((async (houses: any) => {
      const [email] = (Object.values(houses)[0] as any).pendingGuestInvites;
      return email === "two@x.com"
        ? { sent: 0, failed: 1, failures: [{ houseId: "house-1", role: "guest" }] }
        : { sent: 1, failed: 0, failures: [] };
    }) as any);
    const navigation = renderScreen();
    const formikBag = bag();
    await capturedOnSubmit({ guestEmails: ["one@x.com", "two@x.com"] }, formikBag);

    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy.mock.calls[0][1]).toMatch(/1 of 2/);
    expect(formikBag.setFieldValue).toHaveBeenCalledWith("guestEmails", ["two@x.com"]);
    expect(navigation.goBack).not.toHaveBeenCalled();
    expect(JSON.stringify(mockLogException.mock.calls)).not.toContain("@x.com");
  });

  it("tells the operator when nothing could be sent", async () => {
    mockSendAllInvites.mockRejectedValue(new Error("email service down"));
    const navigation = renderScreen();
    await capturedOnSubmit({ guestEmails: ["one@x.com"] }, bag());
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(navigation.goBack).not.toHaveBeenCalled();
  });

  it("says nothing extra and goes back when every invitation went", async () => {
    const navigation = renderScreen();
    await capturedOnSubmit({ guestEmails: ["one@x.com"] }, bag());
    expect(alertSpy).not.toHaveBeenCalled();
    expect(navigation.goBack).toHaveBeenCalled();
  });
});

// ─── Keyboard (plan Task 15) ──────────────────────────────────────────────────
describe("GuestInvites keyboard", () => {
  it("puts the invite form and its pinned Send Invites button in the Android resize view", () => {
    const { GuestSetupForm } = require("../../SetupWizards/GuestSetup");
    const { UNSAFE_getByType } = render(
      <GuestInvites navigation={{ goBack: jest.fn(), navigate: jest.fn() } as any} />
    );
    expect(keyboardAncestor(UNSAFE_getByType(GuestSetupForm))).toBe("RatsKeyboardAvoidingView");
  });
});
