import {formatDataAsOf} from '../utils/formatDataAsOf';

describe('formatDataAsOf', () => {
  it('describes the month and year a listing dates from', () => {
    expect(formatDataAsOf('2023-03-19')).toBe('Listing data from Mar 2023');
  });

  it('does not shift the month across a time zone at a month boundary', () => {
    expect(formatDataAsOf('2025-09-01')).toBe('Listing data from Sep 2025');
  });

  it.each([[undefined], [null], [''], ['not-a-date'], ['2023-13-01']])(
    'returns null for %j',
    value => {
      expect(formatDataAsOf(value)).toBeNull();
    },
  );
});
