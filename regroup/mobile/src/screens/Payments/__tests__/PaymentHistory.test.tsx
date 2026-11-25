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

// Rent charges show beside payments (rent spec §4.5).
jest.mock('../../../services/rentCharges', () => ({
  listGuestCharges: jest.fn().mockResolvedValue([]),
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
let mockGuest: typeof mockResident | null = mockResident;
let mockGuestLoading = false;
let mockSignedInUid = 'user-1';
jest.mock('../../../hooks/useSelectedGuest', () => ({
  useSelectedGuest: () => ({
    guest: mockGuest,
    guestId: 'guest-1',
    isLoading: mockGuestLoading,
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
import * as rentChargesService from '../../../services/rentCharges';
import * as reportExport from '../../../services/reportExport';
import { fireEvent, waitFor, within } from '@testing-library/react-native';
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
    mockGuestLoading = false;
    mockSignedInUid = 'user-1';
    (paymentsService.getPaymentHistory as jest.Mock).mockReset().mockResolvedValue([]);
    (paymentsService.getGuestPayments as jest.Mock).mockReset().mockResolvedValue([]);
    (rentChargesService.listGuestCharges as jest.Mock).mockReset().mockResolvedValue([]);
  });

  // ─── Rent charges (rent spec §4.5, launch plan Task 24) ─────────────────────
  const rentCharge = (fields: Record<string, unknown> = {}) => ({
    id: 'guest-1_2026-11-16',
    guestId: 'guest-1',
    houseId: 'house-1',
    amountCents: 17500,
    daysCovered: 7,
    daysInPeriod: 7,
    firstDay: '2026-11-16',
    lastDay: '2026-11-22',
    rateSource: 'house',
    ...fields,
  });
  const paidOn = (id: string, iso: string, amount: number) => ({
    id,
    amount,
    currency: 'usd',
    status: 'succeeded',
    description: 'Rent Payment',
    createdAt: iso,
  });

  it('shows "Rent, Nov 16–22: $175.00" as a charge between two payments, by date', async () => {
    (paymentsService.getPaymentHistory as jest.Mock).mockResolvedValue([
      paidOn('pay-late', '2026-11-20T15:00:00.000Z', 20000),
      paidOn('pay-early', '2026-11-10T15:00:00.000Z', 10000),
    ]);
    (rentChargesService.listGuestCharges as jest.Mock).mockResolvedValue([rentCharge()]);
    const view = render(<PaymentHistory navigation={_fakeNavigation} />);
    const row = await view.findByTestId('charge-row-guest-1_2026-11-16');
    expect(within(row).getByText('Rent, Nov 16–22')).toBeTruthy();
    expect(within(row).getByText('$175.00')).toBeTruthy();
    const ids = view
      .getAllByTestId(/^(payment|charge)-row-/)
      .map((n) => n.props.testID);
    expect(ids).toEqual(['payment-row-pay-late', 'charge-row-guest-1_2026-11-16', 'payment-row-pay-early']);
  });

  it('shows a prorated charge as "5 of 7 days"', async () => {
    (rentChargesService.listGuestCharges as jest.Mock).mockResolvedValue([
      rentCharge({ id: 'c5', firstDay: '2026-11-18', daysCovered: 5, amountCents: 12500 }),
    ]);
    const view = render(<PaymentHistory navigation={_fakeNavigation} />);
    const row = await view.findByTestId('charge-row-c5');
    expect(within(row).getByText('5 of 7 days')).toBeTruthy();
    expect(within(row).getByText('$125.00')).toBeTruthy();
  });

  it("asks for the resident's own charges by account, and staff's by guest record", async () => {
    render(<PaymentHistory navigation={_fakeNavigation} />);
    await waitFor(() =>
      expect(rentChargesService.listGuestCharges).toHaveBeenCalledWith({
        houseId: 'house-1',
        guestUserId: 'user-1',
      }),
    );
    (rentChargesService.listGuestCharges as jest.Mock).mockClear();
    mockSignedInUid = 'operator-1';
    render(<PaymentHistory navigation={_fakeNavigation} />);
    await waitFor(() =>
      expect(rentChargesService.listGuestCharges).toHaveBeenCalledWith({
        houseId: 'house-1',
        guestId: 'guest-1',
      }),
    );
  });

  it('still shows the payments, and says so, when the charges cannot be read', async () => {
    (paymentsService.getPaymentHistory as jest.Mock).mockResolvedValue([
      paidOn('pay-1', '2026-11-20T15:00:00.000Z', 20000),
    ]);
    (rentChargesService.listGuestCharges as jest.Mock).mockRejectedValue(new Error('denied'));
    const view = render(<PaymentHistory navigation={_fakeNavigation} />);
    expect(await view.findByTestId('payment-row-pay-1')).toBeTruthy();
    expect(view.getByText("Couldn't load rent charges.")).toBeTruthy();
  });

  it('exports charges with the payments', async () => {
    (paymentsService.getPaymentHistory as jest.Mock).mockResolvedValue([
      paidOn('pay-1', '2026-11-20T15:00:00.000Z', 20000),
    ]);
    (rentChargesService.listGuestCharges as jest.Mock).mockResolvedValue([rentCharge()]);
    const view = render(<PaymentHistory navigation={_fakeNavigation} />);
    fireEvent.press(await view.findByTestId('export-csv-button'));
    await waitFor(() => expect(reportExport.exportPaymentHistoryCSV).toHaveBeenCalled());
    const [, , charges] = (reportExport.exportPaymentHistoryCSV as jest.Mock).mock.calls[0];
    expect(charges).toEqual([expect.objectContaining({ id: 'guest-1_2026-11-16', amountCents: 17500 })]);
  });

  it('lists charges even when there are no payments yet', async () => {
    (rentChargesService.listGuestCharges as jest.Mock).mockResolvedValue([rentCharge()]);
    const view = render(<PaymentHistory navigation={_fakeNavigation} />);
    expect(await view.findByTestId('charge-row-guest-1_2026-11-16')).toBeTruthy();
    expect(view.queryByText('No payments found.')).toBeNull();
  });

  // The screen showed "No payments found." while the resident's record was
  // still loading, and when it could not be loaded at all.
  it("shows a spinner, not an empty history, while the resident's record loads", () => {
    mockGuest = null;
    mockGuestLoading = true;
    const { getByTestId, queryByText } = render(<PaymentHistory navigation={_fakeNavigation} />);
    expect(getByTestId('payment-history-loading')).toBeTruthy();
    expect(queryByText('No payments found.')).toBeNull();
  });

  it("says the history could not be loaded when the resident's record can't be", async () => {
    mockGuest = null;
    const { findByText, queryByText } = render(<PaymentHistory navigation={_fakeNavigation} />);
    await findByText("Couldn't load payment history. Please try again.");
    expect(queryByText('No payments found.')).toBeNull();
  });

  it('shows a plain message, not the raw error, when the read fails', async () => {
    (paymentsService.getPaymentHistory as jest.Mock).mockRejectedValue(
      new Error('[firestore/permission-denied] Missing or insufficient permissions.'),
    );
    const { findByText, queryByText } = render(<PaymentHistory navigation={_fakeNavigation} />);
    await findByText("Couldn't load payment history. Please try again.");
    expect(queryByText(/permission/)).toBeNull();
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
