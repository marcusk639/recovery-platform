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
  it('turned off then on again, the gap is not charged', async () => {
    house({ rentChargesStartDate: '2026-12-09', rentChargesStartedAtMs: MAX });
    guest();
    account({ joinedOn: '2026-11-18', chargeFrom: '2026-11-18', chargedThrough: '2026-11-22' });
    await expect(chargeResident('g1', at('2026-12-09'))).resolves.toMatchObject({
      reason: 'not-due',
    });
    expect(mem.get('rentAccounts/g1')).toMatchObject({
      anchoredTo: '2026-12-09',
      chargeFrom: '2026-12-14',
    });
    await chargeResident('g1', at('2026-12-14'));
    expect(charges()).toEqual(['rentCharges/g1_2026-12-14']);
    expect(mem.get('rentCharges/g1_2026-12-14')?.amountCents).toBe(17500);
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
