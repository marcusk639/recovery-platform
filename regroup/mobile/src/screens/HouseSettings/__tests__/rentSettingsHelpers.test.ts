import {
  formatRentDay,
  initialPriceText,
  parseRentPrice,
  rentUpdateFor,
  scheduleOf,
  staleCustomRates,
} from '../rentSettingsHelpers';
import { asDollars } from '../../../util/money';

describe('scheduleOf', () => {
  it("reads 'both' (and anything unknown) as charging off", () => {
    expect(scheduleOf({ rentFrequency: 'both' })).toBe('off');
    expect(scheduleOf({})).toBe('off');
    expect(scheduleOf({ rentFrequency: 'weekly' })).toBe('weekly');
    expect(scheduleOf({ rentFrequency: 'monthly' })).toBe('monthly');
  });
});

describe('parseRentPrice', () => {
  it('reads "175" as 175 dollars (17500 cents), never 175 cents', () => {
    expect(parseRentPrice('175', 'weekly')).toEqual({ ok: true, dollars: 175, cents: 17500 });
  });
  it('keeps cents typed after the point: "$175.50" is 175.5 dollars', () => {
    expect(parseRentPrice('$175.50', 'weekly')).toEqual({ ok: true, dollars: 175.5, cents: 17550 });
  });
  it('refuses a blank, zero or malformed price', () => {
    expect(parseRentPrice('', 'weekly')).toMatchObject({ ok: false });
    expect(parseRentPrice('0', 'weekly')).toMatchObject({ ok: false });
    expect(parseRentPrice('12,34', 'monthly')).toMatchObject({ ok: false });
  });
  it('refuses a weekly price above $2,500 (cents typed as dollars), allows $3,000 monthly', () => {
    expect(parseRentPrice('17500', 'weekly')).toMatchObject({
      ok: false,
      message: 'A weekly price can be at most $2,500',
    });
    expect(parseRentPrice('3000', 'monthly')).toEqual({ ok: true, dollars: 3000, cents: 300000 });
    expect(parseRentPrice('10001', 'monthly')).toMatchObject({ ok: false });
  });
});

describe('rentUpdateFor', () => {
  it("weekly $175 writes weeklyRent: 175 (dollars) and rentFrequency: 'weekly'", () => {
    expect(rentUpdateFor('weekly', asDollars(175))).toEqual({
      rentFrequency: 'weekly',
      weeklyRent: 175,
    });
  });
  it("monthly $800 writes monthlyRent: 800 and rentFrequency: 'monthly'", () => {
    expect(rentUpdateFor('monthly', asDollars(800))).toEqual({
      rentFrequency: 'monthly',
      monthlyRent: 800,
    });
  });
  it("Off writes only rentFrequency: 'both', keeping the prices", () => {
    expect(rentUpdateFor('off')).toEqual({ rentFrequency: 'both' });
  });
});

describe('initialPriceText', () => {
  it("shows the stored dollars for the schedule's own field", () => {
    const house = { weeklyRent: asDollars(175), monthlyRent: asDollars(800) };
    expect(initialPriceText(house, 'weekly')).toBe('175');
    expect(initialPriceText(house, 'monthly')).toBe('800');
    expect(initialPriceText(house, 'off')).toBe('');
    expect(initialPriceText({ weeklyRent: asDollars(0) }, 'weekly')).toBe('');
  });
});

describe('staleCustomRates', () => {
  const guests: Parameters<typeof staleCustomRates>[0] = {
    g1: {
      id: 'g1',
      firstName: 'Ann',
      lastName: 'A',
      customRent: { amountCents: 60000, frequency: 'monthly' },
    },
    g2: {
      id: 'g2',
      firstName: 'Bo',
      lastName: 'B',
      customRent: { amountCents: 12000, frequency: 'weekly' },
    },
    g3: { id: 'g3', firstName: 'Cy', lastName: 'C', customRent: null },
    g4: {
      id: 'g4',
      firstName: 'Di',
      lastName: 'D',
      status: 'discharged',
      customRent: { amountCents: 1, frequency: 'monthly' },
    },
  };
  it('lists the active residents whose own rate is for the other schedule', () => {
    expect(staleCustomRates(guests, 'weekly')).toEqual([
      { guestId: 'g1', label: 'Ann A', amountCents: 60000, frequency: 'monthly' },
    ]);
    expect(staleCustomRates(guests, 'monthly').map((r) => r.guestId)).toEqual(['g2']);
  });
  it('lists nobody while charging is off', () => {
    expect(staleCustomRates(guests, 'off')).toEqual([]);
  });
});

describe('formatRentDay', () => {
  it('formats a calendar date without shifting it through UTC', () => {
    expect(formatRentDay('2026-11-23')).toBe('Mon, Nov 23');
    expect(formatRentDay('2026-12-01')).toBe('Tue, Dec 1');
  });
});
