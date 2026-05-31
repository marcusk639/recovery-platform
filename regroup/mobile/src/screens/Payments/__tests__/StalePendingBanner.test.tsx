import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('react-native/Libraries/Linking/Linking', () => ({
  openURL: jest.fn().mockResolvedValue(undefined),
  canOpenURL: jest.fn().mockResolvedValue(true),
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

import { RentPayment } from '../../../services/payments';

const _stalePending: RentPayment = {
  id: 'pay-stale-001',
  guestId: 'guest-1',
  houseId: 'house-1',
  amount: 75000,
  status: 'pending',
  createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
  description: 'Monthly Rent',
};

const _stalePending2: RentPayment = {
  ..._stalePending,
  id: 'pay-stale-002',
  guestId: 'guest-2',
};

const _guestNames: Record<string, string> = {
  'guest-1': 'Alice Smith',
  'guest-2': 'Bob Jones',
};

import StalePendingBanner from '../StalePendingBanner';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('StalePendingBanner', () => {
  it('renders nothing when stalePendingPayments is empty', () => {
    const { queryByTestId } = render(
      <StalePendingBanner stalePendingPayments={[]} guestNames={_guestNames} />,
    );
    expect(queryByTestId('stale-pending-banner')).toBeNull();
  });

  it('renders the banner when there are stale pending payments', () => {
    const { getByTestId } = render(
      <StalePendingBanner
        stalePendingPayments={[_stalePending]}
        guestNames={_guestNames}
      />,
    );
    expect(getByTestId('stale-pending-banner')).toBeTruthy();
  });

  it('renders a row for each stale pending payment', () => {
    const { getByTestId } = render(
      <StalePendingBanner
        stalePendingPayments={[_stalePending, _stalePending2]}
        guestNames={_guestNames}
      />,
    );
    expect(getByTestId('stale-pending-row-pay-stale-001')).toBeTruthy();
    expect(getByTestId('stale-pending-row-pay-stale-002')).toBeTruthy();
  });

  it('shows the singular header for one payment', () => {
    const { getByText } = render(
      <StalePendingBanner
        stalePendingPayments={[_stalePending]}
        guestNames={_guestNames}
      />,
    );
    expect(getByText('1 Payment Pending 24h+')).toBeTruthy();
  });

  it('shows the plural header for multiple payments', () => {
    const { getByText } = render(
      <StalePendingBanner
        stalePendingPayments={[_stalePending, _stalePending2]}
        guestNames={_guestNames}
      />,
    );
    expect(getByText('2 Payments Pending 24h+')).toBeTruthy();
  });

  it('shows guest name, formatted amount, and date for each row', () => {
    const { getByText } = render(
      <StalePendingBanner
        stalePendingPayments={[_stalePending]}
        guestNames={_guestNames}
      />,
    );
    expect(getByText('Alice Smith')).toBeTruthy();
    expect(getByText(/\$750\.00/)).toBeTruthy();
  });

  it('shows "Unknown Resident" for an unrecognized guestId', () => {
    const unknownPayment: RentPayment = {
      ..._stalePending,
      id: 'pay-stale-unknown',
      guestId: 'guest-unknown',
    };
    const { getByText } = render(
      <StalePendingBanner
        stalePendingPayments={[unknownPayment]}
        guestNames={_guestNames}
      />,
    );
    expect(getByText('Unknown Resident')).toBeTruthy();
  });

  it('renders the "Contact Support" button', () => {
    const { getByTestId } = render(
      <StalePendingBanner
        stalePendingPayments={[_stalePending]}
        guestNames={_guestNames}
      />,
    );
    expect(getByTestId('stale-pending-contact-support')).toBeTruthy();
  });

  it('calls Linking.openURL with the support mailto when "Contact Support" is pressed', () => {
    const { Linking } = require('react-native');
    const { getByTestId } = render(
      <StalePendingBanner
        stalePendingPayments={[_stalePending]}
        guestNames={_guestNames}
      />,
    );
    fireEvent.press(getByTestId('stale-pending-contact-support'));
    expect(Linking.openURL).toHaveBeenCalledWith(
      'mailto:support@regroup-app.com?subject=Stuck%20Pending%20Payment',
    );
  });
});
