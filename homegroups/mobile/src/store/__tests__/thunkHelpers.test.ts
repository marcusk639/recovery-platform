import {extractError} from '../thunkHelpers';

describe('extractError', () => {
  it('returns the error message when given a real Error with a message', () => {
    expect(extractError(new Error('boom'), 'fallback')).toBe('boom');
  });

  it('returns the fallback when given an Error with an empty message', () => {
    expect(extractError(new Error(''), 'fallback')).toBe('fallback');
  });

  it('returns the fallback when given a non-Error value', () => {
    expect(extractError('a plain string', 'fallback')).toBe('fallback');
    expect(extractError(null, 'fallback')).toBe('fallback');
    expect(extractError(undefined, 'fallback')).toBe('fallback');
    expect(extractError({not: 'an error'}, 'fallback')).toBe('fallback');
  });
});
