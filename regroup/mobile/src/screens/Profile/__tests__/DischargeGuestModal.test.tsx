import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import DischargeGuestModal from '../DischargeGuestModal';
import * as guestService from '../../../services/guest';

jest.mock('../../../services/guest');
const mockedDischarge = guestService.dischargeGuest as jest.MockedFunction<
  typeof guestService.dischargeGuest
>;

const mockOnClose = jest.fn();
const mockOnSuccess = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockedDischarge.mockResolvedValue(undefined);
});

it('renders guest name in the confirmation prompt', () => {
  const { getByText } = render(
    <DischargeGuestModal
      visible
      guestId="guest-1"
      guestName="Jane Smith"
      onClose={mockOnClose}
      onSuccess={mockOnSuccess}
    />,
  );
  expect(getByText(/Jane Smith/)).toBeTruthy();
});

it('calls dischargeGuest with guestId and selected date on confirm', async () => {
  const { getByTestId } = render(
    <DischargeGuestModal
      visible
      guestId="guest-1"
      guestName="Jane Smith"
      onClose={mockOnClose}
      onSuccess={mockOnSuccess}
    />,
  );
  fireEvent.press(getByTestId('confirm-discharge-button'));
  await waitFor(() =>
    expect(mockedDischarge).toHaveBeenCalledWith(
      'guest-1',
      expect.any(String),
      undefined,
    ),
  );
  expect(mockOnSuccess).toHaveBeenCalled();
});

it('calls onClose when Cancel pressed', () => {
  const { getByTestId } = render(
    <DischargeGuestModal
      visible
      guestId="guest-1"
      guestName="Jane Smith"
      onClose={mockOnClose}
      onSuccess={mockOnSuccess}
    />,
  );
  fireEvent.press(getByTestId('cancel-discharge-button'));
  expect(mockOnClose).toHaveBeenCalled();
});

it('passes typed notes to dischargeGuest', async () => {
  const { getByTestId, getByPlaceholderText } = render(
    <DischargeGuestModal
      visible
      guestId="guest-1"
      guestName="Jane Smith"
      onClose={mockOnClose}
      onSuccess={mockOnSuccess}
    />,
  );
  fireEvent.changeText(
    getByPlaceholderText('Notes (optional)'),
    'discharge note',
  );
  fireEvent.press(getByTestId('confirm-discharge-button'));
  await waitFor(() =>
    expect(mockedDischarge).toHaveBeenCalledWith(
      'guest-1',
      expect.any(String),
      'discharge note',
    ),
  );
});

it('does not call onSuccess when dischargeGuest fails', async () => {
  mockedDischarge.mockRejectedValue(new Error('Firestore error'));
  const { getByTestId } = render(
    <DischargeGuestModal
      visible
      guestId="guest-1"
      guestName="Jane Smith"
      onClose={mockOnClose}
      onSuccess={mockOnSuccess}
    />,
  );
  fireEvent.press(getByTestId('confirm-discharge-button'));
  await waitFor(() => expect(mockedDischarge).toHaveBeenCalled());
  expect(mockOnSuccess).not.toHaveBeenCalled();
});
