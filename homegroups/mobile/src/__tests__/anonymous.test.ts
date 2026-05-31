import {getAnonymizedName} from '../utils/anonymous';

describe('getAnonymizedName', () => {
  it('returns first name + last initial with period for a two-word name', () => {
    expect(getAnonymizedName('John Smith')).toBe('John S.');
  });

  it('uses the last whitespace-separated token for multi-word names', () => {
    expect(getAnonymizedName('Mary Anne Jones')).toBe('Mary J.');
  });

  it('returns just the single name when no surname is given', () => {
    expect(getAnonymizedName('Pat')).toBe('Pat');
  });

  it('returns an empty string for an empty input', () => {
    expect(getAnonymizedName('')).toBe('');
  });

  it('trims surrounding whitespace', () => {
    expect(getAnonymizedName('  Alice Wonderland  ')).toBe('Alice W.');
  });

  it('collapses inner whitespace and uses the last token', () => {
    expect(getAnonymizedName('Bob   Marley')).toBe('Bob M.');
  });

  it('uppercases a lowercase last initial', () => {
    expect(getAnonymizedName('jane doe')).toBe('jane D.');
  });

  it('regression: does NOT return the last character of the full string', () => {
    // The previous implementation returned "Johnh" for "John Smith".
    // This test will fail if anyone reverts to the old behavior.
    expect(getAnonymizedName('John Smith')).not.toBe('Johnh');
  });
});
