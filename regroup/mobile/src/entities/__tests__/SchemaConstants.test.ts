import SchemaConstants from '../SchemaConstants';

describe('SchemaConstants static string constants', () => {
  it('REQUIRED equals "Required"', () => {
    expect(SchemaConstants.REQUIRED).toBe('Required');
  });

  it('INTEGER equals "Must be an integer"', () => {
    expect(SchemaConstants.INTEGER).toBe('Must be an integer');
  });

  it('NUMBER equals "Must be a number"', () => {
    expect(SchemaConstants.NUMBER).toBe('Must be a number');
  });

  it('EMAIL equals "Must be a valid email address"', () => {
    expect(SchemaConstants.EMAIL).toBe('Must be a valid email address');
  });

  it('PASSWORD contains guidance about number and case requirements', () => {
    expect(SchemaConstants.PASSWORD).toContain('number');
    expect(SchemaConstants.PASSWORD).toContain('lower case');
    expect(SchemaConstants.PASSWORD).toContain('upper case');
  });

  it('PASSWORD_CONFIRM equals "Passwords must match"', () => {
    expect(SchemaConstants.PASSWORD_CONFIRM).toBe('Passwords must match');
  });

  it('all static constants are strings', () => {
    expect(typeof SchemaConstants.REQUIRED).toBe('string');
    expect(typeof SchemaConstants.INTEGER).toBe('string');
    expect(typeof SchemaConstants.NUMBER).toBe('string');
    expect(typeof SchemaConstants.EMAIL).toBe('string');
    expect(typeof SchemaConstants.PASSWORD).toBe('string');
    expect(typeof SchemaConstants.PASSWORD_CONFIRM).toBe('string');
  });
});

describe('SchemaConstants.stringMax static method', () => {
  it('returns a string containing the max number', () => {
    expect(SchemaConstants.stringMax(100)).toContain('100');
  });

  it('returns a message about being shorter than the limit', () => {
    expect(SchemaConstants.stringMax(50)).toBe('Must be shorter than 50 characters');
  });

  it('works with different values', () => {
    expect(SchemaConstants.stringMax(255)).toBe('Must be shorter than 255 characters');
    expect(SchemaConstants.stringMax(10)).toBe('Must be shorter than 10 characters');
  });

  it('returns a string', () => {
    expect(typeof SchemaConstants.stringMax(20)).toBe('string');
  });
});

describe('SchemaConstants.stringMin static method', () => {
  it('returns a string containing the min number', () => {
    expect(SchemaConstants.stringMin(8)).toContain('8');
  });

  it('returns a message about being longer than the limit', () => {
    expect(SchemaConstants.stringMin(6)).toBe('Must be longer than 6 characters');
  });

  it('works with different values', () => {
    expect(SchemaConstants.stringMin(1)).toBe('Must be longer than 1 characters');
    expect(SchemaConstants.stringMin(20)).toBe('Must be longer than 20 characters');
  });

  it('returns a string', () => {
    expect(typeof SchemaConstants.stringMin(5)).toBe('string');
  });
});

describe('SchemaConstants.numberMax static method', () => {
  it('returns a string containing the max number', () => {
    expect(SchemaConstants.numberMax(100)).toContain('100');
  });

  it('returns the expected message format', () => {
    expect(SchemaConstants.numberMax(50)).toBe('Must be more than 50');
  });

  it('works with different values', () => {
    expect(SchemaConstants.numberMax(0)).toBe('Must be more than 0');
    expect(SchemaConstants.numberMax(1000)).toBe('Must be more than 1000');
  });
});

describe('SchemaConstants.numberMin static method', () => {
  it('returns a string containing the min number', () => {
    expect(SchemaConstants.numberMin(1)).toContain('1');
  });

  it('returns the expected message format', () => {
    expect(SchemaConstants.numberMin(5)).toBe('Must be less than 5');
  });

  it('works with different values', () => {
    expect(SchemaConstants.numberMin(0)).toBe('Must be less than 0');
    expect(SchemaConstants.numberMin(100)).toBe('Must be less than 100');
  });
});
