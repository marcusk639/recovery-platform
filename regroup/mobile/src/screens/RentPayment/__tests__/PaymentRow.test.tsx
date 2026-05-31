import React from 'react';
import { render } from '@testing-library/react-native';
import PaymentRow from '../PaymentRow';
import { RentPayment } from '../../../services/payments';

const mockPayment: RentPayment = {
  id: 'pay-1',
  guestId: 'guest-1',
  houseId: 'house-1',
  amount: 15000, // $150.00 in cents
  status: 'succeeded',
  description: 'Rent Payment',
  createdAt: '2026-01-15T10:00:00Z',
};

describe('PaymentRow', () => {
  it('renders the payment-history-row testID', () => {
    const { getByTestId } = render(<PaymentRow payment={mockPayment} />);
    expect(getByTestId('payment-history-row')).toBeTruthy();
  });

  it('displays the formatted currency amount', () => {
    const { getByText } = render(<PaymentRow payment={mockPayment} />);
    expect(getByText('$150.00')).toBeTruthy();
  });

  it('displays the description', () => {
    const { getByText } = render(<PaymentRow payment={mockPayment} />);
    expect(getByText('Rent Payment')).toBeTruthy();
  });

  it('falls back to Rent Payment when description is undefined', () => {
    const { getByText } = render(
      <PaymentRow payment={{ ...mockPayment, description: undefined }} />,
    );
    expect(getByText('Rent Payment')).toBeTruthy();
  });

  it('renders the status badge', () => {
    const { getByTestId } = render(<PaymentRow payment={mockPayment} />);
    expect(getByTestId('payment-status-badge-succeeded')).toBeTruthy();
  });

  it('shows share button for succeeded payments', () => {
    const { getByTestId } = render(<PaymentRow payment={mockPayment} />);
    expect(getByTestId('share-receipt-button')).toBeTruthy();
  });

  it('hides share button for pending payments', () => {
    const { queryByTestId } = render(
      <PaymentRow payment={{ ...mockPayment, status: 'pending' }} />,
    );
    expect(queryByTestId('share-receipt-button')).toBeNull();
  });
});
