import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import PaymentRow from '../PaymentRow';
import { RentPayment } from '../../../services/payments';
import { shareReceipt } from '../../../services/receiptService';

jest.mock('../../../services/receiptService', () => ({
  shareReceipt: jest.fn(() => Promise.resolve()),
}));

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

  // The webhook writes createdAt as a Firestore Timestamp; the receipt takes an
  // ISO string, and new Date(timestamp) printed "Invalid Date".
  describe('the shared receipt date', () => {
    const at = new Date('2026-03-04T05:06:07.000Z');
    const timestamp = { toDate: () => at, toMillis: () => at.getTime() };

    it('is the ISO string of a Timestamp createdAt', async () => {
      const { getByTestId } = render(
        <PaymentRow payment={{ ...mockPayment, createdAt: timestamp as any }} />,
      );
      fireEvent.press(getByTestId('share-receipt-button'));
      await waitFor(() =>
        expect(shareReceipt).toHaveBeenCalledWith(
          expect.objectContaining({ date: at.toISOString() }),
        ),
      );
    });

    it('is the same instant for an ISO string createdAt', async () => {
      const { getByTestId } = render(<PaymentRow payment={mockPayment} />);
      fireEvent.press(getByTestId('share-receipt-button'));
      await waitFor(() =>
        expect(shareReceipt).toHaveBeenCalledWith(
          expect.objectContaining({ date: '2026-01-15T10:00:00.000Z' }),
        ),
      );
    });
  });
});
