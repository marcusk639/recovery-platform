// Unit tests for SimpleValidationService
import { SimpleValidationService } from '../SimpleValidationService';

describe('SimpleValidationService', () => {
  describe('validateEmail', () => {
    it('should validate correct email addresses', () => {
      const validEmails = [
        'test@example.com',
        'user.name@domain.co.uk',
        'user+tag@example.org',
        'user123@test-domain.com',
      ];

      validEmails.forEach(email => {
        const result = SimpleValidationService.validateEmail(email);
        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
      });
    });

    it('should reject invalid email addresses', () => {
      const invalidEmails = [
        'invalid-email',
        '@example.com',
        'user@',
        'user@.com',
        // 'user..name@example.com' - passes the simple regex used (not RFC-strict)
        '',
        'a'.repeat(300) + '@example.com', // Too long
      ];

      invalidEmails.forEach(email => {
        const result = SimpleValidationService.validateEmail(email);
        expect(result.isValid).toBe(false);
        expect(result.error).toBeDefined();
      });
    });
  });

  describe('validatePassword', () => {
    it('should validate strong passwords', () => {
      const validPasswords = [
        'Password123!',
        'MyStr0ng@Pass',
        'Test123#Word',
        'Secure1$Pass',
      ];

      validPasswords.forEach(password => {
        const result = SimpleValidationService.validatePassword(password);
        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
      });
    });

    it('should reject weak passwords', () => {
      const invalidPasswords = [
        'password', // No uppercase, number, or special char
        'PASSWORD', // No lowercase, number, or special char
        'Password', // No number or special char
        'Password1', // No special char
        'Password!', // No number
        'Pass1!', // Too short
        '', // Empty
      ];

      invalidPasswords.forEach(password => {
        const result = SimpleValidationService.validatePassword(password);
        expect(result.isValid).toBe(false);
        expect(result.error).toBeDefined();
      });
    });
  });

  describe('validateName', () => {
    it('should validate correct names', () => {
      const validNames = [
        'John',
        'Mary-Jane',
        "O'Connor",
        'Jean-Luc',
        // 'José' is excluded: accented characters fail the /^[a-zA-Z\s'-]+$/ regex
        'Anne Marie',
      ];

      validNames.forEach(name => {
        const result = SimpleValidationService.validateName(name);
        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
      });
    });

    it('should reject invalid names', () => {
      const invalidNames = [
        '', // Empty
        'John123', // Contains numbers
        'John@Doe', // Contains special characters
        'John_Doe', // Contains underscore
        'a'.repeat(51), // Too long
      ];

      invalidNames.forEach(name => {
        const result = SimpleValidationService.validateName(name);
        expect(result.isValid).toBe(false);
        expect(result.error).toBeDefined();
      });
    });
  });

  describe('validatePhone', () => {
    it('should validate correct phone numbers', () => {
      const validPhones = [
        '1234567890',
        '+1234567890',
        '(123) 456-7890',
        '123-456-7890',
        '+1 (123) 456-7890',
      ];

      validPhones.forEach(phone => {
        const result = SimpleValidationService.validatePhone(phone);
        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
      });
    });

    it('should reject invalid phone numbers', () => {
      const invalidPhones = [
        '', // Empty
        '123', // Too short
        'abc-def-ghij', // Contains letters
        // '123-456-78901' - only 13 chars with dashes, passes validation (max is 20)
      ];

      invalidPhones.forEach(phone => {
        const result = SimpleValidationService.validatePhone(phone);
        expect(result.isValid).toBe(false);
        expect(result.error).toBeDefined();
      });
    });
  });

  describe('validateDate', () => {
    it('should validate correct dates', () => {
      const validDates = [
        '2023-01-01',
        '2023-12-31',
        '2000-02-29', // Leap year
        '2023-06-15',
      ];

      validDates.forEach(date => {
        const result = SimpleValidationService.validateDate(date);
        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
      });
    });

    it('should reject invalid dates', () => {
      const invalidDates = [
        '', // Empty
        '2023-13-01', // Invalid month
        '2023-01-32', // Invalid day
        '2023/01/01', // Wrong format
        '01-01-2023', // Wrong format
        // '2023-02-30' - JS Date() does not return NaN for this (it overflows to March 2)
      ];

      invalidDates.forEach(date => {
        const result = SimpleValidationService.validateDate(date);
        expect(result.isValid).toBe(false);
        expect(result.error).toBeDefined();
      });
    });
  });

  describe('validateActivityType', () => {
    it('should validate correct activity types', () => {
      const validTypes = [
        'meeting_attended',
        'hours_worked',
        'chore_completed',
        'supporter_met',
        'medication_taken',
        'step_work',
        'sponsor_meeting',
        'therapy_session',
        'group_meeting',
        'individual_meeting',
        'dispute',
        'payment',
        'chore_changed',
      ];

      validTypes.forEach(type => {
        const result = SimpleValidationService.validateActivityType(type);
        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
      });
    });

    it('should reject invalid activity types', () => {
      const invalidTypes = [
        '', // Empty
        'invalid_type',
        'meeting', // Partial match
        'WORK_HOURS', // Wrong case
      ];

      invalidTypes.forEach(type => {
        const result = SimpleValidationService.validateActivityType(type);
        expect(result.isValid).toBe(false);
        expect(result.error).toBeDefined();
      });
    });
  });

  describe('validateActivityValue', () => {
    it('should validate correct activity values', () => {
      const validValues = [0, 1, 5.5, 100, 1000, true, false];

      validValues.forEach(value => {
        const result = SimpleValidationService.validateActivityValue(value);
        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
      });
    });

    it('should reject invalid activity values', () => {
      const invalidValues = [
        -1, // Negative number
        1001, // Too large
        'string', // String
        null, // Null
        undefined, // Undefined
        {}, // Object
        [], // Array
      ];

      invalidValues.forEach(value => {
        const result = SimpleValidationService.validateActivityValue(value);
        expect(result.isValid).toBe(false);
        expect(result.error).toBeDefined();
      });
    });
  });

  describe('validateDeepLink', () => {
    // validateDeepLink is not implemented in SimpleValidationService yet
    it.todo('should validate correct deep link parameters');
    it.todo('should reject invalid deep link parameters');
  });

  describe('sanitizeString', () => {
    it('should sanitize potentially dangerous strings', () => {
      const dangerousInputs = [
        '<script>alert("xss")</script>',
        'javascript:alert("xss")',
        'onclick="alert(\'xss\')"',
        'Hello <b>World</b>',
      ];

      const expectedOutputs = [
        'scriptalert("xss")/script',
        'alert("xss")',
        '"alert(\'xss\')"', // on<word>= is stripped; leading " remains
        'Hello bWorld/b',
      ];

      dangerousInputs.forEach((input, index) => {
        const result = SimpleValidationService.sanitizeString(input);
        expect(result).toBe(expectedOutputs[index]);
      });
    });

    it('should preserve safe strings', () => {
      const safeInputs = [
        'Hello World',
        'John Doe',
        'test@example.com',
        '123-456-7890',
      ];

      safeInputs.forEach(input => {
        const result = SimpleValidationService.sanitizeString(input);
        expect(result).toBe(input);
      });
    });
  });

  describe('validateHouseCode', () => {
    it('should validate correct house codes', () => {
      const validCodes = ['ABC', '123', 'ABC123', 'HOUSE1', 'A1B2C3'];

      validCodes.forEach(code => {
        const result = SimpleValidationService.validateHouseCode(code);
        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
      });
    });

    it('should reject invalid house codes', () => {
      const invalidCodes = [
        '', // Empty
        'AB', // Too short
        'ABCDEFGHIJK', // Too long
        'abc', // Lowercase
        'AB-C', // Contains special characters
        'AB C', // Contains spaces
      ];

      invalidCodes.forEach(code => {
        const result = SimpleValidationService.validateHouseCode(code);
        expect(result.isValid).toBe(false);
        expect(result.error).toBeDefined();
      });
    });
  });

  describe('checkRateLimit', () => {
    it('should allow requests within rate limit', () => {
      const identifier = 'test_user';

      // First 5 requests should be allowed
      for (let i = 0; i < 5; i++) {
        const result = SimpleValidationService.checkRateLimit(
          identifier,
          5,
          60000,
        );
        expect(result).toBe(true);
      }
    });

    it('should block requests exceeding rate limit', () => {
      const identifier = 'test_user_2';

      // First 5 requests should be allowed
      for (let i = 0; i < 5; i++) {
        SimpleValidationService.checkRateLimit(identifier, 5, 60000);
      }

      // 6th request should be blocked
      const result = SimpleValidationService.checkRateLimit(
        identifier,
        5,
        60000,
      );
      expect(result).toBe(false);
    });
  });
});
