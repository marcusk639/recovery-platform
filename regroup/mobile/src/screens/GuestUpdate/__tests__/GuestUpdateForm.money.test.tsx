/**
 * The rules let only a manager or above change rentOwed or choreFees, so the
 * edit form shows those fields to no one else. A peer leader's other edits
 * still save, without the money fields in the write.
 */
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

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
  choreFees: 1500,
  phase: 1,
  houseId: 'h1',
} as unknown as Guest;

const mockMutateAsync = jest.fn();
const mockMayEdit = jest.fn();

jest.mock('../../../hooks/useSelectedGuest', () => ({
  useSelectedGuest: () => ({ guest }),
}));
jest.mock('../../../state/queries/guestQueries', () => ({
  useGuests: () => ({ data: {} }),
  useUpdateGuest: () => ({ mutateAsync: mockMutateAsync }),
}));
jest.mock('../../../state/queries/houseTierQueries', () => ({
  useMayEditRentMoney: (houseId: string) => mockMayEdit(houseId),
}));

function renderForm() {
  return render(
    <GuestUpdateForm navigation={{ navigate: jest.fn(), goBack: jest.fn() } as never} />,
  );
}

describe('GuestUpdateForm money fields by tier', () => {
  beforeEach(() => {
    mockMutateAsync.mockReset().mockResolvedValue(undefined);
    mockMayEdit.mockReset();
  });

  it('shows Rent Owed and Chore Fees to a manager or above', () => {
    mockMayEdit.mockReturnValue(true);
    const { getByTestId } = renderForm();
    expect(getByTestId('guest-rentowed-input')).toBeTruthy();
    expect(getByTestId('guest-chorefees-input')).toBeTruthy();
    expect(mockMayEdit).toHaveBeenCalledWith('h1');
  });

  it('hides Rent Owed and Chore Fees from anyone else', () => {
    mockMayEdit.mockReturnValue(false);
    const { queryByTestId, getByTestId } = renderForm();
    expect(queryByTestId('guest-rentowed-input')).toBeNull();
    expect(queryByTestId('guest-chorefees-input')).toBeNull();
    expect(getByTestId('guest-firstname-input')).toBeTruthy();
  });

  it("saves a peer leader's other edits without the money fields", async () => {
    mockMayEdit.mockReturnValue(false);
    const { getByTestId } = renderForm();

    fireEvent.changeText(getByTestId('guest-firstname-input'), 'Janet');
    fireEvent.press(getByTestId('create-guest-button'));

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalled());
    const { updatedGuest, authoritativeFields } = mockMutateAsync.mock.calls[0][0];
    expect(updatedGuest.firstName).toBe('Janet');
    expect(updatedGuest).not.toHaveProperty('rentOwed');
    expect(updatedGuest).not.toHaveProperty('choreFees');
    expect(authoritativeFields).toEqual([]);
  });
});
