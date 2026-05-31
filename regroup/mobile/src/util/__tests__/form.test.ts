// src/util/__tests__/form.test.ts
//
// Unit tests for form.tsx.
// Exports tested:
//   - validateEmail(email) → boolean
//   - validateAddress(address, fieldName) → Promise<Record<string,string>>
//   - EmailSchema (yup schema — validate behaviour)
//
// renderField and renderPicker are React component factories that depend on
// Formik, RatsPicker, and native views. They are excluded here because they
// produce JSX and are better tested via component / snapshot tests.

import { validateEmail, validateAddress, EmailSchema } from '../form';
import { AddressDetails } from '../address';

// ─── validateEmail ────────────────────────────────────────────────────────────

describe('validateEmail', () => {
  // Valid addresses
  it.each([
    'user@example.com',
    'USER@EXAMPLE.COM',
    'alice.bob+tag@sub.domain.org',
    '"quoted"@example.com',
    'user@[192.168.1.1]',
    'simple@domain.co',
  ])('returns true for a valid email: %s', (email) => {
    expect(validateEmail(email)).toBe(true);
  });

  // Invalid addresses
  it.each([
    '',
    'plainaddress',
    '@nodomain.com',
    'missing@',
    'two@@signs.com',
    'space in@domain.com',
  ])('returns false for an invalid email: %s', (email) => {
    expect(validateEmail(email)).toBe(false);
  });

  it('trims whitespace before testing', () => {
    // The function does String(email).trim().toLowerCase() before testing
    expect(validateEmail('  user@example.com  ')).toBe(true);
  });

  it('lowercases the string before testing', () => {
    expect(validateEmail('User@Example.COM')).toBe(true);
  });

  it('returns a boolean (not truthy/falsy)', () => {
    expect(typeof validateEmail('a@b.com')).toBe('boolean');
  });
});

// ─── validateAddress ─────────────────────────────────────────────────────────

function makeAddress(overrides: Partial<AddressDetails> = {}): AddressDetails {
  return {
    street: '123 Main St',
    city: 'Springfield',
    state: 'IL',
    zip: '62701',
    country: 'US',
    lat: 39.7817,
    lng: -89.6501,
    ...overrides,
  };
}

describe('validateAddress', () => {
  it('returns an empty errors object for a fully valid address', async () => {
    const errors = await validateAddress(makeAddress(), 'address');
    expect(errors).toEqual({});
  });

  it('returns an error keyed by fieldName when city is missing', async () => {
    const errors = await validateAddress(makeAddress({ city: '' }), 'address');
    expect(errors).toHaveProperty('address');
    expect(errors.address).toContain('valid street address');
  });

  it('returns an error keyed by fieldName when zip is missing', async () => {
    const errors = await validateAddress(makeAddress({ zip: '' }), 'location');
    expect(errors).toHaveProperty('location');
  });

  it('returns an error keyed by fieldName when zip has an invalid format', async () => {
    const errors = await validateAddress(makeAddress({ zip: 'ABCDE' }), 'address');
    expect(errors).toHaveProperty('address');
  });

  it('accepts a valid 9-digit ZIP code (XXXXX-XXXX)', async () => {
    const errors = await validateAddress(makeAddress({ zip: '62701-1234' }), 'address');
    expect(errors).toEqual({});
  });

  it('returns an error keyed by fieldName when state is missing', async () => {
    const errors = await validateAddress(makeAddress({ state: '' }), 'address');
    expect(errors).toHaveProperty('address');
  });

  it('returns an error for an invalid 3-letter state code', async () => {
    const errors = await validateAddress(makeAddress({ state: 'ILL' }), 'address');
    expect(errors).toHaveProperty('address');
  });

  it('returns an error keyed by fieldName when street is missing', async () => {
    const errors = await validateAddress(makeAddress({ street: '' }), 'address');
    expect(errors).toHaveProperty('address');
  });

  it('returns an error keyed by fieldName when lat is missing', async () => {
    const errors = await validateAddress(
      makeAddress({ lat: undefined as unknown as number }),
      'address',
    );
    expect(errors).toHaveProperty('address');
  });

  it('returns an error keyed by fieldName when lng is missing', async () => {
    const errors = await validateAddress(
      makeAddress({ lng: undefined as unknown as number }),
      'address',
    );
    expect(errors).toHaveProperty('address');
  });

  it('uses the supplied fieldName as the error key', async () => {
    const errors = await validateAddress(makeAddress({ city: '' }), 'myCustomField');
    expect(errors).toHaveProperty('myCustomField');
    expect(errors).not.toHaveProperty('address');
  });

  it('always returns a Record<string, string> (even on success)', async () => {
    const errors = await validateAddress(makeAddress(), 'address');
    expect(typeof errors).toBe('object');
    expect(Array.isArray(errors)).toBe(false);
  });
});

// ─── EmailSchema ──────────────────────────────────────────────────────────────

describe('EmailSchema', () => {
  it('validates a correct email without throwing', async () => {
    await expect(EmailSchema.validate('alice@example.com')).resolves.toBeDefined();
  });

  it('rejects an empty value as required', async () => {
    await expect(EmailSchema.validate('')).rejects.toThrow();
  });

  it('rejects a non-email string', async () => {
    await expect(EmailSchema.validate('not-an-email')).rejects.toThrow();
  });

  it('rejects a string longer than 50 characters', async () => {
    const longEmail = 'a'.repeat(42) + '@example.com'; // 54 chars total
    await expect(EmailSchema.validate(longEmail)).rejects.toThrow();
  });

  it('accepts a valid email up to 50 characters', async () => {
    // 32 + 12 = 44 chars — well within the 50-char limit
    const email = 'a'.repeat(32) + '@example.com';
    await expect(EmailSchema.validate(email)).resolves.toBeDefined();
  });
});
