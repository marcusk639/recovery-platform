import { guestMoneyUpdate, guestToFormValues } from '../guestFormValues';
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

function okPayload(guest: Guest, values: Record<string, unknown>) {
  const r = guestMoneyUpdate(guest, values);
  if (!r.ok) throw new Error('expected ok result');
  return r;
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

  it('turns the dollars the admin typed into an edit from the shown balance (#198)', () => {
    const guest = makeGuest();
    const { payload: updated, moneyEdits } = okPayload(guest, {
      ...guestToFormValues(guest),
      rentOwed: '750.50',
      choreFees: '10',
    });

    // From what the form showed to what was typed, so the save can be refused
    // if a payment landed while the form was open.
    expect(moneyEdits).toEqual({
      rentOwed: { from: 50000, to: 75050 },
      choreFees: { from: 2500, to: 1000 },
    });
    expect('rentOwed' in updated).toBe(false);
    expect('choreFees' in updated).toBe(false);
  });

  it('omits an untouched money field so a concurrent payment is not reverted', () => {
    const guest = makeGuest({ rentOwed: 123456 } as Partial<Guest>);
    const { payload: updated } = okPayload(guest, guestToFormValues(guest));

    // Submitting an absolute rentOwed the operator never touched would overwrite
    // whatever landed while the form was open — a resident's Stripe payment
    // decrements rentOwed server-side, and a stale form value would undo it.
    // Omitting the field leaves the stored value standing.
    expect('rentOwed' in updated).toBe(false);
    expect('choreFees' in updated).toBe(false);
  });

  it('reports only the money fields the operator actually changed', () => {
    const guest = makeGuest();
    const values = guestToFormValues(guest);

    expect(okPayload(guest, values).moneyEdits).toEqual({});
    expect(
      okPayload(guest, { ...values, rentOwed: '100' }).moneyEdits,
    ).toEqual({ rentOwed: { from: 50000, to: 10000 } });
    expect(
      okPayload(guest, { ...values, rentOwed: '100', choreFees: '1' })
        .moneyEdits,
    ).toEqual({
      rentOwed: { from: 50000, to: 10000 },
      choreFees: { from: 2500, to: 100 },
    });
  });

  it('does not treat a re-typed identical amount as a change', () => {
    const guest = makeGuest({ rentOwed: 50000 } as Partial<Guest>);
    // operator tabs through and retypes the same figure
    const values = { ...guestToFormValues(guest), rentOwed: '500.00' };

    expect(okPayload(guest, values).moneyEdits).toEqual({});
  });

  it('keeps the stored balance when the admin clears the field', () => {
    const guest = makeGuest();
    const { payload: updated } = okPayload(guest, {
      ...guestToFormValues(guest),
      rentOwed: '',
    });

    // Resolving a blank money field to zero would silently forgive a real debt.
    // The field is now omitted rather than written back with the stored figure,
    // which is strictly safer: the stored value stands and a concurrent payment
    // that landed while the form was open is not overwritten either.
    expect('rentOwed' in updated).toBe(false);
  });

  // Scope note: these exercise the CONVERSION only. The test that proves a
  // delta lands on the stored balance lives in
  // src/services/__tests__/guest.test.ts ("writes the typed balance when the stored
  // one is what the form showed"). Do not cite the test below as evidence that zeroing a balance
  // works end to end.
  it('turns an explicit zero into an edit to zero cents', () => {
    const guest = makeGuest();
    const { moneyEdits } = okPayload(guest, {
      ...guestToFormValues(guest),
      rentOwed: '0',
    });

    expect(moneyEdits.rentOwed).toEqual({ from: 50000, to: 0 });
  });

  it('leaves non-money fields untouched', () => {
    const guest = makeGuest();
    const { payload: updated } = okPayload(guest, {
      ...guestToFormValues(guest),
      firstName: 'Alex',
    });

    expect(updated.firstName).toBe('Alex');
    expect(updated.id).toBe('guest-1');
    expect(updated.houseId).toBe('house-1');
  });
});

describe('guestMoneyUpdate payload', () => {
  // updateGuest merges the payload over the server's copy, and the payload wins. A
  // cached field the operator never touched would overwrite a newer server value: the
  // hourly charge moves rentDueDate on, and below a manager the rules refuse any write
  // that changes rentDueDate or customRent, so a stale copy failed every save.
  it('sends only the fields the operator changed, with the record ids', () => {
    const guest = makeGuest({
      rentDueDate: '2026-10-01',
      customRent: { amountCents: 12000, frequency: 'weekly' },
      moveInDate: '2026-09-01',
      importedAt: '2026-09-01T00:00:00.000Z',
      phase: 'Phase 1',
    } as unknown as Partial<Guest>);
    const { payload } = okPayload(guest, { ...guestToFormValues(guest), phase: 'Phase 2' });

    expect(Object.keys(payload).sort()).toEqual(['houseId', 'id', 'phase']);
    expect(payload.phase).toBe('Phase 2');
  });
});

describe('guestMoneyUpdate malformed input', () => {
  const guest = { id: 'g1', rentOwed: 50000, choreFees: 0 } as never as Guest;

  it('flags unreadable money so the form can refuse to submit it', () => {
    // '12,34' used to parse back to the stored value, so it counted as
    // untouched and was dropped. Without this the operator is told the save
    // succeeded and the balance never moves.
    const r = guestMoneyUpdate(guest, {
      ...guestToFormValues(guest),
      rentOwed: '12,34',
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.malformedFields).toContain('rentOwed');
  });

  it('does not flag a cleared field, which deliberately keeps the stored value', () => {
    const r = guestMoneyUpdate(guest, {
      ...guestToFormValues(guest),
      rentOwed: '',
    });
    expect(r.ok).toBe(true);
  });

  it('does not flag a readable edit', () => {
    const r = guestMoneyUpdate(guest, {
      ...guestToFormValues(guest),
      rentOwed: '400',
    });
    expect(r.ok).toBe(true);
  });
});

describe('guestMoneyUpdate', () => {
  const guest = { id: 'g1', rentOwed: 50000, choreFees: 0 } as never as Guest;
  const seeded = () => guestToFormValues(guest);

  it('converts a changed field to the change in cents, not a total (#198)', () => {
    const r = guestMoneyUpdate(guest, { ...seeded(), rentOwed: '400' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.moneyEdits).toEqual({ rentOwed: { from: 50000, to: 40000 } });
    expect('rentOwed' in r.payload).toBe(false);
  });

  it('omits an untouched field so a concurrent decrement is not undone', () => {
    const r = guestMoneyUpdate(guest, seeded());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect('rentOwed' in r.payload).toBe(false);
    expect(r.authoritativeFields).toHaveLength(0);
  });

  it('keeps the stored balance when the operator clears the field', () => {
    const r = guestMoneyUpdate(guest, { ...seeded(), rentOwed: '' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect('rentOwed' in r.payload).toBe(false);
  });

  it('rejects unreadable input and names the field', () => {
    const r = guestMoneyUpdate(guest, { ...seeded(), rentOwed: '12,34' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.malformedFields).toEqual(['rentOwed']);
  });

  it('submits an explicit zero as clearing the balance the form showed', () => {
    const r = guestMoneyUpdate(guest, { ...seeded(), rentOwed: '0' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.moneyEdits.rentOwed).toEqual({ from: 50000, to: 0 });
  });

  it('does not reject a seeded value the operator never touched', () => {
    // guestToFormValues seeds centsToDollars(stored); a non-integer balance
    // seeds '0.005', which parseDollarsField rejects. Rejecting a value the
    // form itself produced would make that guest permanently unsaveable in
    // EVERY field. Production holds none today (170 guests scanned), but
    // migrateBalanceToCents.ts exists because they once did.
    const odd = { id: 'g2', rentOwed: 0.5, choreFees: 0 } as never as Guest;
    const r = guestMoneyUpdate(odd, guestToFormValues(odd));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect('rentOwed' in r.payload).toBe(false);
  });

  it('preserves non-money fields on the payload', () => {
    const r = guestMoneyUpdate(guest, { ...seeded(), firstName: 'Janet' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.firstName).toBe('Janet');
  });
});
