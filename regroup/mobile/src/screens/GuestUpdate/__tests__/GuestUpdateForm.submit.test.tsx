/**
 * Pins the form -> service seam.
 *
 * Both halves of the malformed-money guard were covered in isolation —
 * `guestMoneyUpdate` computes the verdict, and the parser distinguishes blank
 * from malformed — but nothing proved the FORM consults either one. Deleting
 * the guard from handleSubmit left every other test green, which is the same
 * blind spot that let the original bug through: an operator types an unreadable
 * amount, the field parses back to the stored value, the edit is dropped as
 * "unchanged", and the form reports success.
 */
import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import GuestUpdateForm from '../GuestUpdateForm';
import { Guest } from '../../../entities/Guest';

const guest = {
  id: 'g1',
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane@example.com',
  phoneNumber: '5551234567',
  sobrietyDate: '',
  drugOfChoice: 'none',
  dailyHabit: 'none',
  rentOwed: 50000,
  choreFees: 0,
  phase: 1,
  houseId: 'h1',
} as unknown as Guest;

const mockMutateAsync = jest.fn();

jest.mock('../../../hooks/useSelectedGuest', () => ({
  useSelectedGuest: () => ({ guest: mockGuestRef.current }),
}));
jest.mock('../../../state/queries/guestQueries', () => ({
  useGuests: () => ({ data: {} }),
  useUpdateGuest: () => ({ mutateAsync: mockMutateAsync }),
}));

const mockGuestRef: { current: Guest | undefined } = { current: guest };

function renderForm() {
  return render(
    <GuestUpdateForm
      navigation={{ navigate: jest.fn(), goBack: jest.fn() } as never}
    />,
  );
}

describe('GuestUpdateForm submit guard', () => {
  beforeEach(() => {
    mockMutateAsync.mockReset().mockResolvedValue(undefined);
    mockGuestRef.current = guest;
  });

  it('refuses to submit when a money field is unreadable', async () => {
    const { getByTestId } = renderForm();

    fireEvent.changeText(getByTestId('guest-rentowed-input'), '12,34');
    fireEvent.press(getByTestId('create-guest-button'));

    // Flush the async submit before asserting. `waitFor` with a negative
    // assertion is satisfied immediately — at t=0 nothing has been called yet —
    // so it would pass even with the guard deleted.
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('tells the operator which field it could not read', async () => {
    const { getByTestId, findByText } = renderForm();

    fireEvent.changeText(getByTestId('guest-rentowed-input'), '12,34');
    fireEvent.press(getByTestId('create-guest-button'));

    expect(await findByText(/Enter an amount like/i)).toBeTruthy();
  });

  it('still submits a readable edit, in cents, marked authoritative', async () => {
    const { getByTestId } = renderForm();

    fireEvent.changeText(getByTestId('guest-rentowed-input'), '400');
    fireEvent.press(getByTestId('create-guest-button'));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalled();
    });
    const { updatedGuest, authoritativeFields } = mockMutateAsync.mock.calls[0][0];
    expect(updatedGuest.rentOwed).toBe(40000);
    expect(authoritativeFields).toContain('rentOwed');
  });
});
