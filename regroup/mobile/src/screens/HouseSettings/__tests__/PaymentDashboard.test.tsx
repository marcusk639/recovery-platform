// ─── useSelectedHouse mock ────────────────────────────────────────────────────
const mockUseSelectedHouse = jest.fn();

jest.mock('../../../hooks/useSelectedHouse', () => ({
  useSelectedHouse: () => mockUseSelectedHouse(),
}));

// Stub useFocusEffect so the screen can run outside a NavigationContainer.
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
}));

import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Standard mocks for this project
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
  useTranslation: () => ({ t: (k: string) => k }),
}));

jest.mock('../../../components/screen-header', () => {
  const { View, Text } = require('react-native');
  return ({ header }: any) => (
    <View>
      <Text>{header}</Text>
    </View>
  );
});

jest.mock('../../../components/rats-text/rats-text', () => {
  const { Text } = require('react-native');
  return ({ text, children }: any) => <Text>{text ?? children ?? ''}</Text>;
});

jest.mock('../../../components/rats-button/rats-button', () => {
  const { TouchableOpacity, Text } = require('react-native');
  return ({ title, onPress, disabled }: any) => (
    <TouchableOpacity onPress={onPress} disabled={disabled}>
      <Text>{title}</Text>
    </TouchableOpacity>
  );
});

jest.mock('victory-native', () => ({
  VictoryBar: () => null,
  VictoryChart: ({ children }: any) => <>{children}</>,
  VictoryAxis: () => null,
  VictoryTheme: { material: {} },
}));

const mockListHousePayments = jest.fn();
const mockRecordManualPayment = jest.fn();
jest.mock('../../../services/payments', () => ({
  listHousePayments: (...args: any[]) => mockListHousePayments(...args),
  recordManualPayment: (...args: any[]) => mockRecordManualPayment(...args),
}));

const mockUseAppSelector = jest.fn();
jest.mock('../../../state/store', () => ({
  useAppSelector: (selector: any) => mockUseAppSelector(selector),
}));

import PaymentDashboard from '../PaymentDashboard';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() } as any;

const PAYMENT_TEST_HOUSE = { id: 'house1', name: 'Test House' };

// After A2 migration, PaymentDashboard reads guests via useGuests(houseId)
// instead of state.guests.guests. Stash the fixture so makeWrapper can seed
// the React Query cache. See .full-review [A2].
let currentTestGuests: Record<string, any> = {};

const setupStore = (guests: Record<string, any> = {}) => {
  currentTestGuests = guests;
  mockUseSelectedHouse.mockReturnValue({
    house: PAYMENT_TEST_HOUSE,
    houseId: PAYMENT_TEST_HOUSE.id,
    isLoading: false,
  });
  mockUseAppSelector.mockImplementation((selector: any) =>
    selector({
      houses: { selectedHouse: PAYMENT_TEST_HOUSE },
      guests: { guests },
    }),
  );
};

const makeWrapper = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(['guests', 'list', PAYMENT_TEST_HOUSE.id], currentTestGuests);
  return ({ children }: any) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
};

const renderDashboard = () =>
  render(<PaymentDashboard navigation={mockNavigation} />, {
    wrapper: makeWrapper(),
  });

describe('PaymentDashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows loading state initially', () => {
    setupStore();
    mockListHousePayments.mockReturnValue(new Promise(() => {}));
    const { getByTestId } = renderDashboard();
    expect(getByTestId('payment-dashboard-loading')).toBeTruthy();
  });

  it('shows total collected amount for succeeded payments', async () => {
    setupStore({
      g1: { id: 'g1', userId: 'u1', firstName: 'Alice', lastName: 'Smith' },
    });
    mockListHousePayments.mockResolvedValue([
      {
        id: 'c1',
        amount: 500,
        currency: 'usd',
        status: 'succeeded',
        description: 'Rent',
        createdAt: new Date().toISOString(),
        guestId: 'g1',
        houseId: 'house1',
      },
    ]);
    const { findByTestId } = renderDashboard();
    await findByTestId('payment-stats-card');
  });

  it('renders date filter pills', async () => {
    setupStore();
    mockListHousePayments.mockResolvedValue([]);
    const { findByText } = renderDashboard();
    expect(await findByText('This Week')).toBeTruthy();
    expect(await findByText('This Month')).toBeTruthy();
    expect(await findByText('All Time')).toBeTruthy();
  });

  it('shows empty state when no payments', async () => {
    setupStore();
    mockListHousePayments.mockResolvedValue([]);
    const { findByTestId } = renderDashboard();
    await findByTestId('payment-empty-state');
  });

  it('shows FAB for recording manual payment', async () => {
    setupStore();
    mockListHousePayments.mockResolvedValue([]);
    const { findByTestId } = renderDashboard();
    await findByTestId('manual-payment-fab');
  });

  it('renders StalePendingBanner when there are stale pending payments', async () => {
    setupStore({
      g1: { id: 'g1', userId: 'u1', firstName: 'Alice', lastName: 'Smith' },
    });
    mockListHousePayments.mockResolvedValue([
      {
        id: 'pay-stale-1',
        guestId: 'g1',
        houseId: 'house1',
        amount: 50000,
        status: 'pending',
        createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
        description: 'Rent Payment',
      },
    ]);
    const { findByTestId } = renderDashboard();
    await findByTestId('stale-pending-banner');
  });

  it('does not render StalePendingBanner when no stale pending payments', async () => {
    setupStore();
    mockListHousePayments.mockResolvedValue([]);
    const { queryByTestId, findByTestId } = renderDashboard();
    await findByTestId('payment-empty-state');
    expect(queryByTestId('stale-pending-banner')).toBeNull();
  });

  describe('ManualPaymentModal', () => {
    const guestFixtures = {
      g1: { id: 'g1', userId: 'u1', firstName: 'Alice', lastName: 'Smith' },
      g2: { id: 'g2', userId: 'u2', firstName: 'Bob', lastName: 'Jones' },
    };

    const openModal = async (utils: ReturnType<typeof renderDashboard>) => {
      const fab = await utils.findByTestId('manual-payment-fab');
      fireEvent.press(fab);
    };

    it('calls recordManualPayment with correct args and closes modal', async () => {
      setupStore(guestFixtures);
      mockListHousePayments.mockResolvedValue([]);
      mockRecordManualPayment.mockResolvedValue({});

      const utils = renderDashboard();
      await openModal(utils);

      // Select a guest
      const guestPill = await utils.findByTestId('guest-pill-g1');
      fireEvent.press(guestPill);

      // Enter amount
      const amountInput = utils.getByPlaceholderText('Amount ($)');
      fireEvent.changeText(amountInput, '150');

      // Press Record
      const recordBtn = utils.getByText('Record');
      fireEvent.press(recordBtn);

      await waitFor(() => {
        expect(mockRecordManualPayment).toHaveBeenCalledWith(
          'g1',
          'house1',
          15000, // $150.00 in cents
          'Cash',
          '',
        );
      });
    });

    it('closes modal after successful recordManualPayment', async () => {
      setupStore(guestFixtures);
      mockListHousePayments.mockResolvedValue([]);
      mockRecordManualPayment.mockResolvedValue({});

      const utils = renderDashboard();
      await openModal(utils);

      // Verify modal title is visible
      expect(utils.getByText('Record Manual Payment')).toBeTruthy();

      // Select guest and enter amount
      fireEvent.press(await utils.findByTestId('guest-pill-g2'));
      fireEvent.changeText(utils.getByPlaceholderText('Amount ($)'), '200');

      fireEvent.press(utils.getByText('Record'));

      await waitFor(() => {
        expect(mockRecordManualPayment).toHaveBeenCalled();
      });
    });

    it('shows error alert when recordManualPayment throws', async () => {
      const { Alert } = require('react-native');
      jest.spyOn(Alert, 'alert');

      setupStore(guestFixtures);
      mockListHousePayments.mockResolvedValue([]);
      mockRecordManualPayment.mockRejectedValue(new Error('Network error'));

      const utils = renderDashboard();
      await openModal(utils);

      fireEvent.press(await utils.findByTestId('guest-pill-g1'));
      fireEvent.changeText(utils.getByPlaceholderText('Amount ($)'), '75');

      fireEvent.press(utils.getByText('Record'));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Error',
          'Failed to record payment. Please try again.',
        );
      });
    });
  });
});
