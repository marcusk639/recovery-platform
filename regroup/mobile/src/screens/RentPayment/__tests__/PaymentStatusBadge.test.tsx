import React from 'react';
import { render } from '@testing-library/react-native';
import PaymentStatusBadge from '../PaymentStatusBadge';

describe('PaymentStatusBadge', () => {
  it('renders succeeded status with testID', () => {
    const { getByTestId } = render(<PaymentStatusBadge status="succeeded" />);
    expect(getByTestId('payment-status-badge-succeeded')).toBeTruthy();
  });

  it('renders pending status with testID', () => {
    const { getByTestId } = render(<PaymentStatusBadge status="pending" />);
    expect(getByTestId('payment-status-badge-pending')).toBeTruthy();
  });

  it('renders failed status with testID', () => {
    const { getByTestId } = render(<PaymentStatusBadge status="failed" />);
    expect(getByTestId('payment-status-badge-failed')).toBeTruthy();
  });

  it('displays Paid label for succeeded status', () => {
    const { getByText } = render(<PaymentStatusBadge status="succeeded" />);
    expect(getByText('Paid')).toBeTruthy();
  });

  it('displays Pending label for pending status', () => {
    const { getByText } = render(<PaymentStatusBadge status="pending" />);
    expect(getByText('Pending')).toBeTruthy();
  });

  it('displays Failed label for failed status', () => {
    const { getByText } = render(<PaymentStatusBadge status="failed" />);
    expect(getByText('Failed')).toBeTruthy();
  });
});
