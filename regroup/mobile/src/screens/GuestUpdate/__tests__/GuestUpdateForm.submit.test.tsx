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
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { logException } from '../../../util/logging';

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
// The money fields are shown only to a manager or above
// (GuestUpdateForm.money.test.tsx); these tests edit them as one.
jest.mock('../../../state/queries/houseTierQueries', () => ({
  useMayEditRentMoney: () => true,
}));

jest.mock('../../../util/logging', () => ({ logException: jest.fn(), logDebug: jest.fn() }));

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

    await findByText(/Enter an amount like/i);

    // Every field is marked touched on submit, so an error misrouted to ANY
    // input would still render the text. Pin the attachment instead: climb from
    // the rentOwed input to the first container that holds the message — that
    // container is the field's own, so it must not also hold another input.
    let container = getByTestId('guest-rentowed-input').parent;
    while (
      container &&
      within(container).queryByText(/Enter an amount like/i) === null
    ) {
      container = container.parent;
    }
    expect(container).toBeTruthy();
    expect(
      within(container!).queryByTestId('guest-firstname-input'),
    ).toBeNull();
  });

  it('still submits a readable edit, from the shown balance to the typed one (#198)', async () => {
    const { getByTestId } = renderForm();

    fireEvent.changeText(getByTestId('guest-rentowed-input'), '400');
    fireEvent.press(getByTestId('create-guest-button'));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalled();
    });
    const { updatedGuest, moneyEdits } = mockMutateAsync.mock.calls[0][0];
    // The form showed $500; the operator typed $400.
    expect(moneyEdits).toEqual({ rentOwed: { from: 50000, to: 40000 } });
    expect('rentOwed' in updatedGuest).toBe(false);
  });

  it('says the balance changed, and by how much, when the save is refused (review)', async () => {
    const { Alert } = require('react-native');
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockMutateAsync.mockRejectedValue(
      Object.assign(new Error('changed'), {
        kind: 'balance-changed',
        field: 'rentOwed',
        currentCents: 15000,
      }),
    );
    const { getByTestId } = renderForm();

    fireEvent.changeText(getByTestId('guest-rentowed-input'), '400');
    fireEvent.press(getByTestId('create-guest-button'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'The balance changed',
        "Rent owed is now $150.00, probably from a payment. Check it and save again.",
      ),
    );
  });
});

describe('GuestUpdateForm when the save fails', () => {
  beforeEach(() => {
    mockGuestRef.current = guest;
    (logException as jest.Mock).mockReset();
  });
  afterEach(() => jest.restoreAllMocks());

  async function saveWith(error: unknown) {
    mockMutateAsync.mockReset().mockRejectedValue(error);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { getByTestId } = renderForm();
    fireEvent.changeText(getByTestId('guest-firstname-input'), 'Janet');
    fireEvent.press(getByTestId('create-guest-button'));
    await waitFor(() => expect(alert).toHaveBeenCalled());
    return alert;
  }

  it('says so when the rules refuse it, rather than failing silently', async () => {
    const alert = await saveWith(Object.assign(new Error('denied'), { code: 'firestore/permission-denied' }));
    expect(alert.mock.calls[0][1]).toMatch(/permission/i);
    expect(logException).toHaveBeenCalled();
  });

  it('says so, and logs it, for any other failure', async () => {
    const alert = await saveWith(new Error('offline'));
    expect(alert.mock.calls[0][1]).toMatch(/couldn.t save/i);
    expect(logException).toHaveBeenCalled();
  });
});