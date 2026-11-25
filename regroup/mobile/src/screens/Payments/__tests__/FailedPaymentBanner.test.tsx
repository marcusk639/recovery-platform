// src/screens/Payments/__tests__/FailedPaymentBanner.test.tsx
import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';

jest.mock('../../../state/queries/paymentQueries', () => ({
  useMarkPaymentResolved: jest.fn(() => ({
    mutateAsync: jest.fn().mockResolvedValue(undefined),
    isPending: false,
  })),
}));

import FailedPaymentBanner from '../FailedPaymentBanner';

const fakePayment = {
  id: 'pay-001',
  guestId: 'guest-1',
  houseId: 'house-1',
  amount: 50000,
  status: 'failed' as const,
  createdAt: '2026-04-01T00:00:00.000Z',
  description: 'Monthly Rent',
};

const fakePayment2 = { ...fakePayment, id: 'pay-002' };

const guestNames: Record<string, string> = { 'guest-1': 'Alice Smith' };

describe('FailedPaymentBanner', () => {
  it('renders nothing when failedPayments is empty', () => {
    const { queryByTestId } = render(
      <FailedPaymentBanner
        failedPayments={[]}
        houseId="house-1"
        guestNames={{}}
      />,
    );
    expect(queryByTestId('failed-payment-banner')).toBeNull();
  });

  it("says so when the failed payments couldn't be loaded, rather than showing nothing", () => {
    const { getByTestId, getByText } = render(
      <FailedPaymentBanner
        failedPayments={[]}
        houseId="house-1"
        guestNames={{}}
        loadError
      />,
    );
    expect(getByTestId('failed-payment-load-error')).toBeTruthy();
    expect(getByText("Couldn't check for failed payments. Close and reopen this screen to try again.")).toBeTruthy();
  });

  it('renders a row for each failed payment', () => {
    const { getByTestId } = render(
      <FailedPaymentBanner
        failedPayments={[fakePayment, fakePayment2]}
        houseId="house-1"
        guestNames={guestNames}
      />,
    );
    expect(getByTestId('failed-payment-row-pay-001')).toBeTruthy();
    expect(getByTestId('failed-payment-row-pay-002')).toBeTruthy();
  });

  it('shows "Mark Resolved" button for each row', () => {
    const { getByTestId } = render(
      <FailedPaymentBanner
        failedPayments={[fakePayment]}
        houseId="house-1"
        guestNames={guestNames}
      />,
    );
    expect(getByTestId('mark-resolved-pay-001')).toBeTruthy();
  });

  it('lists the payment but offers no "Mark Resolved" when the viewer cannot resolve it', () => {
    const { getByTestId, queryByTestId } = render(
      <FailedPaymentBanner
        failedPayments={[fakePayment]}
        houseId="house-1"
        guestNames={guestNames}
        canResolve={false}
      />,
    );
    expect(getByTestId('failed-payment-row-pay-001')).toBeTruthy();
    expect(queryByTestId('mark-resolved-pay-001')).toBeNull();
  });

  it('calls useMarkPaymentResolved mutateAsync when "Mark Resolved" is tapped', async () => {
    const mockMutate = jest.fn().mockResolvedValue(undefined);
    const {
      useMarkPaymentResolved,
    } = require('../../../state/queries/paymentQueries');
    (useMarkPaymentResolved as jest.Mock).mockReturnValue({
      mutateAsync: mockMutate,
      isPending: false,
    });

    const { getByTestId } = render(
      <FailedPaymentBanner
        failedPayments={[fakePayment]}
        houseId="house-1"
        guestNames={guestNames}
      />,
    );
    await act(async () => {
      fireEvent.press(getByTestId('mark-resolved-pay-001'));
    });
    expect(mockMutate).toHaveBeenCalledWith({ paymentId: 'pay-001' });
  });
});
