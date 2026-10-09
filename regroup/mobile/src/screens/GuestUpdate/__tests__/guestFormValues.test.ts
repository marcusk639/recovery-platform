import {
  formValuesToGuest,
  guestToFormValues,
} from '../guestFormValues';
import { Guest } from '../../../entities/Guest';

function makeGuest(overrides: Partial<Guest> = {}): Guest {
  return {
    id: 'guest-1',
    houseId: 'house-1',
    firstName: 'Sam',
    lastName: 'R',
    rentOwed: 50000,
    choreFees: 2500,
    ...overrides,
  } as unknown as Guest;
}

describe('guest update form money boundary', () => {
  it('shows the stored cents balance to the admin as dollars', () => {
    const values = guestToFormValues(makeGuest());

    // 50000 cents is $500.00 — an admin must never be shown "50000" in a field
    // labelled as money, which is what shipped before: the raw cents value went
    // straight into the input and every other screen rendered it as dollars.
    expect(values.rentOwed).toBe(500);
    expect(values.choreFees).toBe(25);
  });

  it('converts the dollars the admin typed back into cents', () => {
    const guest = makeGuest();
    const updated = formValuesToGuest(guest, {
      ...guestToFormValues(guest),
      rentOwed: '750.50',
      choreFees: '10',
    });

    expect(updated.rentOwed).toBe(75050);
    expect(updated.choreFees).toBe(1000);
  });

  it('round-trips an untouched form without changing the balance', () => {
    const guest = makeGuest({ rentOwed: 123456 } as Partial<Guest>);
    const updated = formValuesToGuest(guest, guestToFormValues(guest));

    expect(updated.rentOwed).toBe(123456);
  });

  it('keeps the stored balance when the admin clears the field', () => {
    const guest = makeGuest();
    const updated = formValuesToGuest(guest, {
      ...guestToFormValues(guest),
      rentOwed: '',
    });

    // Resolving a blank money field to zero would silently forgive a real debt.
    expect(updated.rentOwed).toBe(50000);
  });

  it('accepts an explicit zero as a real zero', () => {
    const guest = makeGuest();
    const updated = formValuesToGuest(guest, {
      ...guestToFormValues(guest),
      rentOwed: '0',
    });

    expect(updated.rentOwed).toBe(0);
  });

  it('leaves non-money fields untouched', () => {
    const guest = makeGuest();
    const updated = formValuesToGuest(guest, {
      ...guestToFormValues(guest),
      firstName: 'Alex',
    });

    expect(updated.firstName).toBe('Alex');
    expect(updated.id).toBe('guest-1');
    expect(updated.houseId).toBe('house-1');
  });
});
