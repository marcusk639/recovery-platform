import { getTimeSober } from '../guest';

describe('getTimeSober', () => {
  // Freeze time so absolute ISO date strings produce deterministic results
  // regardless of when the suite runs. Picked a non-edge date (not month-end,
  // not Feb 29) to keep the date arithmetic boring.
  const FIXED_NOW = new Date('2026-05-26T12:00:00Z');

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(FIXED_NOW);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('returns 1 year / 0 months / 0 days for an exact 1-year sobriety', () => {
    // Exactly one year ago at the same instant.
    const result = getTimeSober('2025-05-26T12:00:00Z');
    expect(result).toEqual({ yearsSober: 1, monthsSober: 0, daysSober: 0 });
  });

  it('returns 0 years / 1 month / 0 days for an exact 1-month sobriety', () => {
    // Exactly one month ago.
    const result = getTimeSober('2026-04-26T12:00:00Z');
    expect(result).toEqual({ yearsSober: 0, monthsSober: 1, daysSober: 0 });
  });

  it('returns 0 years / 0 months / 5 days for 5-day sobriety', () => {
    // 5 days ago.
    const result = getTimeSober('2026-05-21T12:00:00Z');
    expect(result).toEqual({ yearsSober: 0, monthsSober: 0, daysSober: 5 });
  });

  it('decomposes mixed durations (1 year + 2 months + 3 days)', () => {
    // 2026-05-26 minus 1y => 2025-05-26; minus 2mo => 2025-03-26; minus 3d => 2025-03-23.
    const result = getTimeSober('2025-03-23T12:00:00Z');
    expect(result).toEqual({ yearsSober: 1, monthsSober: 2, daysSober: 3 });
  });

  it('returns all zeros for same-day sobriety', () => {
    const result = getTimeSober('2026-05-26T12:00:00Z');
    expect(result).toEqual({ yearsSober: 0, monthsSober: 0, daysSober: 0 });
  });

  it('decomposes a very old date (25 years + 6 months + 10 days)', () => {
    // 2026-05-26 minus 25y => 2001-05-26; minus 6mo => 2000-11-26; minus 10d => 2000-11-16.
    const result = getTimeSober('2000-11-16T12:00:00Z');
    expect(result).toEqual({ yearsSober: 25, monthsSober: 6, daysSober: 10 });
  });

  it('returns all zeros for future sobriety dates', () => {
    // Input is 5 days in the FUTURE. The function early-returns zeros
    // rather than running Math.abs over the diffs (which would
    // misleadingly report "5 days sober" before the date arrives).
    const result = getTimeSober('2026-05-31T12:00:00Z');
    expect(result).toEqual({ yearsSober: 0, monthsSober: 0, daysSober: 0 });
  });
});
