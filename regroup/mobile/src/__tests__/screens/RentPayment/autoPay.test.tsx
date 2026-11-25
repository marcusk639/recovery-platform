/**
 * RentPaymentScreen — no auto-pay (launch plan M7)
 *
 * The screen used to offer an "Enable auto-pay" switch and save
 * guests.autoPayEnabled, promising "Your balance will be automatically charged
 * when due." Nothing can make that charge: no code saves a resident's card
 * (nothing writes guests.stripeCustomerId) and updatePaymentInfo has no app
 * caller. These cases pin that the screen neither offers nor records it.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ─── Mocks ────────────────────────────────────────────────────────────────────

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

jest.mock('../../../components/screen-header', () => {
  const { View, Text } = require('react-native');
  return ({ header }: any) => (
    <View testID="screen-header">
      <Text>{header}</Text>
    </View>
  );
});

jest.mock('../../../components/rats-icon', () => {
  const { View } = require('react-native');
  return {
    RatsIcon: ({ name, testID }: any) => <View testID={testID ?? `icon-${name}`} />,
  };
});

// Mock the query hooks
jest.mock('../../../state/queries/paymentQueries', () => ({
  usePaymentHistory: jest.fn().mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
  useCreateRentPayment: jest.fn().mockReturnValue({
    mutateAsync: jest.fn().mockResolvedValue({ paymentUrl: null, paymentIntentId: 'pi_test' }),
    isPending: false,
  }),
}));

// paymentService and the Stripe payment sheet are real, unmocked modules
// otherwise — Step 1-3 of handlePayNow (createRentPaymentIntent,
// initPaymentSheet, presentPaymentSheet) would run for real (or silently
// no-op/error under Jest's lack of a native Stripe bridge) and return early
// before ever reaching the auto-pay Firestore update this suite tests.
const mockCreateRentPaymentIntent = jest.fn().mockResolvedValue({
  clientSecret: 'pi_test_secret_abc',
  paymentIntentId: 'pi_test',
});
const mockRecordRentPayment = jest.fn().mockResolvedValue({});
jest.mock('../../../services/payments', () => ({
  createRentPaymentIntent: (...args: any[]) => mockCreateRentPaymentIntent(...args),
  recordRentPayment: (...args: any[]) => mockRecordRentPayment(...args),
  paymentIntentIdFromClientSecret: (clientSecret: string) => clientSecret.split('_secret_')[0],
}));

const mockInitPaymentSheet = jest.fn().mockResolvedValue({});
const mockPresentPaymentSheet = jest.fn().mockResolvedValue({});
jest.mock('@stripe/stripe-react-native', () => ({
  usePaymentSheet: () => ({
    initPaymentSheet: (...args: any[]) => mockInitPaymentSheet(...args),
    presentPaymentSheet: (...args: any[]) => mockPresentPaymentSheet(...args),
    loading: false,
  }),
}));

jest.mock('../../../services/notifications/rentReminder', () => ({
  cancelRentReminder: jest.fn(),
}));

// Mock Firebase firestore: the screen writes through the firebase-setup
// instance with the modular functions, which the namespaced adapter maps onto
// this collection -> doc -> update chain.
const mockUpdate = jest.fn().mockResolvedValue(undefined);
const mockDoc = jest.fn().mockReturnValue({ update: mockUpdate });
const mockCollection = jest.fn().mockReturnValue({ doc: mockDoc });
jest.mock('@react-native-firebase/firestore', () =>
  require('../../../../__mocks__/firebase-modular/namespaced-adapter'),
);
jest.mock('../../../../firebase-setup', () => ({
  ...jest.requireActual('../../../../firebase-setup'),
  // Looked up at call time: imports are hoisted above mockCollection.
  firestore: { collection: (...args: unknown[]) => mockCollection(...args) },
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import RentPaymentScreen from '../../../screens/RentPayment/RentPaymentScreen';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() } as any;
const mockGuest = {
  id: 'guest_1',
  firstName: 'John',
  lastName: 'Doe',
  displayName: 'John Doe',
  rentOwed: 100,
  choreFees: 0,
  stripeCustomerId: 'cus_test',
  autoPayEnabled: false,
} as any;
const mockHouse = {
  id: 'house_1',
  stripeStatus: 'active',
  stripeAccountId: 'acct_test',
  rentFrequency: 'monthly',
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
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('RentPaymentScreen — auto-pay toggle', () => {
  beforeEach(() => {
    mockUpdate.mockClear();
    mockDoc.mockClear();
    mockCollection.mockClear();
  });

  it('renders no auto-pay switch', () => {
    const { queryByTestId } = renderScreen(
      <RentPaymentScreen navigation={mockNavigation} guest={mockGuest} house={mockHouse} />,
    );
    expect(queryByTestId('auto-pay-switch')).toBeNull();
  });

  it('promises no automatic charge', () => {
    const { queryByTestId, queryByText } = renderScreen(
      <RentPaymentScreen navigation={mockNavigation} guest={mockGuest} house={mockHouse} />,
    );
    expect(queryByTestId('auto-pay-card')).toBeNull();
    expect(queryByText(/automatically charged/i)).toBeNull();
  });

  it('shows no switch for a guest whose stored autoPayEnabled is true', () => {
    const guestWithAutoPay = { ...mockGuest, autoPayEnabled: true };
    const { queryByTestId } = renderScreen(
      <RentPaymentScreen navigation={mockNavigation} guest={guestWithAutoPay} house={mockHouse} />,
    );
    expect(queryByTestId('auto-pay-switch')).toBeNull();
  });

  it('does not write autoPayEnabled on Pay Now', async () => {
    const { getByTestId, queryByTestId } = renderScreen(
      <RentPaymentScreen navigation={mockNavigation} guest={mockGuest} house={mockHouse} />,
    );
    // The old screen wrote the flag when the resident turned the switch on
    // before paying; turn it on wherever it still renders.
    const toggle = queryByTestId('auto-pay-switch');
    if (toggle) fireEvent(toggle, 'valueChange', true);

    fireEvent.press(getByTestId('pay-now-button'));

    await waitFor(() => {
      expect(mockRecordRentPayment).toHaveBeenCalled();
    });
    expect(mockUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ autoPayEnabled: expect.anything() }),
    );
  });
});
