import { daysInclusive, maxDate, nextPeriodStart, periodFor, toLocalDate } from '../../rent/period';

describe('periodFor', () => {
  it('weekly is Monday to Sunday', () =>
    expect(periodFor('2026-11-18', 'weekly')).toEqual({
      start: '2026-11-16',
      end: '2026-11-22',
      days: 7,
    }));
  it('a Sunday belongs to the week that started the Monday before', () =>
    expect(periodFor('2026-11-22', 'weekly').start).toBe('2026-11-16'));
  it('monthly is the calendar month', () =>
    expect(periodFor('2026-11-20', 'monthly')).toEqual({
      start: '2026-11-01',
      end: '2026-11-30',
      days: 30,
    }));
  it('February in a common year has 28 days', () =>
    expect(periodFor('2027-02-20', 'monthly').days).toBe(28));
  it('February in a leap year has 29 days', () =>
    expect(periodFor('2028-02-20', 'monthly').days).toBe(29));
  it('a week across a DST change is still 7 days', () =>
    expect(periodFor('2026-11-01', 'weekly')).toEqual({
      start: '2026-10-26',
      end: '2026-11-01',
      days: 7,
    }));
});

describe('nextPeriodStart', () => {
  it('on a Monday is the following Monday', () =>
    expect(nextPeriodStart('2026-11-16', 'weekly')).toBe('2026-11-23'));
  it('on the 1st is the next month', () =>
    expect(nextPeriodStart('2026-11-01', 'monthly')).toBe('2026-12-01'));
  it('in December is January', () =>
    expect(nextPeriodStart('2026-12-31', 'monthly')).toBe('2027-01-01'));
});

describe('toLocalDate', () => {
  const NY = 'America/New_York';
  it('keeps a calendar date as is', () => expect(toLocalDate('2026-11-20', NY)).toBe('2026-11-20'));
  it('reads an ISO timestamp in the house zone', () =>
    expect(toLocalDate('2026-11-21T03:00:00.000Z', NY)).toBe('2026-11-20'));
  it('reads an ISO timestamp with no offset as a house-local wall time', () =>
    expect(toLocalDate('2026-11-20T23:30:00', NY)).toBe('2026-11-20'));
  it('reads a Firestore Timestamp', () =>
    expect(toLocalDate({ toMillis: () => Date.parse('2026-11-21T03:00:00Z') }, NY)).toBe(
      '2026-11-20',
    ));
  it('reads epoch milliseconds', () =>
    expect(toLocalDate(Date.parse('2026-11-20T17:00:00Z'), NY)).toBe('2026-11-20'));
  it.each(['', 'soon', '2026-13-01', '11/20/2026', null, undefined, {}])(
    'returns null for %p',
    (v) => expect(toLocalDate(v, NY)).toBeNull(),
  );
});

it('daysInclusive counts both ends', () =>
  expect(daysInclusive('2026-11-20', '2026-11-30')).toBe(11));

it('maxDate ignores empty values', () =>
  expect(maxDate(null, '2026-11-02', undefined, '2026-11-01')).toBe('2026-11-02'));

it('maxDate throws with no dates', () => expect(() => maxDate(null, undefined)).toThrow());
