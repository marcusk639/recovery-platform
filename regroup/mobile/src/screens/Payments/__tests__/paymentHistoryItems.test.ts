import { buildHistoryItems } from '../paymentHistoryItems';
import { chargeDetail, chargeLabel } from '../../../util/paymentDisplay';
import type { RentCharge } from '../../../services/rentCharges';
import type { RentPayment } from '../../../services/payments';
import { asCents } from '../../../util/money';

const charge = (fields: Partial<RentCharge> = {}): RentCharge => ({
  id: 'g1_2026-11-16',
  guestId: 'g1',
  houseId: 'h1',
  amountCents: asCents(17500),
  daysCovered: 7,
  daysInPeriod: 7,
  firstDay: '2026-11-16',
  lastDay: '2026-11-22',
  rateSource: 'house',
  ...fields,
});

const payment = (id: string, createdAt: string): RentPayment =>
  ({
    id,
    amount: 17500,
    status: 'succeeded',
    createdAt,
    guestId: 'g1',
    houseId: 'h1',
  }) as RentPayment;

describe('chargeLabel', () => {
  it('names the period: "Rent, Nov 16–22"', () => {
    expect(chargeLabel(charge())).toBe('Rent, Nov 16–22');
  });
  it('names both months when the week crosses one: "Rent, Nov 30–Dec 6"', () => {
    expect(chargeLabel(charge({ firstDay: '2026-11-30', lastDay: '2026-12-06' }))).toBe(
      'Rent, Nov 30–Dec 6',
    );
  });
  it('a single day is one date', () => {
    expect(chargeLabel(charge({ firstDay: '2026-11-22', lastDay: '2026-11-22' }))).toBe(
      'Rent, Nov 22',
    );
  });
});

describe('chargeDetail', () => {
  it('says how many days a prorated charge covers: "5 of 7 days"', () => {
    expect(chargeDetail(charge({ daysCovered: 5 }))).toBe('5 of 7 days');
  });
  it('says nothing for a full period at the house price', () => {
    expect(chargeDetail(charge())).toBe('');
  });
  it("says when the resident's own rate was used", () => {
    expect(chargeDetail(charge({ rateSource: 'custom', daysCovered: 5 }))).toBe(
      '5 of 7 days · own rate',
    );
  });
});

describe('buildHistoryItems', () => {
  it('puts a charge between the payments around it, newest first', () => {
    const items = buildHistoryItems(
      [
        payment('p-late', '2026-11-20T15:00:00.000Z'),
        payment('p-early', '2026-11-10T15:00:00.000Z'),
      ],
      [charge()],
    );
    expect(items.map((i) => i.key)).toEqual([
      'payment-p-late',
      'charge-g1_2026-11-16',
      'payment-p-early',
    ]);
  });
  it('keeps the payments as they were when there are no charges', () => {
    const items = buildHistoryItems([payment('a', '2026-11-10T15:00:00.000Z')], []);
    expect(items).toEqual([
      { kind: 'payment', key: 'payment-a', payment: expect.objectContaining({ id: 'a' }) },
    ]);
  });
});
