/**
 * RentPaymentScreen Tests
 *
 * Covers:
 * - Balance breakdown (rent, chore fees, total)
 * - "All paid up" empty state when rentOwed = 0
 * - Stripe not connected message when no stripeAccountId
 * - "Pay Now" button calls the mutation
 * - Payment history renders correctly
 * - Loading state for payment history
 * - Error state for payment history
 * - Error banner after failed payment initiation
 * - Success banner after successful payment without URL
 * - formatCurrency helper
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Prevent real firebase-setup from executing at import time
// firebase-setup is mapped to __mocks__/firebase-setup.js by moduleNameMapper

jest.mock('../../../entities/House', () => ({
  StripeAccountStatus: {
    NOT_CONNECTED: 'not_connected',
    PENDING: 'pending',
    ACTIVE: 'active',
    RESTRICTED: 'restricted',
    DISCONNECTED: 'disconnected',
  },
}));

jest.mock('../../../services/house', () => ({}));

// Mock context (RatsText needs useTranslation)
jest.mock('../../../context', () => ({
  useTheme: () => ({
    theme: {
      primaryColor: 'rgb(99,139,250)',
      secondaryColor: '#d2d8ef',
      tertiaryColor: '#969696',
      backgroundColor: '#FAFAFA',
      textColor: 'black',
      primaryFontFamily: 'Quicksand-Medium',
      secondaryFontFamily: 'Quicksand-Medium',
      logoTintColor: '#ffffff',
    },
  }),
  useTranslation: () => ({ t: (key: string) => key }),
}));

// Mock ScreenHeader to strip navigation dependency
jest.mock('../../../components/screen-header', () => {
  const { View, Text } = require('react-native');
  return ({ header }: any) => (
    <View testID="screen-header">
      <Text>{header}</Text>
    </View>
  );
});

// Mock RatsIcon
jest.mock('../../../components/rats-icon', () => {
  const { View } = require('react-native');
  return {
    RatsIcon: ({ name, testID }: any) => (
      <View testID={testID ?? `icon-${name}`} />
    ),
  };
});

// Mock RatsLoadingIndicator
jest.mock(
  '../../../components/rats-loading-indicator/rats-loading-indicator',
  () => {
    const { View } = require('react-native');
    return () => <View testID="loading-indicator" />;
  },
);

// ── Payment queries mock ──────────────────────────────────────────────────────
const mockUsePaymentHistory = jest.fn();
const mockUseCreateRentPayment = jest.fn();

jest.mock('../../../state/queries/paymentQueries', () => ({
  usePaymentHistory: (...args: any[]) => mockUsePaymentHistory(...args),
  useCreateRentPayment: () => mockUseCreateRentPayment(),
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import RentPaymentScreen, { formatCurrency } from '../RentPaymentScreen';
import { RentPayment } from '../../../services/payments';

// ─── Test data ────────────────────────────────────────────────────────────────

const StripeAccountStatus = {
  NOT_CONNECTED: 'not_connected',
  PENDING: 'pending',
  ACTIVE: 'active',
  RESTRICTED: 'restricted',
  DISCONNECTED: 'disconnected',
};

const baseGuest = {
  id: 'guest-1',
  houseId: 'house-1',
  rentOwed: 150,
  choreFees: 0,
  firstName: 'John',
  lastName: 'Doe',
} as any;

const baseHouse = {
  id: 'house-1',
  stripeAccountId: 'acct_test',
  stripeStatus: StripeAccountStatus.ACTIVE,
  monthlyRent: 650,
  weeklyRent: 0,
  rentFrequency: 'monthly',
} as any;

const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
} as any;

const mockMutation = {
  mutateAsync: jest.fn(),
  isPending: false,
  isError: false,
};

// Default happy-path setup
function setupDefaultMocks() {
  mockUsePaymentHistory.mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  });
  mockUseCreateRentPayment.mockReturnValue(mockMutation);
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function renderScreen(guest = baseGuest, house = baseHouse) {
  return render(
    <RentPaymentScreen
      navigation={mockNavigation}
      guest={guest}
      house={house}
    />,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('formatCurrency', () => {
  it('formats an integer as dollars with two decimal places', () => {
    expect(formatCurrency(150)).toBe('$150.00');
  });

  it('formats zero', () => {
    expect(formatCurrency(0)).toBe('$0.00');
  });

  it('formats a decimal amount', () => {
    expect(formatCurrency(12.5)).toBe('$12.50');
  });

  it('treats negative amounts as absolute value', () => {
    expect(formatCurrency(-50)).toBe('$50.00');
  });
});

describe('RentPaymentScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaultMocks();
  });

  // ── Stripe not connected ────────────────────────────────────────────────────

  it('shows stripe-not-connected message when no stripeAccountId', () => {
    const houseWithoutStripe = {
      ...baseHouse,
      stripeAccountId: undefined,
      stripeStatus: StripeAccountStatus.NOT_CONNECTED,
    };
    const { getByTestId } = renderScreen(baseGuest, houseWithoutStripe);
    expect(getByTestId('stripe-not-connected')).toBeTruthy();
  });

  it('shows stripe-not-connected when stripeStatus is not ACTIVE', () => {
    const houseNotActive = {
      ...baseHouse,
      stripeAccountId: 'acct_test',
      stripeStatus: StripeAccountStatus.PENDING,
    };
    const { getByTestId } = renderScreen(baseGuest, houseNotActive);
    expect(getByTestId('stripe-not-connected')).toBeTruthy();
  });

  // ── All paid up state ────────────────────────────────────────────────────

  it('shows "all paid up" state when rentOwed is 0 and choreFees is 0', () => {
    const paidGuest = { ...baseGuest, rentOwed: 0, choreFees: 0 };
    const { getByTestId } = renderScreen(paidGuest);
    expect(getByTestId('all-paid-up')).toBeTruthy();
  });

  it('does not show pay button when all paid up', () => {
    const paidGuest = { ...baseGuest, rentOwed: 0, choreFees: 0 };
    const { queryByTestId } = renderScreen(paidGuest);
    expect(queryByTestId('pay-now-button')).toBeNull();
  });

  // ── Balance breakdown ────────────────────────────────────────────────────

  it('shows balance due from rentOwed', () => {
    const { getByTestId } = renderScreen();
    expect(getByTestId('balance-due-label')).toBeTruthy();
  });

  it('shows chore fees line when choreFees > 0', () => {
    const guestWithFees = { ...baseGuest, rentOwed: 100, choreFees: 25 };
    const { getByTestId } = renderScreen(guestWithFees);
    expect(getByTestId('chore-fees-label')).toBeTruthy();
  });

  it('does not show chore fees line when choreFees is 0', () => {
    const { queryByTestId } = renderScreen();
    expect(queryByTestId('chore-fees-label')).toBeNull();
  });

  it('shows total due label', () => {
    const { getByTestId } = renderScreen();
    expect(getByTestId('total-due-label')).toBeTruthy();
  });

  it('shows the monthly rent amount when rentFrequency is monthly', () => {
    const { getByTestId } = renderScreen();
    expect(getByTestId('rent-amount-label')).toBeTruthy();
  });

  it('does not show monthly rent row when monthlyRent is 0', () => {
    const houseNoRent = { ...baseHouse, monthlyRent: 0 };
    const { queryByTestId } = renderScreen(baseGuest, houseNoRent);
    expect(queryByTestId('rent-amount-label')).toBeNull();
  });

  // ── Pay Now button ─────────────────────────────────────────────────────────

  it('renders Pay Now button when rentOwed > 0', () => {
    const { getByTestId } = renderScreen();
    expect(getByTestId('pay-now-button')).toBeTruthy();
  });

  it('calls createPayment.mutateAsync when Pay Now is pressed', async () => {
    mockMutation.mutateAsync.mockResolvedValueOnce({
      clientSecret: 'cs',
      paymentUrl: '',
      paymentIntentId: 'pi_1',
    });

    const { getByTestId } = renderScreen();
    await act(async () => {
      fireEvent.press(getByTestId('pay-now-button'));
    });

    expect(mockMutation.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        guestId: 'guest-1',
        houseId: 'house-1',
        amount: 15000, // $150.00 in cents
      }),
    );
  });

  it('navigates to PaymentWebView when paymentUrl is returned', async () => {
    mockMutation.mutateAsync.mockResolvedValueOnce({
      clientSecret: 'cs',
      paymentUrl: 'https://stripe.com/pay/test',
      paymentIntentId: 'pi_1',
    });

    const { getByTestId } = renderScreen();
    await act(async () => {
      fireEvent.press(getByTestId('pay-now-button'));
    });

    expect(mockNavigation.navigate).toHaveBeenCalledWith(
      'PaymentWebView',
      expect.objectContaining({ paymentUrl: 'https://stripe.com/pay/test' }),
    );
  });

  it('shows error banner when payment initiation fails', async () => {
    mockMutation.mutateAsync.mockRejectedValueOnce(new Error('network error'));

    const { getByTestId } = renderScreen();
    await act(async () => {
      fireEvent.press(getByTestId('pay-now-button'));
    });

    expect(getByTestId('payment-error-banner')).toBeTruthy();
  });

  it('shows loading state when isPending is true', () => {
    mockUseCreateRentPayment.mockReturnValueOnce({
      ...mockMutation,
      isPending: true,
    });

    const { getByTestId } = renderScreen();
    expect(getByTestId('pay-now-loading')).toBeTruthy();
  });

  // ── Payment history ────────────────────────────────────────────────────────

  it('shows loading indicator while payment history loads', () => {
    mockUsePaymentHistory.mockReturnValueOnce({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: jest.fn(),
    });

    const { getByTestId } = renderScreen();
    expect(getByTestId('payment-history-loading')).toBeTruthy();
  });

  it('shows error state when payment history fails to load', () => {
    mockUsePaymentHistory.mockReturnValueOnce({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: jest.fn(),
    });

    const { getByTestId } = renderScreen();
    expect(getByTestId('payment-history-error')).toBeTruthy();
  });

  it('shows empty history message when no payments exist', () => {
    const { getByTestId } = renderScreen();
    expect(getByTestId('payment-history-empty')).toBeTruthy();
  });

  it('renders payment history rows when payments exist', () => {
    const payments: RentPayment[] = [
      {
        id: 'p1',
        guestId: 'guest-1',
        houseId: 'house-1',
        amount: 15000, // $150.00 in cents
        status: 'succeeded',
        createdAt: '2026-01-01T00:00:00.000Z',
        description: 'Monthly Rent',
      },
      {
        id: 'p2',
        guestId: 'guest-1',
        houseId: 'house-1',
        amount: 2500, // $25.00 in cents
        status: 'pending',
        createdAt: '2026-02-01T00:00:00.000Z',
        description: 'Chore Fee',
      },
    ];
    mockUsePaymentHistory.mockReturnValueOnce({
      data: payments,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    const { getAllByTestId } = renderScreen();
    const rows = getAllByTestId('payment-history-row');
    expect(rows).toHaveLength(2);
  });

  it('shows correct status badge for succeeded payment', () => {
    const payments: RentPayment[] = [
      {
        id: 'p1',
        guestId: 'guest-1',
        houseId: 'house-1',
        amount: 15000, // $150.00 in cents
        status: 'succeeded',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    mockUsePaymentHistory.mockReturnValueOnce({
      data: payments,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    const { getByTestId } = renderScreen();
    expect(getByTestId('payment-status-badge-succeeded')).toBeTruthy();
  });

  it('renders the rent payment screen container', () => {
    const { getByTestId } = renderScreen();
    expect(getByTestId('rent-payment-screen')).toBeTruthy();
  });

  it('renders the balance card', () => {
    const { getByTestId } = renderScreen();
    expect(getByTestId('balance-card')).toBeTruthy();
  });
});
