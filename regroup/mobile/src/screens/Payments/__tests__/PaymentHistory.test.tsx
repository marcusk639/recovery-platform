import React from 'react';
import { render } from '@testing-library/react-native';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('react-native-vector-icons/FontAwesome5', () => {
  const { View } = require('react-native');
  return ({ testID }: { testID?: string }) => <View testID={testID} />;
});

jest.mock('../../../services/payments', () => ({
  listPayments: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../../services/reportExport', () => ({
  exportPaymentHistoryCSV: jest.fn().mockReturnValue('csv-content'),
}));

jest.mock('@react-navigation/native-stack', () => ({}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
    canGoBack: jest.fn().mockReturnValue(true),
  }),
}));

// Selection now comes from the id-only hooks, not from the legacy
// state.guests.selectedGuest / state.houses.selectedHouse fields, which nothing
// in the app dispatches any more. Seeding those fields made this suite pass
// against a state the app can never reach, while the real screen rendered
// "No payments found" for every resident.
jest.mock('../../../hooks/useSelectedGuest', () => ({
  useSelectedGuest: () => ({
    guest: {
      id: 'guest-1',
      displayName: 'Alice Smith',
      firstName: 'Alice',
      lastName: 'Smith',
    },
    guestId: 'guest-1',
    isLoading: false,
  }),
}));
jest.mock('../../../hooks/useSelectedHouse', () => ({
  useSelectedHouse: () => ({
    house: { id: 'house-1', name: 'Test House' },
    houseId: 'house-1',
    isLoading: false,
  }),
}));

// Store: provide a selected guest and house
jest.mock('../../../state/store', () => ({
  useAppSelector: (selector: (s: any) => any) =>
    selector({
      guests: {
        selectedGuest: {
          id: 'guest-1',
          displayName: 'Alice Smith',
          firstName: 'Alice',
          lastName: 'Smith',
        },
      },
      houses: { selectedHouse: { id: 'house-1', name: 'Test House' } },
    }),
}));

// ─── Imports (must come after jest.mock calls) ───────────────────────────────

import * as paymentsService from '../../../services/payments';
import { PaymentRecord } from '../../../services/payments';
import PaymentHistory from '../PaymentHistory';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const _succeeded: PaymentRecord = {
  id: 'pay-001',
  amount: 50000,
  currency: 'usd',
  status: 'succeeded',
  description: 'Monthly Rent',
  createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
};

const _recentPending: PaymentRecord = {
  id: 'pay-002',
  amount: 60000,
  currency: 'usd',
  status: 'pending',
  description: 'Rent Payment',
  createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(), // 1 hour ago
};

const _stalePending: PaymentRecord = {
  id: 'pay-003',
  amount: 70000,
  currency: 'usd',
  status: 'pending',
  description: 'Rent Payment',
  createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(), // 25 hours ago
};

const _fakeNavigation: any = { goBack: jest.fn(), navigate: jest.fn() };

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('PaymentHistory', () => {
  it('renders a succeeded row without a stale-clock icon', async () => {
    (paymentsService.listPayments as jest.Mock).mockResolvedValue([_succeeded]);
    const { findByTestId, queryByTestId } = render(
      <PaymentHistory navigation={_fakeNavigation} />,
    );
    await findByTestId('payment-row-pay-001');
    expect(queryByTestId('stale-clock-pay-001')).toBeNull();
  });

  it('renders a recent-pending row without a stale-clock icon', async () => {
    (paymentsService.listPayments as jest.Mock).mockResolvedValue([
      _recentPending,
    ]);
    const { findByTestId, queryByTestId } = render(
      <PaymentHistory navigation={_fakeNavigation} />,
    );
    await findByTestId('payment-row-pay-002');
    expect(queryByTestId('stale-clock-pay-002')).toBeNull();
  });

  it('renders a stale-pending row WITH a stale-clock icon', async () => {
    (paymentsService.listPayments as jest.Mock).mockResolvedValue([
      _stalePending,
    ]);
    const { findByTestId } = render(
      <PaymentHistory navigation={_fakeNavigation} />,
    );
    await findByTestId('payment-row-pay-003');
    await findByTestId('stale-clock-pay-003');
  });
});
