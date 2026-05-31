// src/services/__tests__/password.test.ts
//
// Unit tests for the password utility functions in src/services/password.ts.
//
// password.ts is a pure module with no external dependencies — no mocks needed.

// ─── Imports ─────────────────────────────────────────────────────────────────

import {
  hasLowerCase,
  hasUpperCase,
  checkPasswordReqs,
} from '../password';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('password service', () => {
  // ── hasLowerCase ────────────────────────────────────────────────────────────

  describe('hasLowerCase', () => {
    it('returns true when the string contains at least one lowercase letter', () => {
      expect(hasLowerCase('Hello')).toBe(true);
    });

    it('returns true when the string is entirely lowercase', () => {
      expect(hasLowerCase('hello')).toBe(true);
    });

    it('returns false when the string contains no lowercase letters', () => {
      expect(hasLowerCase('HELLO123!')).toBe(false);
    });

    it('returns false for an empty string', () => {
      expect(hasLowerCase('')).toBe(false);
    });

    it('returns false for digits and symbols only', () => {
      expect(hasLowerCase('1234!@#$')).toBe(false);
    });
  });

  // ── hasUpperCase ────────────────────────────────────────────────────────────

  describe('hasUpperCase', () => {
    it('returns true when the string contains at least one uppercase letter', () => {
      expect(hasUpperCase('Hello')).toBe(true);
    });

    it('returns true when the string is entirely uppercase', () => {
      expect(hasUpperCase('HELLO')).toBe(true);
    });

    it('returns false when the string contains no uppercase letters', () => {
      expect(hasUpperCase('hello123!')).toBe(false);
    });

    it('returns false for an empty string', () => {
      expect(hasUpperCase('')).toBe(false);
    });

    it('returns false for digits and symbols only', () => {
      expect(hasUpperCase('1234!@#$')).toBe(false);
    });
  });

  // ── checkPasswordReqs ───────────────────────────────────────────────────────

  describe('checkPasswordReqs', () => {
    it('sets no error flags for a fully compliant password', () => {
      const errors: any = {};
      checkPasswordReqs('SecurePass1', errors);

      expect(errors.passLength).toBeUndefined();
      expect(errors.characters).toBeUndefined();
      expect(errors.uppercase).toBeUndefined();
      expect(errors.lowercase).toBeUndefined();
      expect(errors.number).toBeUndefined();
    });

    it('sets passLength when the password is an empty string', () => {
      const errors: any = {};
      checkPasswordReqs('', errors);

      expect(errors.passLength).toBe(true);
    });

    it('sets characters when the password is shorter than 8 characters', () => {
      const errors: any = {};
      checkPasswordReqs('Abc1', errors);

      expect(errors.characters).toBe(true);
    });

    it('does NOT set characters for a password of exactly 8 characters', () => {
      const errors: any = {};
      checkPasswordReqs('Abcde1!x', errors);

      expect(errors.characters).toBeUndefined();
    });

    it('sets uppercase when there are no uppercase letters', () => {
      const errors: any = {};
      checkPasswordReqs('lowercase1', errors);

      expect(errors.uppercase).toBe(true);
    });

    it('sets lowercase when there are no lowercase letters', () => {
      const errors: any = {};
      checkPasswordReqs('UPPERCASE1', errors);

      expect(errors.lowercase).toBe(true);
    });

    it('sets number when there are no digits', () => {
      const errors: any = {};
      checkPasswordReqs('NoDigitsHere', errors);

      expect(errors.number).toBe(true);
    });

    it('sets multiple error flags simultaneously for a weak password', () => {
      const errors: any = {};
      checkPasswordReqs('abc', errors); // too short, no uppercase, no number

      expect(errors.characters).toBe(true);
      expect(errors.uppercase).toBe(true);
      expect(errors.number).toBe(true);
      // lowercase IS present, so that flag should not be set
      expect(errors.lowercase).toBeUndefined();
    });

    it('sets passLength AND characters for an empty string', () => {
      const errors: any = {};
      checkPasswordReqs('', errors);

      expect(errors.passLength).toBe(true);
      expect(errors.characters).toBe(true);
    });

    it('does not mutate unrelated keys on the errors object', () => {
      const errors: any = { someOtherKey: 'preserved' };
      checkPasswordReqs('SecurePass1', errors);

      expect(errors.someOtherKey).toBe('preserved');
    });
  });
});
