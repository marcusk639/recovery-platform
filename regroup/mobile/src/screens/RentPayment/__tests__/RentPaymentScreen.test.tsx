/**
 * RentPaymentScreen Tests
 *
 * Covers:
 * - Balance breakdown (rent, chore fees, total) — guest.rentOwed/choreFees
 *   are integer cents; fixtures below use realistic cent values (e.g. 15000
 *   for $150.00) to match production data, not the pre-fix test values.
 * - "All paid up" empty state when rentOwed = 0
 * - Stripe not connected message when no stripeAccountId
 * - "Pay Now" button drives the real Stripe payment-sheet flow (create
 *   intent → initPaymentSheet → presentPaymentSheet → record payment)
 * - Payment history renders correctly
 * - Loading state for payment history
 * - Error state for payment history
 * - Error banner when payment initiation or Stripe confirmation fails
 * - Success banner after a real confirmed payment
 * - formatCurrency / formatCentsAsCurrency helpers
 */

import React from "react";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Prevent real firebase-setup from executing at import time
// firebase-setup is mapped to __mocks__/firebase-setup.js by moduleNameMapper

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

// Mock context (RatsText needs useTranslation)
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

// Mock ScreenHeader to strip navigation dependency
jest.mock("../../../components/screen-header", () => {
  const { View, Text } = require("react-native");
  return ({ header }: any) => (
    <View testID="screen-header">
      <Text>{header}</Text>
    </View>
  );
});

// Mock RatsIcon
jest.mock("../../../components/rats-icon", () => {
  const { View } = require("react-native");
  return {
    RatsIcon: ({ name, testID }: any) => (
      <View testID={testID ?? `icon-${name}`} />
    ),
  };
});

// Mock RatsLoadingIndicator
jest.mock(
  "../../../components/rats-loading-indicator/rats-loading-indicator",
  () => {
    const { View } = require("react-native");
    return () => <View testID="loading-indicator" />;
  }
);

// ── Payment queries mock ──────────────────────────────────────────────────────
const mockUsePaymentHistory = jest.fn();
const mockInvalidateQueries = jest.fn();

jest.mock("../../../state/queries/paymentQueries", () => ({
  usePaymentHistory: (...args: any[]) => mockUsePaymentHistory(...args),
  paymentKeys: {
    history: (guestId: string) => ["payments", "history", guestId],
    guestBalances: (houseId: string) => ["payments", "guest-balances", houseId],
  },
}));

jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

// ── Payment service mock ──────────────────────────────────────────────────────
const mockCreateRentPaymentIntent = jest.fn();
const mockRecordRentPayment = jest.fn();

jest.mock("../../../services/payments", () => ({
  createRentPaymentIntent: (...args: any[]) =>
    mockCreateRentPaymentIntent(...args),
  recordRentPayment: (...args: any[]) => mockRecordRentPayment(...args),
  paymentIntentIdFromClientSecret: (clientSecret: string) =>
    clientSecret.split("_secret_")[0],
}));

// ── Stripe payment sheet mock ─────────────────────────────────────────────────
const mockInitPaymentSheet = jest.fn();
const mockPresentPaymentSheet = jest.fn();

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

// ─── Imports ──────────────────────────────────────────────────────────────────

import RentPaymentScreen, { formatCurrency } from "../RentPaymentScreen";
import { formatCentsAsCurrency } from "../rentPaymentHelpers";
import { RentPayment } from "../../../services/payments";

// ─── Test data ────────────────────────────────────────────────────────────────

const StripeAccountStatus = {
  NOT_CONNECTED: "not_connected",
  PENDING: "pending",
  ACTIVE: "active",
  RESTRICTED: "restricted",
  DISCONNECTED: "disconnected",
};

// rentOwed/choreFees are integer cents in production — $150.00 is 15000, not
// 150. These fixtures use real cent values so the balance-breakdown and
// payment-amount assertions below reflect actual production data shapes.
const baseGuest = {
  id: "guest-1",
  houseId: "house-1",
  rentOwed: 15000,
  choreFees: 0,
  firstName: "John",
  lastName: "Doe",
} as any;

const baseHouse = {
  id: "house-1",
  stripeAccountId: "acct_test",
  stripeStatus: StripeAccountStatus.ACTIVE,
  monthlyRent: 650,
  weeklyRent: 0,
  rentFrequency: "monthly",
} as any;

const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
} as any;

// Default happy-path setup
function setupDefaultMocks() {
  mockUsePaymentHistory.mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  });
  mockCreateRentPaymentIntent.mockResolvedValue({
    clientSecret: "pi_test123_secret_abc",
  });
  mockInitPaymentSheet.mockResolvedValue({});
  mockPresentPaymentSheet.mockResolvedValue({});
  mockRecordRentPayment.mockResolvedValue({});
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function renderScreen(guest = baseGuest, house = baseHouse) {
  return render(
    <RentPaymentScreen
      navigation={mockNavigation}
      guest={guest}
      house={house}
    />
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("formatCurrency", () => {
  it("formats an integer as dollars with two decimal places", () => {
    expect(formatCurrency(150)).toBe("$150.00");
  });

  it("formats zero", () => {
    expect(formatCurrency(0)).toBe("$0.00");
  });

  it("formats a decimal amount", () => {
    expect(formatCurrency(12.5)).toBe("$12.50");
  });

  it("treats negative amounts as absolute value", () => {
    expect(formatCurrency(-50)).toBe("$50.00");
  });
});

describe("formatCentsAsCurrency", () => {
  it("converts cents to dollars before formatting", () => {
    expect(formatCentsAsCurrency(15000)).toBe("$150.00");
  });

  it("formats zero", () => {
    expect(formatCentsAsCurrency(0)).toBe("$0.00");
  });

  it("does not double-convert an already-small cents value", () => {
    expect(formatCentsAsCurrency(150)).toBe("$1.50");
  });
});

describe("RentPaymentScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaultMocks();
  });

  // ── Stripe not connected ────────────────────────────────────────────────────

  it("shows stripe-not-connected message when no stripeAccountId", () => {
    const houseWithoutStripe = {
      ...baseHouse,
      stripeAccountId: undefined,
      stripeStatus: StripeAccountStatus.NOT_CONNECTED,
    };
    const { getByTestId } = renderScreen(baseGuest, houseWithoutStripe);
    expect(getByTestId("stripe-not-connected")).toBeTruthy();
  });

  it("shows stripe-not-connected when stripeStatus is not ACTIVE", () => {
    const houseNotActive = {
      ...baseHouse,
      stripeAccountId: "acct_test",
      stripeStatus: StripeAccountStatus.PENDING,
    };
    const { getByTestId } = renderScreen(baseGuest, houseNotActive);
    expect(getByTestId("stripe-not-connected")).toBeTruthy();
  });

  // ── All paid up state ────────────────────────────────────────────────────

  it('shows "all paid up" state when rentOwed is 0 and choreFees is 0', () => {
    const paidGuest = { ...baseGuest, rentOwed: 0, choreFees: 0 };
    const { getByTestId } = renderScreen(paidGuest);
    expect(getByTestId("all-paid-up")).toBeTruthy();
  });

  it("does not show pay button when all paid up", () => {
    const paidGuest = { ...baseGuest, rentOwed: 0, choreFees: 0 };
    const { queryByTestId } = renderScreen(paidGuest);
    expect(queryByTestId("pay-now-button")).toBeNull();
  });

  // ── Balance breakdown ────────────────────────────────────────────────────

  it("shows balance due from rentOwed", () => {
    const { getByTestId } = renderScreen();
    expect(getByTestId("balance-due-label")).toBeTruthy();
  });

  it("shows chore fees line when choreFees > 0", () => {
    const guestWithFees = { ...baseGuest, rentOwed: 10000, choreFees: 2500 };
    const { getByTestId } = renderScreen(guestWithFees);
    expect(getByTestId("chore-fees-label")).toBeTruthy();
  });

  it("does not show chore fees line when choreFees is 0", () => {
    const { queryByTestId } = renderScreen();
    expect(queryByTestId("chore-fees-label")).toBeNull();
  });

  it("shows total due label", () => {
    const { getByTestId } = renderScreen();
    expect(getByTestId("total-due-label")).toBeTruthy();
  });

  it("shows the monthly rent amount when rentFrequency is monthly", () => {
    const { getByTestId } = renderScreen();
    expect(getByTestId("rent-amount-label")).toBeTruthy();
  });

  it("does not show monthly rent row when monthlyRent is 0", () => {
    const houseNoRent = { ...baseHouse, monthlyRent: 0 };
    const { queryByTestId } = renderScreen(baseGuest, houseNoRent);
    expect(queryByTestId("rent-amount-label")).toBeNull();
  });

  // ── Pay Now button ─────────────────────────────────────────────────────────

  it("renders Pay Now button when rentOwed > 0", () => {
    const { getByTestId } = renderScreen();
    expect(getByTestId("pay-now-button")).toBeTruthy();
  });

  it("creates the payment intent with the real amount in cents (no double-conversion)", async () => {
    const { getByTestId } = renderScreen();
    await act(async () => {
      fireEvent.press(getByTestId("pay-now-button"));
    });

    // baseGuest.rentOwed is 15000 (already cents) — must be passed through
    // as-is, not multiplied by 100 again.
    expect(mockCreateRentPaymentIntent).toHaveBeenCalledWith({
      guestId: "guest-1",
      houseId: "house-1",
      amountInCents: 15000,
    });
  });

  it("presents the Stripe payment sheet and records the payment on success", async () => {
    const { getByTestId, queryByTestId } = renderScreen();
    await act(async () => {
      fireEvent.press(getByTestId("pay-now-button"));
    });

    expect(mockInitPaymentSheet).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentIntentClientSecret: "pi_test123_secret_abc",
      })
    );
    expect(mockPresentPaymentSheet).toHaveBeenCalled();
    expect(mockRecordRentPayment).toHaveBeenCalledWith(
      "guest-1",
      "house-1",
      15000,
      "Monthly Rent",
      "pi_test123" // extracted from the clientSecret, not undefined
    );
    expect(queryByTestId("payment-success-banner")).toBeTruthy();
    // Regression coverage for 2026-07-07: the Pay Now CTA used to stay
    // mounted and tappable right beside the success banner (gated only on
    // !allPaidUp, which reflects a stale balance until the parent
    // refetches) — a re-tap would create a fresh, non-idempotent
    // PaymentIntent. It must disappear once payment succeeds.
    expect(queryByTestId("pay-now-button")).toBeNull();
  });

  it("shows error banner when creating the payment intent fails", async () => {
    mockCreateRentPaymentIntent.mockRejectedValueOnce(
      new Error("network error")
    );

    const { getByTestId } = renderScreen();
    await act(async () => {
      fireEvent.press(getByTestId("pay-now-button"));
    });

    expect(getByTestId("payment-error-banner")).toBeTruthy();
    expect(mockPresentPaymentSheet).not.toHaveBeenCalled();
  });

  it("shows error banner when the Stripe payment sheet is declined", async () => {
    mockPresentPaymentSheet.mockResolvedValueOnce({
      error: { code: "Failed", message: "Your card was declined." },
    });

    const { getByTestId, queryByTestId } = renderScreen();
    await act(async () => {
      fireEvent.press(getByTestId("pay-now-button"));
    });

    expect(getByTestId("payment-error-banner")).toBeTruthy();
    expect(mockRecordRentPayment).not.toHaveBeenCalled();
    expect(queryByTestId("payment-success-banner")).toBeNull();
  });

  it("shows neither error nor success banner when the user cancels the payment sheet", async () => {
    mockPresentPaymentSheet.mockResolvedValueOnce({
      error: { code: "Canceled", message: "" },
    });

    const { getByTestId, queryByTestId } = renderScreen();
    await act(async () => {
      fireEvent.press(getByTestId("pay-now-button"));
    });

    expect(queryByTestId("payment-error-banner")).toBeNull();
    expect(queryByTestId("payment-success-banner")).toBeNull();
  });

  // ── Payment history ────────────────────────────────────────────────────────

  it("shows loading indicator while payment history loads", () => {
    mockUsePaymentHistory.mockReturnValueOnce({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: jest.fn(),
    });

    const { getByTestId } = renderScreen();
    expect(getByTestId("payment-history-loading")).toBeTruthy();
  });

  it("shows error state when payment history fails to load", () => {
    mockUsePaymentHistory.mockReturnValueOnce({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: jest.fn(),
    });

    const { getByTestId } = renderScreen();
    expect(getByTestId("payment-history-error")).toBeTruthy();
  });

  it("shows empty history message when no payments exist", () => {
    const { getByTestId } = renderScreen();
    expect(getByTestId("payment-history-empty")).toBeTruthy();
  });

  it("renders payment history rows when payments exist", () => {
    const payments: RentPayment[] = [
      {
        id: "p1",
        guestId: "guest-1",
        houseId: "house-1",
        amount: 15000, // $150.00 in cents
        status: "succeeded",
        createdAt: "2026-01-01T00:00:00.000Z",
        description: "Monthly Rent",
      },
      {
        id: "p2",
        guestId: "guest-1",
        houseId: "house-1",
        amount: 2500, // $25.00 in cents
        status: "pending",
        createdAt: "2026-02-01T00:00:00.000Z",
        description: "Chore Fee",
      },
    ];
    mockUsePaymentHistory.mockReturnValueOnce({
      data: payments,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    const { getAllByTestId } = renderScreen();
    const rows = getAllByTestId("payment-history-row");
    expect(rows).toHaveLength(2);
  });

  it("shows correct status badge for succeeded payment", () => {
    const payments: RentPayment[] = [
      {
        id: "p1",
        guestId: "guest-1",
        houseId: "house-1",
        amount: 15000, // $150.00 in cents
        status: "succeeded",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    mockUsePaymentHistory.mockReturnValueOnce({
      data: payments,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    const { getByTestId } = renderScreen();
    expect(getByTestId("payment-status-badge-succeeded")).toBeTruthy();
  });

  it("renders the rent payment screen container", () => {
    const { getByTestId } = renderScreen();
    expect(getByTestId("rent-payment-screen")).toBeTruthy();
  });

  it("renders the balance card", () => {
    const { getByTestId } = renderScreen();
    expect(getByTestId("balance-card")).toBeTruthy();
  });
});
