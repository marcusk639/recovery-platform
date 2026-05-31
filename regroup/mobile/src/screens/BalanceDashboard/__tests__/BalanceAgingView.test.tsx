import React from 'react';
import { render } from '@testing-library/react-native';
import BalanceAgingView from '../BalanceAgingView';

const makeRow = (
  name: string,
  balance: number,
  lastPaymentDate: string | null,
) => ({
  guestId: `guest-${name}`,
  guestName: name,
  totalOwed: balance,
  lastPaymentDate,
});

it('shows guest name and balance for each row', () => {
  const rows = [makeRow('Alice', 500, '2026-04-01')];
  const { getByText } = render(<BalanceAgingView rows={rows} />);
  expect(getByText('Alice')).toBeTruthy();
  expect(getByText('$500')).toBeTruthy();
});

it('shows "No payment" label when lastPaymentDate is null', () => {
  const rows = [makeRow('Bob', 200, null)];
  const { getByText } = render(<BalanceAgingView rows={rows} />);
  expect(getByText(/No payment/i)).toBeTruthy();
});

it('shows overdue days based on last payment date', () => {
  const fortyFiveDaysAgo = new Date();
  fortyFiveDaysAgo.setDate(fortyFiveDaysAgo.getDate() - 45);
  const rows = [makeRow('Bob', 200, fortyFiveDaysAgo.toISOString())];
  const { getByText } = render(<BalanceAgingView rows={rows} />);
  expect(getByText(/45 days/)).toBeTruthy();
});

it('renders empty state when no rows', () => {
  const { getByText } = render(<BalanceAgingView rows={[]} />);
  expect(getByText(/All balances current/i)).toBeTruthy();
});
