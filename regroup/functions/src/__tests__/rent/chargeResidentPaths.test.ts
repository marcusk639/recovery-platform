// chargeResident, the paths over time: schedule switches, catch-up, off and on,
// moves, re-activation, exactly-once under concurrency, and notifications.

jest.mock('firebase-functions/v2', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('firebase-admin/firestore', () => ({
  FieldValue: require('../helpers/memFirestore').fieldValue,
}));
jest.mock('../../api/firestore', () => require('../helpers/memFirestore').apiFirestore);
jest.mock('../../util/notifications', () => ({ sendNotification: jest.fn() }));

import { mem } from '../helpers/memFirestore';
import { account, at, charges, guest, house, MAX, owed } from '../helpers/rentFixtures';
import { chargeResident } from '../../rent/chargeResident';
import { sendNotification } from '../../util/notifications';

const notify = sendNotification as jest.Mock;

beforeEach(() => {
  mem.reset();
  notify.mockReset();
  notify.mockResolvedValue(undefined);
});

describe('schedule switches', () => {
  it('weekly through Sun Nov 15, switch to $800/month, Nov 16 charges $400.00 for Nov 16–30', async () => {
    house({ rentFrequency: 'monthly' });
    guest();
    account({ chargedThrough: '2026-11-15' });
    await chargeResident('g1', at('2026-11-16'));
    expect(mem.get('rentCharges/g1_2026-11-16')).toMatchObject({
      through: '2026-11-30',
      daysCovered: 15,
      daysInPeriod: 30,
      amountCents: 40000,
      frequency: 'monthly',
    });
    expect(charges()).toHaveLength(1);
  });

  it('monthly through Nov 30, switch to $175/week, Dec 1 charges $150.00 for Dec 1–6', async () => {
    house({ rentFrequency: 'weekly' });
    guest();
    account({ chargeFrom: '2026-11-01', chargedThrough: '2026-11-30' });
    await chargeResident('g1', at('2026-12-01'));
    expect(mem.get('rentCharges/g1_2026-12-01')).toMatchObject({
      through: '2026-12-06',
      daysCovered: 6,
      daysInPeriod: 7,
      amountCents: 15000,
    });
    expect(charges()).toHaveLength(1);
  });
});

describe('catch-up', () => {
  it('catch-up after a missed week makes two records and one notification', async () => {
    house();
    guest();
    account({ chargeFrom: '2026-11-18', chargedThrough: '2026-11-22' });
    await expect(chargeResident('g1', at('2026-12-01'))).resolves.toEqual({
      status: 'charged',
      totalCents: 35000,
      periods: 2,
    });
    expect(charges()).toEqual(['rentCharges/g1_2026-11-23', 'rentCharges/g1_2026-11-30']);
    expect(mem.get('rentAccounts/g1')?.chargedThrough).toBe('2026-12-06');
    expect(notify).toHaveBeenCalledTimes(1);
  });
});

describe('off and on, moves', () => {
  // Owner decision 2026-11-09: a resident already charged here resumes from the day
  // charging came back on, prorated. The time it was off is not charged.
  it('turned off then on again, the gap is not charged and charging resumes prorated', async () => {
    house({ rentChargesStartDate: '2026-12-09', rentChargesStartedAtMs: MAX });
    guest();
    account({ joinedOn: '2026-11-18', chargeFrom: '2026-11-18', chargedThrough: '2026-11-22' });
    await chargeResident('g1', at('2026-12-09'));
    expect(mem.get('rentAccounts/g1')).toMatchObject({
      anchoredTo: '2026-12-09',
      chargeFrom: '2026-12-09',
    });
    expect(charges()).toEqual(['rentCharges/g1_2026-12-09']);
    expect(mem.get('rentCharges/g1_2026-12-09')?.amountCents).toBe(12500);
    await chargeResident('g1', at('2026-12-14'));
    expect(mem.get('rentCharges/g1_2026-12-14')?.amountCents).toBe(17500);
  });

  it('off Oct 31 and back on Nov 2 at $800/month charges Nov 2-30, not nothing', async () => {
    house({
      rentFrequency: 'monthly',
      rentChargesStartDate: '2026-11-02',
      rentChargesStartedAtMs: MAX,
    });
    guest();
    account({
      joinedOn: '2026-09-01',
      anchoredTo: '2026-09-01',
      chargeFrom: '2026-09-01',
      chargedThrough: '2026-10-31',
    });
    await chargeResident('g1', at('2026-11-02'));
    expect(charges()).toEqual(['rentCharges/g1_2026-11-02']);
    expect(mem.get('rentCharges/g1_2026-11-02')?.amountCents).toBe(77333);
  });

  it('charges that ended before the resident joined this house do not count: next full period', async () => {
    house({ rentChargesStartDate: '2026-12-09', rentChargesStartedAtMs: MAX });
    guest();
    // Charged at the house they lived in before.
    account({ joinedOn: '2026-11-25', chargeFrom: '2026-09-01', chargedThrough: '2026-11-22', chargedHouseId: 'A' });
    await expect(chargeResident('g1', at('2026-12-09'))).resolves.toMatchObject({
      reason: 'not-due',
    });
    expect(mem.get('rentAccounts/g1')).toMatchObject({ chargeFrom: '2026-12-14' });
  });

  it('a short off and on carries on: charged through Sun Nov 22, back on Mon Nov 23', async () => {
    house({ rentChargesStartDate: '2026-11-23', rentChargesStartedAtMs: MAX });
    guest();
    account({ chargeFrom: '2026-11-18', chargedThrough: '2026-11-22' });
    await chargeResident('g1', at('2026-11-23'));
    expect(charges()).toEqual(['rentCharges/g1_2026-11-23']);
    expect(mem.get('rentCharges/g1_2026-11-23')?.amountCents).toBe(17500);
  });

  it('off and on again within a charged week carries on at the next Monday', async () => {
    house({ rentChargesStartDate: '2026-11-19', rentChargesStartedAtMs: MAX });
    guest();
    account({ chargeFrom: '2026-11-18', chargedThrough: '2026-11-22' });
    await expect(chargeResident('g1', at('2026-11-19'))).resolves.toMatchObject({
      reason: 'not-due',
    });
    await chargeResident('g1', at('2026-11-23'));
    expect(charges()).toEqual(['rentCharges/g1_2026-11-23']);
  });

  it('a schedule switch made in two steps still charges $400.00 on Nov 16', async () => {
    // Monthly chosen while the monthly price was 0 (charging off), then $800 typed:
    // the house is re-stamped Nov 16.
    house({
      rentFrequency: 'monthly',
      rentChargesStartDate: '2026-11-16',
      rentChargesStartedAtMs: MAX,
    });
    guest();
    account({ chargedThrough: '2026-11-15' });
    await chargeResident('g1', at('2026-11-16'));
    expect(mem.get('rentCharges/g1_2026-11-16')?.amountCents).toBe(40000);
  });

  it('a move keeps chargedThrough', async () => {
    house({}, 'A');
    house({ rentChargesStartDate: '2026-11-04' }, 'B');
    guest({ houseId: 'B' });
    account({ houseId: 'A', joinedOn: '2026-11-20', chargedThrough: '2026-11-22' });
    await expect(chargeResident('g1', at('2026-11-20'))).resolves.toMatchObject({
      reason: 'not-due',
    });
    await chargeResident('g1', at('2026-11-23'));
    expect(charges()).toEqual(['rentCharges/g1_2026-11-23']);
    expect(mem.get('rentCharges/g1_2026-11-23')).toMatchObject({
      houseId: 'B',
      amountCents: 17500,
    });
  });

  it('a move the trigger has not recorded yet is charged from today, not back-charged', async () => {
    house({ rentFrequency: 'both' }, 'A');
    house({ rentFrequency: 'monthly', rentChargesStartDate: '2026-09-01' }, 'B');
    guest({ houseId: 'B' });
    account({
      houseId: 'A',
      anchoredTo: '2026-09-01',
      joinedOn: '2026-09-01',
      chargeFrom: '2026-09-01',
      chargedThrough: '2026-09-30',
    });
    await chargeResident('g1', at('2026-11-20'));
    expect(charges()).toEqual(['rentCharges/g1_2026-11-20']);
    expect(mem.get('rentCharges/g1_2026-11-20')?.amountCents).toBe(29333);
    expect(mem.get('rentAccounts/g1')).toMatchObject({ houseId: 'B', joinedOn: '2026-11-20' });
  });

  it('a re-activation the trigger has not recorded yet is not charged for the time away', async () => {
    house();
    guest();
    account({ chargedThrough: '2026-08-30', inactiveSince: '2026-09-02', reactivatedOn: null });
    await chargeResident('g1', at('2026-11-18'));
    expect(charges()).toEqual(['rentCharges/g1_2026-11-18']);
    expect(owed()).toBe(12500);
  });

  it('a re-activation already recorded after the departure is used as is', async () => {
    house();
    guest();
    account({
      chargedThrough: '2026-08-30',
      inactiveSince: '2026-09-02',
      reactivatedOn: '2026-11-16',
    });
    await chargeResident('g1', at('2026-11-18'));
    expect(charges()).toEqual(['rentCharges/g1_2026-11-16']);
  });

  it('a resident returning in the period charging turned on is charged from the return', async () => {
    house({ rentChargesStartedAtMs: MAX });
    guest({ moveInDate: '2026-09-01' });
    mem.seed('rentAccounts/g1', { guestId: 'g1', reactivatedOn: '2026-11-12' });
    await chargeResident('g1', at('2026-11-12'));
    expect(charges()).toEqual(['rentCharges/g1_2026-11-12']);
    expect(mem.get('rentCharges/g1_2026-11-12')?.amountCents).toBe(10000);
  });

  it('a re-activated resident is not charged for the time away', async () => {
    house();
    guest();
    account({ chargedThrough: '2026-11-15', reactivatedOn: '2026-12-02' });
    await chargeResident('g1', at('2026-12-02'));
    expect(charges()).toEqual(['rentCharges/g1_2026-12-02']);
    expect(mem.get('rentCharges/g1_2026-12-02')?.amountCents).toBe(12500);
  });
});

describe('concurrency', () => {
  it('two concurrent calls charge once', async () => {
    house();
    guest();
    let inner: unknown;
    mem.beforeCommit = async () => {
      mem.beforeCommit = null;
      inner = await chargeResident('g1', at('2026-11-18'));
    };
    const outer = await chargeResident('g1', at('2026-11-18'));
    expect(owed()).toBe(12500);
    expect(charges()).toHaveLength(1);
    expect([outer, inner]).toContainEqual({ status: 'skipped', reason: 'not-due' });
    expect([outer, inner]).toContainEqual({ status: 'charged', totalCents: 12500, periods: 1 });
  });
});

describe('the rest', () => {
  it('a house with no Stripe account is still charged', async () => {
    house({ stripeAccountId: '' });
    guest();
    await chargeResident('g1', at('2026-11-18'));
    expect(owed()).toBe(12500);
  });

  it("a house with subscriptionStatus 'canceled' is still charged", async () => {
    house({ subscriptionStatus: 'canceled' });
    guest();
    await chargeResident('g1', at('2026-11-18'));
    expect(owed()).toBe(12500);
  });

  it('a notification failure does not fail the charge', async () => {
    house();
    guest();
    notify.mockRejectedValue(new Error('no token'));
    await expect(chargeResident('g1', at('2026-11-18'))).resolves.toMatchObject({
      status: 'charged',
    });
    expect(owed()).toBe(12500);
  });

  it('the notification body is the amount only', async () => {
    house();
    guest();
    await chargeResident('g1', at('2026-11-18'));
    expect(notify).toHaveBeenCalledWith({
      recipientId: 'u1',
      title: 'Rent added',
      body: '$125.00 was added to your balance.',
    });
  });

  it('a resident with no account gets no notification', async () => {
    house();
    guest({ userId: '' });
    await chargeResident('g1', at('2026-11-18'));
    expect(owed()).toBe(12500);
    expect(mem.get('rentCharges/g1_2026-11-18')?.guestUserId).toBeNull();
    expect(notify).not.toHaveBeenCalled();
  });
});
