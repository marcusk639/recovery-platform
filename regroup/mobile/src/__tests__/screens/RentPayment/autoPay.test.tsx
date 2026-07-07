/**
 * RentPaymentScreen — auto-pay toggle tests
 *
 * Verifies that the Switch component for enabling auto-pay renders and
 * toggles its value correctly.
 */

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock("../../../entities/House", () => ({
  StripeAccountStatus: {
    NOT_CONNECTED: "not_connected",
    PENDING: "pending",
    ACTIVE: "active",
    RESTRICTED: "restricted",
    DISCONNECTED: "disconnected",
  },
}));

jest.mock("../../../services/house", () => ({}));

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

jest.mock("../../../components/screen-header", () => {
  const { View, Text } = require("react-native");
  return ({ header }: any) => (
    <View testID="screen-header">
      <Text>{header}</Text>
    </View>
  );
});

jest.mock("../../../components/rats-icon", () => {
  const { View } = require("react-native");
  return {
    RatsIcon: ({ name, testID }: any) => (
      <View testID={testID ?? `icon-${name}`} />
    ),
  };
});

// Mock the query hooks
jest.mock("../../../state/queries/paymentQueries", () => ({
  usePaymentHistory: jest.fn().mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
  useCreateRentPayment: jest.fn().mockReturnValue({
    mutateAsync: jest
      .fn()
      .mockResolvedValue({ paymentUrl: null, paymentIntentId: "pi_test" }),
    isPending: false,
  }),
}));

// paymentService and the Stripe payment sheet are real, unmocked modules
// otherwise — Step 1-3 of handlePayNow (createRentPaymentIntent,
// initPaymentSheet, presentPaymentSheet) would run for real (or silently
// no-op/error under Jest's lack of a native Stripe bridge) and return early
// before ever reaching the auto-pay Firestore update this suite tests.
const mockCreateRentPaymentIntent = jest.fn().mockResolvedValue({
  clientSecret: "pi_test_secret_abc",
  paymentIntentId: "pi_test",
});
const mockRecordRentPayment = jest.fn().mockResolvedValue({});
jest.mock("../../../services/payments", () => ({
  createRentPaymentIntent: (...args: any[]) =>
    mockCreateRentPaymentIntent(...args),
  recordRentPayment: (...args: any[]) => mockRecordRentPayment(...args),
  paymentIntentIdFromClientSecret: (clientSecret: string) =>
    clientSecret.split("_secret_")[0],
}));

const mockInitPaymentSheet = jest.fn().mockResolvedValue({});
const mockPresentPaymentSheet = jest.fn().mockResolvedValue({});
jest.mock("@stripe/stripe-react-native", () => ({
  usePaymentSheet: () => ({
    initPaymentSheet: (...args: any[]) => mockInitPaymentSheet(...args),
    presentPaymentSheet: (...args: any[]) => mockPresentPaymentSheet(...args),
    loading: false,
  }),
}));

jest.mock("../../../services/notifications/rentReminder", () => ({
  cancelRentReminder: jest.fn(),
}));

// Mock Firebase firestore
const mockUpdate = jest.fn().mockResolvedValue(undefined);
const mockDoc = jest.fn().mockReturnValue({ update: mockUpdate });
const mockCollection = jest.fn().mockReturnValue({ doc: mockDoc });
jest.mock("@react-native-firebase/firestore", () => {
  return jest.fn(() => ({ collection: mockCollection }));
});

// ─── Imports ──────────────────────────────────────────────────────────────────

import RentPaymentScreen from "../../../screens/RentPayment/RentPaymentScreen";

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() } as any;
const mockGuest = {
  id: "guest_1",
  firstName: "John",
  lastName: "Doe",
  displayName: "John Doe",
  rentOwed: 100,
  choreFees: 0,
  stripeCustomerId: "cus_test",
  autoPayEnabled: false,
} as any;
const mockHouse = {
  id: "house_1",
  stripeStatus: "active",
  stripeAccountId: "acct_test",
  rentFrequency: "monthly",
  monthlyRent: 800,
  weeklyRent: 0,
} as any;

// RentPaymentScreen calls useQueryClient() (via usePaymentHistory) — needs a
// real provider in the tree, not just a mocked hook, since useQueryClient()
// itself isn't mocked.
function renderScreen(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

describe("RentPaymentScreen — auto-pay toggle", () => {
  beforeEach(() => {
    mockUpdate.mockClear();
    mockDoc.mockClear();
    mockCollection.mockClear();
  });

  it("renders the auto-pay switch", () => {
    const { getByTestId } = renderScreen(
      <RentPaymentScreen
        navigation={mockNavigation}
        guest={mockGuest}
        house={mockHouse}
      />
    );
    expect(getByTestId("auto-pay-switch")).toBeTruthy();
  });

  it("toggles saveCard state when switch is pressed", () => {
    const { getByTestId } = renderScreen(
      <RentPaymentScreen
        navigation={mockNavigation}
        guest={mockGuest}
        house={mockHouse}
      />
    );
    const toggle = getByTestId("auto-pay-switch");
    expect(toggle.props.value).toBe(false);
    fireEvent(toggle, "valueChange", true);
    expect(toggle.props.value).toBe(true);
  });

  it("initializes the switch from guest.autoPayEnabled when true", () => {
    const guestWithAutoPay = { ...mockGuest, autoPayEnabled: true };
    const { getByTestId } = renderScreen(
      <RentPaymentScreen
        navigation={mockNavigation}
        guest={guestWithAutoPay}
        house={mockHouse}
      />
    );
    const toggle = getByTestId("auto-pay-switch");
    expect(toggle.props.value).toBe(true);
  });

  it("writes the actual saveCard value to Firestore on Pay Now", async () => {
    // Guest currently has autoPay enabled — toggle it OFF then pay
    const guestWithAutoPay = { ...mockGuest, autoPayEnabled: true };
    const { getByTestId } = renderScreen(
      <RentPaymentScreen
        navigation={mockNavigation}
        guest={guestWithAutoPay}
        house={mockHouse}
      />
    );
    const toggle = getByTestId("auto-pay-switch");
    expect(toggle.props.value).toBe(true);
    fireEvent(toggle, "valueChange", false);
    expect(toggle.props.value).toBe(false);

    fireEvent.press(getByTestId("pay-now-button"));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith({ autoPayEnabled: false });
    });
  });
});
