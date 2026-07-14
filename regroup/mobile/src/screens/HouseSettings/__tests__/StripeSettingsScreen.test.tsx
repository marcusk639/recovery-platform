/**
 * StripeSettingsScreen Tests
 *
 * Covers:
 * - Loading state rendering
 * - Status labels for each Stripe account status
 * - User-friendly error messages (not raw API errors)
 * - Requirements display and formatting
 * - Button labels per status
 * - Disconnect confirmation dialog
 */

// ─── useSelectedHouse mock ────────────────────────────────────────────────────
const mockUseSelectedHouse = jest.fn();

jest.mock("../../../hooks/useSelectedHouse", () => ({
  useSelectedHouse: () => mockUseSelectedHouse(),
}));

// ─── @react-navigation/native mock ────────────────────────────────────────────
// Real useFocusEffect defers its callback to a post-commit effect (it fires
// on initial focus and whenever the screen re-focuses). This mock preserves
// that "runs after render, not during it" timing via a real useEffect —
// calling the callback synchronously during render would trigger "state
// update during render" (infinite render loop) for any callback that sets
// state synchronously before its first await, like fetchStatus does. It also
// records the latest callback so tests can invoke it again to simulate the
// screen regaining focus (e.g. after the Stripe Connect onboarding redirect
// returns the user to this screen).
let latestFocusCallback: (() => void) | undefined;
const mockUseFocusEffect = jest.fn((cb: () => void) => {
  latestFocusCallback = cb;
  cb();
});

jest.mock("@react-navigation/native", () => {
  const ReactLib = require("react");
  return {
    useFocusEffect: (cb: any) => {
      ReactLib.useEffect(() => {
        mockUseFocusEffect(cb);
      }, [cb]);
    },
    useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  };
});

import React from "react";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import { Alert } from "react-native";

// Mock the context module to avoid theme provider setup
// useTranslation is needed by RatsText
jest.mock("../../../context", () => ({
  useTheme: () => ({
    theme: {
      primaryColor: "rgb(99,139,250)",
      secondaryColor: "#d2d8ef",
      tertiaryColor: "#969696",
      backgroundColor: "#FAFAFA",
      textColor: "black",
      primaryFontFamily: "Quicksand-Medium",
      secondaryFontFamily: "Quicksand-Medium",
      logoTintColor: "#ffffff",
    },
  }),
  useTranslation: () => ({ t: (key: string) => key }),
}));

// Mock screen header to avoid navigation dependency
jest.mock("../../../components/screen-header", () => {
  const { View, Text } = require("react-native");
  return ({ header }: any) => (
    <View>
      <Text>{header}</Text>
    </View>
  );
});

// Mock the entire House entity and related service chain to avoid
// firestore.collection() being called at module load time
jest.mock("../../../entities/House", () => {
  const StripeAccountStatus = {
    NOT_CONNECTED: "not_connected",
    PENDING: "pending",
    ACTIVE: "active",
    RESTRICTED: "restricted",
    DISCONNECTED: "disconnected",
  };
  return { StripeAccountStatus };
});

jest.mock("../../../services/house", () => ({}));
jest.mock("../../../services/admin", () => ({}));

// Spy on Alert.alert
jest.spyOn(Alert, "alert");

// Mock firebase functions (these are what StripeSettingsScreen actually calls)
const mockGetStatus = jest.fn();
const mockConnectAccount = jest.fn();
const mockDisconnectAccount = jest.fn();

jest.mock("../../../../firebase-setup", () => ({
  functions: {
    httpsCallable: (name: string) => {
      if (name === "getStripeAccountStatus") return mockGetStatus;
      if (name === "connectStripeAccount") return mockConnectAccount;
      if (name === "disconnectStripeAccount") return mockDisconnectAccount;
      return jest.fn();
    },
  },
}));

// Mock Linking
jest.mock("react-native/Libraries/Linking/Linking", () => ({
  openURL: jest.fn(() => Promise.resolve()),
  canOpenURL: jest.fn(() => Promise.resolve(true)),
}));

// Mock useAppSelector to inject house state
const mockUseAppSelector = jest.fn();
jest.mock("../../../state/store", () => ({
  useAppSelector: (selector: any) => mockUseAppSelector(selector),
  useAppDispatch: () => jest.fn(),
}));

import StripeSettingsScreen from "../StripeSettingsScreen";

// Use the locally-imported enum values for test assertions
const StripeAccountStatus = {
  NOT_CONNECTED: "not_connected",
  PENDING: "pending",
  ACTIVE: "active",
  RESTRICTED: "restricted",
  DISCONNECTED: "disconnected",
};

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() } as any;

const setupHouse = (stripeAccountId?: string) => {
  const house = {
    id: "house123",
    name: "Test House",
    stripeAccountId: stripeAccountId ?? undefined,
  };
  mockUseSelectedHouse.mockReturnValue({
    house,
    houseId: house.id,
    isLoading: false,
  });
  mockUseAppSelector.mockImplementation((selector: any) =>
    selector({
      houses: {
        selectedHouse: house,
      },
    }),
  );
};

const renderScreen = () =>
  render(<StripeSettingsScreen navigation={mockNavigation} />);

describe("StripeSettingsScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Alert.alert as jest.Mock).mockClear();
  });

  // -----------------------------------------------------------------------
  // Loading state
  // -----------------------------------------------------------------------
  describe("loading state", () => {
    it("shows a loading indicator while fetching status", () => {
      setupHouse("acct_123");
      // Never resolves
      mockGetStatus.mockReturnValue(new Promise(() => {}));

      const { getByTestId } = renderScreen();
      expect(getByTestId("stripe-loading")).toBeTruthy();
    });

    it("hides the loading indicator after status loads", async () => {
      setupHouse("acct_123");
      mockGetStatus.mockResolvedValue({
        data: {
          status: StripeAccountStatus.ACTIVE,
          chargesEnabled: true,
          payoutsEnabled: true,
          requirements: { currentlyDue: [], pastDue: [] },
        },
      });

      const { queryByTestId } = renderScreen();

      await waitFor(() => {
        expect(queryByTestId("stripe-loading")).toBeNull();
      });
    });
  });

  // -----------------------------------------------------------------------
  // Status labels
  // -----------------------------------------------------------------------
  describe("status labels", () => {
    const statusCases: [string, string][] = [
      [StripeAccountStatus.ACTIVE, "Active"],
      [StripeAccountStatus.PENDING, "Setup In Progress"],
      [StripeAccountStatus.RESTRICTED, "Action Required"],
    ];

    statusCases.forEach(([status, expectedLabel]) => {
      it(`shows "${expectedLabel}" for status ${status}`, async () => {
        setupHouse("acct_123");
        mockGetStatus.mockResolvedValue({
          data: {
            status,
            chargesEnabled: false,
            payoutsEnabled: false,
            requirements: { currentlyDue: [], pastDue: [] },
          },
        });

        const { getByText } = renderScreen();

        await waitFor(() => {
          expect(getByText(expectedLabel)).toBeTruthy();
        });
      });
    });
  });

  // -----------------------------------------------------------------------
  // Error messages (user-friendly translation)
  // -----------------------------------------------------------------------
  describe("error messages", () => {
    it("shows a user-friendly error when the API call fails with a network error", async () => {
      setupHouse("acct_123");
      mockGetStatus.mockRejectedValue(
        new Error("Network request failed: timeout"),
      );

      const { getByText } = renderScreen();

      // friendlyError maps network errors to user-friendly text
      await waitFor(() => {
        expect(
          getByText(/network error.*connection|connection.*try again/i),
        ).toBeTruthy();
      });
    });

    it("shows a user-friendly error when account is not found", async () => {
      setupHouse("acct_123");
      mockGetStatus.mockRejectedValue(new Error("No such account: acct_123"));

      const { getByText } = renderScreen();

      await waitFor(() => {
        expect(getByText(/stripe account|reconnect/i)).toBeTruthy();
      });
    });

    it("does NOT show raw Stripe API error text to the user", async () => {
      setupHouse("acct_123");
      const rawError =
        "FirebaseFunctionsException: INTERNAL: stripe_error_code_xyz_internal_422";
      mockGetStatus.mockRejectedValue(new Error(rawError));

      const { queryByText } = renderScreen();

      await waitFor(() => {
        // The raw codes must not appear in any rendered text
        expect(queryByText(/stripe_error_code_xyz/)).toBeNull();
        expect(queryByText(/FirebaseFunctionsException/)).toBeNull();
      });
    });

    it("shows the error banner View when an error occurs", async () => {
      setupHouse("acct_123");
      mockGetStatus.mockRejectedValue(new Error("Some error"));

      const { getByTestId } = renderScreen();

      await waitFor(() => {
        expect(getByTestId("stripe-error-banner")).toBeTruthy();
      });
    });
  });

  // -----------------------------------------------------------------------
  // Requirements display
  // -----------------------------------------------------------------------
  describe("requirements display", () => {
    it("shows requirements section when currentlyDue is non-empty", async () => {
      setupHouse("acct_123");
      mockGetStatus.mockResolvedValue({
        data: {
          status: StripeAccountStatus.RESTRICTED,
          chargesEnabled: false,
          payoutsEnabled: false,
          requirements: {
            currentlyDue: [
              "individual.dob.day",
              "individual.dob.month",
              "individual.ssn_last_4",
            ],
            pastDue: [],
          },
        },
      });

      const { getByTestId } = renderScreen();

      await waitFor(() => {
        expect(getByTestId("stripe-requirements")).toBeTruthy();
      });
    });

    it("deduplicates date-of-birth requirements into a single label", async () => {
      setupHouse("acct_123");
      mockGetStatus.mockResolvedValue({
        data: {
          status: StripeAccountStatus.RESTRICTED,
          chargesEnabled: false,
          payoutsEnabled: false,
          requirements: {
            currentlyDue: [
              "individual.dob.day",
              "individual.dob.month",
              "individual.dob.year",
            ],
            pastDue: [],
          },
        },
      });

      const { queryAllByText } = renderScreen();

      await waitFor(() => {
        const dobItems = queryAllByText("• Date of birth");
        expect(dobItems).toHaveLength(1);
      });
    });

    it("hides requirements section when currentlyDue is empty", async () => {
      setupHouse("acct_123");
      mockGetStatus.mockResolvedValue({
        data: {
          status: StripeAccountStatus.ACTIVE,
          chargesEnabled: true,
          payoutsEnabled: true,
          requirements: { currentlyDue: [], pastDue: [] },
        },
      });

      const { queryByTestId } = renderScreen();

      await waitFor(() => {
        expect(queryByTestId("stripe-requirements")).toBeNull();
      });
    });
  });

  // -----------------------------------------------------------------------
  // Button labels
  // -----------------------------------------------------------------------
  describe("button labels", () => {
    it("shows connect button when not connected", async () => {
      setupHouse(undefined);

      const { getByTestId } = renderScreen();

      await waitFor(() => {
        expect(getByTestId("stripe-connect-button")).toBeTruthy();
      });
    });

    it("shows primary CTA and disconnect button for connected/active accounts", async () => {
      setupHouse("acct_123");
      mockGetStatus.mockResolvedValue({
        data: {
          status: StripeAccountStatus.ACTIVE,
          chargesEnabled: true,
          payoutsEnabled: true,
          requirements: { currentlyDue: [], pastDue: [] },
        },
      });

      const { getByTestId } = renderScreen();

      await waitFor(() => {
        expect(getByTestId("stripe-primary-cta")).toBeTruthy();
        expect(getByTestId("stripe-disconnect-button")).toBeTruthy();
      });
    });

    it("shows primary CTA for pending status", async () => {
      setupHouse("acct_123");
      mockGetStatus.mockResolvedValue({
        data: {
          status: StripeAccountStatus.PENDING,
          chargesEnabled: false,
          payoutsEnabled: false,
          requirements: { currentlyDue: [], pastDue: [] },
        },
      });

      const { getByTestId } = renderScreen();

      await waitFor(() => {
        expect(getByTestId("stripe-primary-cta")).toBeTruthy();
      });
    });

    it("shows primary CTA for restricted status", async () => {
      setupHouse("acct_123");
      mockGetStatus.mockResolvedValue({
        data: {
          status: StripeAccountStatus.RESTRICTED,
          chargesEnabled: false,
          payoutsEnabled: false,
          requirements: {
            currentlyDue: ["individual.first_name"],
            pastDue: [],
          },
        },
      });

      const { getByTestId } = renderScreen();

      await waitFor(() => {
        expect(getByTestId("stripe-primary-cta")).toBeTruthy();
      });
    });
  });

  // -----------------------------------------------------------------------
  // Disconnect confirmation
  // -----------------------------------------------------------------------
  describe("disconnect confirmation", () => {
    it("shows a confirmation Alert before disconnecting", async () => {
      setupHouse("acct_123");
      mockGetStatus.mockResolvedValue({
        data: {
          status: StripeAccountStatus.ACTIVE,
          chargesEnabled: true,
          payoutsEnabled: true,
          requirements: { currentlyDue: [], pastDue: [] },
        },
      });

      const { getByTestId } = renderScreen();

      await waitFor(() => {
        expect(getByTestId("stripe-disconnect-button")).toBeTruthy();
      });

      fireEvent.press(getByTestId("stripe-disconnect-button"));

      expect(Alert.alert).toHaveBeenCalledWith(
        expect.stringMatching(/disconnect/i),
        expect.any(String),
        expect.arrayContaining([
          expect.objectContaining({ text: "Cancel" }),
          expect.objectContaining({ text: "Disconnect", style: "destructive" }),
        ]),
      );
    });

    it("does NOT immediately call disconnect API when button is pressed", async () => {
      setupHouse("acct_123");
      mockGetStatus.mockResolvedValue({
        data: {
          status: StripeAccountStatus.ACTIVE,
          chargesEnabled: true,
          payoutsEnabled: true,
          requirements: { currentlyDue: [], pastDue: [] },
        },
      });

      const { getByTestId } = renderScreen();

      await waitFor(() => {
        expect(getByTestId("stripe-disconnect-button")).toBeTruthy();
      });

      fireEvent.press(getByTestId("stripe-disconnect-button"));

      // Disconnect API should NOT have been called — user must confirm via Alert
      expect(mockDisconnectAccount).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Connecting loading state
  // -----------------------------------------------------------------------
  describe("connecting loading state", () => {
    it("shows a loading indicator while connecting", async () => {
      setupHouse(undefined);
      // Connect never resolves
      mockConnectAccount.mockReturnValue(new Promise(() => {}));

      const { getByTestId, queryByTestId } = renderScreen();

      await waitFor(() => {
        expect(getByTestId("stripe-connect-button")).toBeTruthy();
      });

      fireEvent.press(getByTestId("stripe-connect-button"));

      await waitFor(() => {
        expect(getByTestId("stripe-connecting-loading")).toBeTruthy();
        expect(queryByTestId("stripe-connect-button")).toBeNull();
      });
    });
  });

  // -----------------------------------------------------------------------
  // Screen focus refresh
  // -----------------------------------------------------------------------
  // Regression coverage: after a user completes Stripe Connect onboarding
  // (an external browser redirect) and returns to this screen, it must
  // refetch account status instead of showing stale onboarding-incomplete
  // state.
  describe("screen focus refresh", () => {
    it("refetches Stripe account status when the screen regains focus", async () => {
      setupHouse("acct_123");
      mockGetStatus.mockResolvedValue({
        data: {
          status: StripeAccountStatus.PENDING,
          chargesEnabled: false,
          payoutsEnabled: false,
          requirements: { currentlyDue: [], pastDue: [] },
        },
      });

      renderScreen();

      await waitFor(() => {
        expect(mockGetStatus).toHaveBeenCalledTimes(1);
      });

      // Simulate the screen regaining focus (e.g. returning from the Stripe
      // Connect onboarding browser redirect).
      await act(async () => {
        latestFocusCallback?.();
      });

      await waitFor(() => {
        expect(mockGetStatus).toHaveBeenCalledTimes(2);
      });
    });

    it("shows updated status after refetching on focus", async () => {
      setupHouse("acct_123");
      mockGetStatus.mockResolvedValueOnce({
        data: {
          status: StripeAccountStatus.PENDING,
          chargesEnabled: false,
          payoutsEnabled: false,
          requirements: { currentlyDue: [], pastDue: [] },
        },
      });

      const { getByText } = renderScreen();

      await waitFor(() => {
        expect(getByText("Setup In Progress")).toBeTruthy();
      });

      // Onboarding completed — the status is now ACTIVE server-side.
      mockGetStatus.mockResolvedValueOnce({
        data: {
          status: StripeAccountStatus.ACTIVE,
          chargesEnabled: true,
          payoutsEnabled: true,
          requirements: { currentlyDue: [], pastDue: [] },
        },
      });

      await act(async () => {
        latestFocusCallback?.();
      });

      await waitFor(() => {
        expect(getByText("Active")).toBeTruthy();
      });
    });
  });
});
