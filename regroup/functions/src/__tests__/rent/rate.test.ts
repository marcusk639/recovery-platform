import { residentRate, rentSettingsOf } from '../../rent/rate';

const house = (o: Record<string, unknown> = {}) => ({
  rentFrequency: 'weekly',
  weeklyRent: 175,
  monthlyRent: 800,
  timezone: 'America/Chicago',
  ...o,
});

describe('rentSettingsOf', () => {
  it('weekly uses weeklyRent, in cents', () =>
    expect(rentSettingsOf(house())).toMatchObject({
      frequency: 'weekly',
      priceCents: 17500,
      timeZone: 'America/Chicago',
    }));
  it('monthly uses monthlyRent', () =>
    expect(rentSettingsOf(house({ rentFrequency: 'monthly' }))?.priceCents).toBe(80000));
  it('19.99 dollars is 1999 cents, not 1998', () =>
    expect(rentSettingsOf(house({ weeklyRent: 19.99 }))?.priceCents).toBe(1999));
  it.each([
    ['both', { rentFrequency: 'both' }],
    ['missing schedule', { rentFrequency: undefined }],
    ['zero price', { weeklyRent: 0 }],
    ['string price', { weeklyRent: '175' }],
    ['NaN', { weeklyRent: NaN }],
    ['negative', { weeklyRent: -5 }],
    ['cents-sized', { weeklyRent: 17500 }],
  ])('is off for %s', (_l, o) => expect(rentSettingsOf(house(o))).toBeNull());
  it('exactly the limit is still on', () =>
    expect(rentSettingsOf(house({ weeklyRent: 10000 }))?.priceCents).toBe(1000000));
  it('an empty timezone falls back to New York', () =>
    expect(rentSettingsOf(house({ timezone: '' }))?.timeZone).toBe('America/New_York'));
  it('carries the start stamp from the server-only state', () =>
    expect(rentSettingsOf(house(), { startDate: '2026-11-09', startedAtMs: 5 })).toMatchObject({
      startDate: '2026-11-09',
      startedAtMs: 5,
    }));
  it('a malformed stamp is null', () =>
    expect(rentSettingsOf(house(), { startDate: 'soon', startedAtMs: '5' })).toMatchObject({
      startDate: null,
      startedAtMs: null,
    }));
  it('stamp fields on the house doc itself are ignored', () =>
    expect(
      rentSettingsOf(house({ rentChargesStartDate: '2026-11-09', rentChargesStartedAtMs: 5 })),
    ).toMatchObject({ startDate: null, startedAtMs: null }));
  it('an Oxford house is off whatever its schedule and price', () =>
    expect(
      rentSettingsOf(house({ houseType: 'oxford' }), { startDate: '2026-11-09', startedAtMs: 5 }),
    ).toBeNull());
});

describe('residentRate', () => {
  const s = rentSettingsOf(house())!;
  it('no custom rate means the house price', () =>
    expect(residentRate({}, s)).toEqual({ rateCents: 17500, source: 'house' }));
  it('a custom rate for this schedule wins', () =>
    expect(residentRate({ customRent: { amountCents: 12000, frequency: 'weekly' } }, s)).toEqual({
      rateCents: 12000,
      source: 'custom',
    }));
  it('zero is a valid custom rate', () =>
    expect(
      residentRate({ customRent: { amountCents: 0, frequency: 'weekly' } }, s)?.rateCents,
    ).toBe(0));
  it('a custom rate for the other schedule is ignored', () =>
    expect(
      residentRate({ customRent: { amountCents: 60000, frequency: 'monthly' } }, s)?.source,
    ).toBe('house'));
  it.each([
    { amountCents: 12.5, frequency: 'weekly' },
    { amountCents: -1, frequency: 'weekly' },
    { amountCents: '120', frequency: 'weekly' },
    null,
  ])('a malformed custom rate %p falls back to the house price', (c) =>
    expect(residentRate({ customRent: c }, s)?.source).toBe('house'),
  );
});

describe('custom rate cap', () => {
  const s = rentSettingsOf(house())!;
  it('a custom rate above the cap is not used: residentRate returns null', () =>
    expect(
      residentRate({ customRent: { amountCents: 1750000 * 10, frequency: 'weekly' } }, s),
    ).toBeNull());
  it('exactly the cap is used', () =>
    expect(
      residentRate({ customRent: { amountCents: 1000000, frequency: 'weekly' } }, s)?.rateCents,
    ).toBe(1000000));
});
