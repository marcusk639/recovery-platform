// chargeResident against an in-memory store: proration, skips, who starts when,
// rates and the due date. The paths over time are in chargeResidentPaths.test.ts.

jest.mock('firebase-functions/v2', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('firebase-admin/firestore', () => ({
  FieldValue: require('../helpers/memFirestore').fieldValue,
}));
jest.mock('../../api/firestore', () => require('../helpers/memFirestore').apiFirestore);
jest.mock('../../util/notifications', () => ({ sendNotification: jest.fn() }));

import { mem } from '../helpers/memFirestore';
import { at, charges, guest, H, house, MAX, owed } from '../helpers/rentFixtures';
import { chargeDocId, chargeResident } from '../../rent/chargeResident';
import { sendNotification } from '../../util/notifications';

const notify = sendNotification as jest.Mock;

beforeEach(() => {
  mem.reset();
  notify.mockReset();
  notify.mockResolvedValue(undefined);
});

describe('basics', () => {
  it('a resident who moved in Wednesday Nov 18 owes $125.00 that day', async () => {
    house();
    guest();
    await expect(chargeResident('g1', at('2026-11-18'))).resolves.toEqual({
      status: 'charged',
      totalCents: 12500,
      periods: 1,
    });
    expect(owed()).toBe(12500);
    expect(charges()).toEqual(['rentCharges/g1_2026-11-18']);
    expect(mem.get('rentCharges/g1_2026-11-18')).toMatchObject({
      guestId: 'g1',
      houseId: H,
      guestUserId: 'u1',
      from: '2026-11-18',
      through: '2026-11-22',
      amountCents: 12500,
      daysCovered: 5,
      daysInPeriod: 7,
      rateCents: 17500,
      rateSource: 'house',
      frequency: 'weekly',
    });
    expect(mem.get('rentAccounts/g1')?.chargedThrough).toBe('2026-11-22');
    expect(mem.get('guests/g1')?.rentDueDate).toBe('2026-11-18');
  });

  it("intake's ISO moveInDate is read in the house zone", async () => {
    house();
    guest({ moveInDate: '2026-11-19T03:00:00.000Z' });
    await chargeResident('g1', at('2026-11-18'));
    expect(charges()).toEqual(['rentCharges/g1_2026-11-18']);
  });

  it('running again the same day charges nothing', async () => {
    house();
    guest();
    await chargeResident('g1', at('2026-11-18'));
    await expect(chargeResident('g1', at('2026-11-18'))).resolves.toEqual({
      status: 'skipped',
      reason: 'not-due',
    });
    expect(owed()).toBe(12500);
    expect(charges()).toHaveLength(1);
  });

  it('chargeDocId is the guest and the first day covered', () =>
    expect(chargeDocId('g1', '2026-11-18')).toBe('g1_2026-11-18'));
});

describe('skips write nothing', () => {
  const skipped = async (reason: string) => {
    await expect(chargeResident('g1', at('2026-11-18'))).resolves.toEqual({
      status: 'skipped',
      reason,
    });
    expect(charges()).toEqual([]);
    expect(mem.paths('rentAccounts/')).toEqual([]);
    expect(notify).not.toHaveBeenCalled();
  };
  it('paused', async () => {
    house();
    guest();
    mem.seed('config/rentCharges', { paused: true });
    await skipped('paused');
    expect(owed()).toBe(0);
  });
  it('missing', async () => {
    house();
    await skipped('missing');
  });
  // Firestore's increment replaces a non-number field, so a legacy "350" would vanish.
  // NaN is guarded too, but the in-memory store copies documents as JSON (NaN becomes null).
  it.each([['350'], [{ amount: 350 }]])('a balance that is not a number (%p) is left alone', async (bad) => {
    house();
    guest({ rentOwed: bad });
    await skipped('bad-balance');
    expect(owed()).toEqual(bad);
  });
  it('a null balance counts as nothing owed and is charged', async () => {
    house();
    guest({ rentOwed: null });
    await expect(chargeResident('g1', at('2026-11-18'))).resolves.toMatchObject({ status: 'charged', totalCents: 12500 });
    expect(owed()).toBe(12500);
  });
  it('inactive: discharged', async () => {
    house();
    guest({ status: 'discharged' });
    await skipped('inactive');
  });
  it('inactive: a moveOutDate', async () => {
    house();
    guest({ moveOutDate: '2026-11-17' });
    await skipped('inactive');
  });
  it('linked', async () => {
    house();
    guest({ rentLinkedTo: 'g2' });
    await skipped('linked');
  });
  it("charging-off: rentFrequency 'both'", async () => {
    house({ rentFrequency: 'both' });
    guest();
    await skipped('charging-off');
  });
  it('not-started: no stamp', async () => {
    house({ rentChargesStartDate: null, rentChargesStartedAtMs: null });
    guest();
    await skipped('not-started');
  });
});

describe('who starts when', () => {
  it('an existing resident starts the next Monday', async () => {
    house({ rentChargesStartedAtMs: MAX });
    guest({ moveInDate: '2026-10-01', rentOwed: 0 });
    await expect(chargeResident('g1', at('2026-11-11'))).resolves.toMatchObject({
      reason: 'not-due',
    });
    expect(mem.get('rentAccounts/g1')).toMatchObject({
      chargeFrom: '2026-11-16',
      anchoredTo: '2026-11-11',
      chargedThrough: null,
    });
    await expect(chargeResident('g1', at('2026-11-16'))).resolves.toMatchObject({
      totalCents: 17500,
    });
    expect(charges()).toEqual(['rentCharges/g1_2026-11-16']);
  });

  it('an imported resident starts at the period after the import', async () => {
    house();
    guest({ moveInDate: '2026-09-01', importedAt: '2026-11-18T15:00:00.000Z' });
    await expect(chargeResident('g1', at('2026-11-18'))).resolves.toMatchObject({
      reason: 'not-due',
    });
    expect(mem.get('rentAccounts/g1')?.chargeFrom).toBe('2026-11-23');
  });

  it('an import after charging began, with an earlier move-in and no marker, starts the period after it', async () => {
    house();
    mem.seedAt(
      'guests/g1',
      { houseId: 'H', status: 'active', rentOwed: 0, moveInDate: '2026-10-01' },
      at('2026-11-20').getTime(),
    );
    await expect(chargeResident('g1', at('2026-11-20'))).resolves.toMatchObject({
      reason: 'not-due',
    });
    expect(mem.get('rentAccounts/g1')?.chargeFrom).toBe('2026-11-23');
  });

  it('a US-format move-in date is not prorated from the day it was entered', async () => {
    house();
    mem.seedAt(
      'guests/g1',
      { houseId: 'H', status: 'active', rentOwed: 0, moveInDate: '10/1/2026' },
      at('2026-11-18').getTime(),
    );
    await expect(chargeResident('g1', at('2026-11-18'))).resolves.toMatchObject({
      reason: 'not-due',
    });
    expect(mem.get('rentAccounts/g1')?.chargeFrom).toBe('2026-11-23');
  });

  it('a future move-in charges nothing until that day', async () => {
    house();
    guest({ moveInDate: '2026-11-25' });
    await expect(chargeResident('g1', at('2026-11-18'))).resolves.toMatchObject({
      reason: 'not-due',
    });
    await expect(chargeResident('g1', at('2026-11-25'))).resolves.toMatchObject({
      totalCents: 12500,
    });
  });
});

describe('rates and the due date', () => {
  it('a custom weekly rate is used', async () => {
    house();
    guest({ customRent: { amountCents: 12000, frequency: 'weekly' } });
    await chargeResident('g1', at('2026-11-18'));
    expect(mem.get('rentCharges/g1_2026-11-18')).toMatchObject({
      amountCents: 8571,
      rateCents: 12000,
      rateSource: 'custom',
    });
  });

  it('a $0 custom rate records the charge, owes nothing and sends nothing', async () => {
    house();
    guest({ customRent: { amountCents: 0, frequency: 'weekly' } });
    await chargeResident('g1', at('2026-11-18'));
    expect(mem.get('rentCharges/g1_2026-11-18')?.amountCents).toBe(0);
    expect(mem.get('rentAccounts/g1')?.chargedThrough).toBe('2026-11-22');
    expect(owed()).toBe(0);
    expect(mem.get('guests/g1')?.rentDueDate).toBeUndefined();
    expect(notify).not.toHaveBeenCalled();
  });

  it('a custom rate above the cap skips the resident with bad-rate', async () => {
    house();
    guest({ customRent: { amountCents: 17500000, frequency: 'weekly' } });
    await expect(chargeResident('g1', at('2026-11-18'))).resolves.toEqual({
      status: 'skipped',
      reason: 'bad-rate',
    });
    expect(owed()).toBe(0);
    expect(charges()).toEqual([]);
  });

  it('rentDueDate stays on the oldest unpaid period', async () => {
    house();
    guest({ rentOwed: 5000, rentDueDate: '2026-11-02' });
    await chargeResident('g1', at('2026-11-18'));
    expect(owed()).toBe(17500);
    expect(mem.get('guests/g1')?.rentDueDate).toBe('2026-11-02');
  });
});
