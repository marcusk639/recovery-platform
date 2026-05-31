// src/util/__tests__/formatters.test.ts
//
// Unit tests for formatters.tsx.
// The file exports a single pure function: phoneFormatter.
// No React Native imports — no mocks required.

import { phoneFormatter } from '../formatters';

describe('phoneFormatter', () => {
  // ── Happy path ──────────────────────────────────────────────────────────

  it('formats a 10-digit string into (XXX) XXX-XXXX', () => {
    expect(phoneFormatter('5551234567')).toBe('(555) 123-4567');
  });

  it('formats a numeric value into (XXX) XXX-XXXX', () => {
    expect(phoneFormatter(5551234567)).toBe('(555) 123-4567');
  });

  it('strips dashes and formats correctly', () => {
    expect(phoneFormatter('555-123-4567')).toBe('(555) 123-4567');
  });

  it('strips dots and formats correctly', () => {
    expect(phoneFormatter('555.123.4567')).toBe('(555) 123-4567');
  });

  it('strips parentheses and spaces and reformats', () => {
    expect(phoneFormatter('(555) 123-4567')).toBe('(555) 123-4567');
  });

  it('strips all non-digit characters before formatting', () => {
    expect(phoneFormatter('+1 (555) 123-4567')).toBe('(155) 512-3456');
  });

  // ── Partial input ────────────────────────────────────────────────────────

  it('returns just the area code digits when only 3 digits supplied', () => {
    expect(phoneFormatter('555')).toBe('555');
  });

  it('returns area code and partial middle group when 6 digits supplied', () => {
    expect(phoneFormatter('555123')).toBe('(555) 123');
  });

  it('returns area code and middle group without dash when exactly 6 digits', () => {
    const result = phoneFormatter('555123');
    expect(result).not.toContain('-');
  });

  it('appends dash and last digits once 7+ digits provided', () => {
    expect(phoneFormatter('5551234')).toBe('(555) 123-4');
  });

  it('handles 9-digit input (missing one trailing digit) without crash', () => {
    const result = phoneFormatter('555123456');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  // ── Edge cases ───────────────────────────────────────────────────────────

  it('returns empty string for empty string input', () => {
    expect(phoneFormatter('')).toBe('');
  });

  it('returns empty string for a string of only non-digit characters', () => {
    // All non-digits stripped → empty → regex still matches, but group 1 is ''
    // and group 2 is also '' so !replaced[2] branch returns replaced[1] = ''
    expect(phoneFormatter('---')).toBe('');
  });

  it('returns a single digit when one digit supplied', () => {
    expect(phoneFormatter('5')).toBe('5');
  });

  it('returns a string type for numeric zero', () => {
    const result = phoneFormatter(0);
    expect(typeof result).toBe('string');
  });

  it('handles very long numeric input by using only first 10 digits for format slots', () => {
    // regex captures (\d{0,3})(\d{0,3})(\d{0,4}) — extra digits are dropped
    const result = phoneFormatter('12345678901234');
    // first 3 → 123, next 3 → 456, next 4 → 7890 — rest ignored
    expect(result).toBe('(123) 456-7890');
  });
});
