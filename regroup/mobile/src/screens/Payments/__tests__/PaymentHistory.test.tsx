import React from 'react';
import { render } from '@testing-library/react-native';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('@react-native-vector-icons/fontawesome5/static', () => {
  const { View } = require('react-native');
  return ({ testID }: { testID?: string }) => <View testID={testID} />;
});

jest.mock('../../../services/payments', () => ({
  getPaymentHistory: jest.fn().mockResolvedValue([]),
  getGuestPayments: jest.fn().mockResolvedValue([]),
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
const mockResident = {
  id: 'guest-1',
  userId: 'user-1' as string | undefined,
  displayName: 'Alice Smith',
  firstName: 'Alice',
  lastName: 'Smith',
};
let mockGuest = mockResident;
let mockSignedInUid = 'user-1';
jest.mock('../../../hooks/useSelectedGuest', () => ({
  useSelectedGuest: () => ({
    guest: mockGuest,
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
      user: { user: { id: mockSignedInUid } },
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
  afterEach(() => {
    mockGuest = mockResident;
    mockSignedInUid = 'user-1';
    (paymentsService.getPaymentHistory as jest.Mock).mockReset().mockResolvedValue([]);
    (paymentsService.getGuestPayments as jest.Mock).mockReset().mockResolvedValue([]);
  });

  it("shows an operator the resident's payments by guest record, including any from before the account linked", async () => {
    mockSignedInUid = 'operator-1';
    (paymentsService.getGuestPayments as jest.Mock).mockResolvedValue([_succeeded]);
    const { findByTestId } = render(<PaymentHistory navigation={_fakeNavigation} />);
    await findByTestId('payment-row-pay-001');
    expect(paymentsService.getGuestPayments).toHaveBeenCalledWith({
      houseId: 'house-1',
      guestId: 'guest-1',
    });
    expect(paymentsService.getPaymentHistory).not.toHaveBeenCalled();
  });

  it('shows cash an operator recorded for a resident with no account', async () => {
    mockSignedInUid = 'operator-1';
    mockGuest = { ...mockResident, userId: undefined };
    (paymentsService.getGuestPayments as jest.Mock).mockResolvedValue([_succeeded]);
    const { findByTestId } = render(<PaymentHistory navigation={_fakeNavigation} />);
    await findByTestId('payment-row-pay-001');
  });

  it('never shows a refunded payment as succeeded', async () => {
    (paymentsService.getPaymentHistory as jest.Mock).mockResolvedValue([
      { ..._succeeded, refundedAmountCents: 50000 },
    ]);
    const { findByText, queryByText } = render(<PaymentHistory navigation={_fakeNavigation} />);
    await findByText('REFUNDED');
    expect(queryByText('SUCCEEDED')).toBeNull();
  });

  it('shows how much of a partly refunded payment went back', async () => {
    (paymentsService.getPaymentHistory as jest.Mock).mockResolvedValue([
      { ..._succeeded, refundedAmountCents: 10000 },
    ]);
    const { findByText } = render(<PaymentHistory navigation={_fakeNavigation} />);
    await findByText('PARTIALLY REFUNDED');
    await findByText('$100.00 refunded');
  });

  it('never shows a disputed payment as succeeded', async () => {
    (paymentsService.getPaymentHistory as jest.Mock).mockResolvedValue([
      { ..._succeeded, disputed: true },
    ]);
    const { findByText, queryByText } = render(<PaymentHistory navigation={_fakeNavigation} />);
    await findByText('DISPUTED');
    expect(queryByText('SUCCEEDED')).toBeNull();
  });

  it('reads Firestore payments, the history of record, not Stripe charges', async () => {
    (paymentsService.getPaymentHistory as jest.Mock).mockResolvedValue([_succeeded]);
    (paymentsService.listPayments as jest.Mock).mockClear();
    const { findByTestId } = render(<PaymentHistory navigation={_fakeNavigation} />);
    await findByTestId('payment-row-pay-001');
    expect(paymentsService.getPaymentHistory).toHaveBeenCalledWith({
      houseId: 'house-1',
      guestUserId: 'user-1',
    });
    expect(paymentsService.listPayments).not.toHaveBeenCalled();
  });

  it('shows a payment resolved offline as such, with no description needed', async () => {
    (paymentsService.getPaymentHistory as jest.Mock).mockResolvedValue([
      { ..._succeeded, id: 'pay-off', status: 'resolved_offline', description: undefined },
    ]);
    const { findByText } = render(<PaymentHistory navigation={_fakeNavigation} />);
    await findByText('RESOLVED OFFLINE');
    await findByText('Payment');
  });

  it('renders a Firestore Timestamp createdAt', async () => {
    (paymentsService.getPaymentHistory as jest.Mock).mockResolvedValue([
      {
        ..._succeeded,
        id: 'pay-ts',
        createdAt: { toDate: () => new Date('2026-11-03T12:00:00Z') },
      },
    ]);
    const { findByTestId } = render(<PaymentHistory navigation={_fakeNavigation} />);
    await findByTestId('payment-row-pay-ts');
  });

  it('renders a succeeded row without a stale-clock icon', async () => {
    (paymentsService.getPaymentHistory as jest.Mock).mockResolvedValue([_succeeded]);
    const { findByTestId, queryByTestId } = render(
      <PaymentHistory navigation={_fakeNavigation} />,
    );
    await findByTestId('payment-row-pay-001');
    expect(queryByTestId('stale-clock-pay-001')).toBeNull();
  });

  it('renders a recent-pending row without a stale-clock icon', async () => {
    (paymentsService.getPaymentHistory as jest.Mock).mockResolvedValue([
      _recentPending,
    ]);
    const { findByTestId, queryByTestId } = render(
      <PaymentHistory navigation={_fakeNavigation} />,
    );
    await findByTestId('payment-row-pay-002');
    expect(queryByTestId('stale-clock-pay-002')).toBeNull();
  });

  it('renders a stale-pending row WITH a stale-clock icon', async () => {
    (paymentsService.getPaymentHistory as jest.Mock).mockResolvedValue([
      _stalePending,
    ]);
    const { findByTestId } = render(
      <PaymentHistory navigation={_fakeNavigation} />,
    );
    await findByTestId('payment-row-pay-003');
    await findByTestId('stale-clock-pay-003');
  });
});
