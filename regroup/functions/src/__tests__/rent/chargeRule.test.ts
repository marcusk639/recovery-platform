import { chargeFromFor, nextChargeDay, planCharges } from '../../rent/chargeRule';
import { ChargeFromFacts, RentFrequency } from '../../rent/types';
import { Cents } from '../../util/money';

const first = (
  chargeFrom: string,
  frequency: RentFrequency,
  rate: number,
  today = chargeFrom,
  chargedThrough: string | null = null,
) => planCharges({ chargeFrom, chargedThrough, today, frequency, rateCents: rate as Cents });

describe('planCharges: the spec §4.3 examples', () => {
  it.each([
    [
      '$175/week, moves in Wednesday',
      first('2026-11-18', 'weekly', 17500),
      '2026-11-18',
      '2026-11-22',
      5,
      7,
      12500,
    ],
    [
      '$175/week, moves in Monday',
      first('2026-11-16', 'weekly', 17500),
      '2026-11-16',
      '2026-11-22',
      7,
      7,
      17500,
    ],
    [
      '$800/month, moves in Nov 20',
      first('2026-11-20', 'monthly', 80000),
      '2026-11-20',
      '2026-11-30',
      11,
      30,
      29333,
    ],
    [
      '$800/month, Feb 20 of a 28-day year',
      first('2027-02-20', 'monthly', 80000),
      '2027-02-20',
      '2027-02-28',
      9,
      28,
      25714,
    ],
    [
      'later Monday, full week',
      first('2026-11-16', 'weekly', 17500, '2026-11-23', '2026-11-22'),
      '2026-11-23',
      '2026-11-29',
      7,
      7,
      17500,
    ],
    [
      'weekly to $800/month on Nov 16',
      first('2026-11-02', 'monthly', 80000, '2026-11-16', '2026-11-15'),
      '2026-11-16',
      '2026-11-30',
      15,
      30,
      40000,
    ],
    [
      'monthly to $175/week, Dec 1 a Tuesday',
      first('2026-11-01', 'weekly', 17500, '2026-12-01', '2026-11-30'),
      '2026-12-01',
      '2026-12-06',
      6,
      7,
      15000,
    ],
  ])('%s', (_l, charges, from, through, days, inPeriod, cents) =>
    expect(charges[0]).toEqual({
      from,
      through,
      daysCovered: days,
      daysInPeriod: inPeriod,
      amountCents: cents,
    }),
  );
});

describe('planCharges', () => {
  it('nothing is due before chargeFrom', () =>
    expect(first('2026-11-25', 'weekly', 17500, '2026-11-20')).toEqual([]));
  it('nothing is due when already charged through this period', () =>
    expect(first('2026-11-16', 'weekly', 17500, '2026-11-20', '2026-11-22')).toEqual([]));
  it('catch-up after three missed Mondays is three charges, oldest first', () =>
    expect(
      first('2026-11-02', 'weekly', 17500, '2026-11-25', '2026-11-08').map((c) => c.from),
    ).toEqual(['2026-11-09', '2026-11-16', '2026-11-23']));
  it('catch-up stops at maxPeriods', () =>
    expect(
      planCharges({
        chargeFrom: '2026-01-05',
        chargedThrough: null,
        today: '2026-12-31',
        frequency: 'weekly',
        rateCents: 100 as Cents,
        maxPeriods: 12,
      }),
    ).toHaveLength(12));
  it('a zero rate still advances, with zero amounts', () =>
    expect(first('2026-11-18', 'weekly', 0)[0]).toMatchObject({
      through: '2026-11-22',
      amountCents: 0,
    }));
  it('nextChargeDay is the later of chargedThrough+1 and chargeFrom', () => {
    expect(nextChargeDay({ chargeFrom: '2026-11-01', chargedThrough: '2026-11-15' })).toBe(
      '2026-11-16',
    );
    expect(nextChargeDay({ chargeFrom: '2026-12-01', chargedThrough: '2026-11-15' })).toBe(
      '2026-12-01',
    );
    expect(nextChargeDay({ chargeFrom: '2026-11-18', chargedThrough: null })).toBe('2026-11-18');
  });
});

describe('chargeFromFor', () => {
  const facts = (o: Partial<ChargeFromFacts>): ChargeFromFacts => ({
    startDate: '2026-11-11',
    startedAtMs: 100,
    houseJoinedAtMs: 200,
    joinDate: '2026-11-18',
    importedOn: null,
    frequency: 'weekly',
    ...o,
  });
  it('a new resident starts on their join date', () =>
    expect(chargeFromFor(facts({}))).toBe('2026-11-18'));
  it('a backdated move-in is charged back, but not before charging began', () =>
    expect(chargeFromFor(facts({ joinDate: '2026-11-01' }))).toBe('2026-11-11'));
  it('a future move-in starts that day', () =>
    expect(chargeFromFor(facts({ joinDate: '2026-12-02' }))).toBe('2026-12-02'));
  it('a resident already in the house starts at the next period', () =>
    expect(chargeFromFor(facts({ houseJoinedAtMs: 50 }))).toBe('2026-11-16'));
  it('an imported resident starts at the period after the import', () =>
    expect(chargeFromFor(facts({ importedOn: '2026-11-18' }))).toBe('2026-11-23'));
  it('existing residents of a monthly house start on the 1st of next month', () =>
    expect(chargeFromFor(facts({ houseJoinedAtMs: 50, frequency: 'monthly' }))).toBe(
      '2026-12-01',
    ));
});
