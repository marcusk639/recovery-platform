// Simple validation service for security and data integrity
export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

export class SimpleValidationService {
  /**
   * Validate email input
   */
  static validateEmail(email: string): ValidationResult {
    if (!email || typeof email !== 'string') {
      return { isValid: false, error: 'Email is required' };
    }

    if (email.length < 5) {
      return { isValid: false, error: 'Email must be at least 5 characters' };
    }

    if (email.length > 254) {
      return {
        isValid: false,
        error: 'Email must be less than 254 characters',
      };
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return { isValid: false, error: 'Invalid email format' };
    }

    return { isValid: true };
  }

  /**
   * Validate password input
   */
  static validatePassword(password: string): ValidationResult {
    if (!password || typeof password !== 'string') {
      return { isValid: false, error: 'Password is required' };
    }

    if (password.length < 8) {
      return {
        isValid: false,
        error: 'Password must be at least 8 characters',
      };
    }

    if (password.length > 128) {
      return {
        isValid: false,
        error: 'Password must be less than 128 characters',
      };
    }

    if (!/[A-Z]/.test(password)) {
      return {
        isValid: false,
        error: 'Password must contain at least one uppercase letter',
      };
    }

    if (!/[a-z]/.test(password)) {
      return {
        isValid: false,
        error: 'Password must contain at least one lowercase letter',
      };
    }

    if (!/[0-9]/.test(password)) {
      return {
        isValid: false,
        error: 'Password must contain at least one number',
      };
    }

    if (!/[^A-Za-z0-9]/.test(password)) {
      return {
        isValid: false,
        error: 'Password must contain at least one special character',
      };
    }

    return { isValid: true };
  }

  /**
   * Validate name input
   */
  static validateName(name: string): ValidationResult {
    if (!name || typeof name !== 'string') {
      return { isValid: false, error: 'Name is required' };
    }

    if (name.length < 1) {
      return { isValid: false, error: 'Name is required' };
    }

    if (name.length > 50) {
      return { isValid: false, error: 'Name must be less than 50 characters' };
    }

    const nameRegex = /^[a-zA-Z\s'-]+$/;
    if (!nameRegex.test(name)) {
      return {
        isValid: false,
        error:
          'Name can only contain letters, spaces, hyphens, and apostrophes',
      };
    }

    return { isValid: true };
  }

  /**
   * Validate phone number input
   */
  static validatePhone(phone: string): ValidationResult {
    if (!phone || typeof phone !== 'string') {
      return { isValid: false, error: 'Phone number is required' };
    }

    if (phone.length < 10) {
      return {
        isValid: false,
        error: 'Phone number must be at least 10 digits',
      };
    }

    if (phone.length > 20) {
      return {
        isValid: false,
        error: 'Phone number must be less than 20 characters',
      };
    }

    const phoneRegex = /^\+?[\d\s\-\(\)]+$/;
    if (!phoneRegex.test(phone)) {
      return { isValid: false, error: 'Invalid phone number format' };
    }

    return { isValid: true };
  }

  /**
   * Validate date input
   */
  static validateDate(date: string): ValidationResult {
    if (!date || typeof date !== 'string') {
      return { isValid: false, error: 'Date is required' };
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return { isValid: false, error: 'Date must be in YYYY-MM-DD format' };
    }

    const parsed = new Date(date);
    if (isNaN(parsed.getTime())) {
      return { isValid: false, error: 'Invalid date' };
    }

    return { isValid: true };
  }

  /**
   * Validate activity type
   */
  static validateActivityType(type: string): ValidationResult {
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

    if (!type || typeof type !== 'string') {
      return { isValid: false, error: 'Activity type is required' };
    }

    if (!validTypes.includes(type)) {
      return { isValid: false, error: 'Invalid activity type' };
    }

    return { isValid: true };
  }

  /**
   * Validate activity value
   */
  static validateActivityValue(value: any): ValidationResult {
    if (typeof value === 'boolean') {
      return { isValid: true };
    }

    if (typeof value === 'number') {
      if (value < 0) {
        return { isValid: false, error: 'Value cannot be negative' };
      }
      if (value > 1000) {
        return { isValid: false, error: 'Value cannot exceed 1000' };
      }
      return { isValid: true };
    }

    return { isValid: false, error: 'Value must be a number or boolean' };
  }

  /**
   * Sanitize string input to prevent XSS
   */
  static sanitizeString(input: string): string {
    if (!input || typeof input !== 'string') {
      return '';
    }

    return input
      .replace(/[<>]/g, '') // Remove potential HTML tags
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+=/gi, '') // Remove event handlers
      .trim();
  }

  /**
   * Validate and sanitize user input
   */
  static validateAndSanitizeUserInput(input: {
    email?: string;
    password?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
  }): { isValid: boolean; sanitized: any; errors: string[] } {
    const errors: string[] = [];
    const sanitized: any = {};

    if (input.email) {
      const emailValidation = this.validateEmail(input.email);
      if (!emailValidation.isValid) {
        errors.push(emailValidation.error || 'Invalid email');
      } else {
        sanitized.email = this.sanitizeString(input.email);
      }
    }

    if (input.password) {
      const passwordValidation = this.validatePassword(input.password);
      if (!passwordValidation.isValid) {
        errors.push(passwordValidation.error || 'Invalid password');
      } else {
        sanitized.password = input.password; // Don't sanitize passwords
      }
    }

    if (input.firstName) {
      const firstNameValidation = this.validateName(input.firstName);
      if (!firstNameValidation.isValid) {
        errors.push(
          `First name: ${firstNameValidation.error || 'Invalid name'}`,
        );
      } else {
        sanitized.firstName = this.sanitizeString(input.firstName);
      }
    }

    if (input.lastName) {
      const lastNameValidation = this.validateName(input.lastName);
      if (!lastNameValidation.isValid) {
        errors.push(`Last name: ${lastNameValidation.error || 'Invalid name'}`);
      } else {
        sanitized.lastName = this.sanitizeString(input.lastName);
      }
    }

    if (input.phone) {
      const phoneValidation = this.validatePhone(input.phone);
      if (!phoneValidation.isValid) {
        errors.push(phoneValidation.error || 'Invalid phone number');
      } else {
        sanitized.phone = this.sanitizeString(input.phone);
      }
    }

    return {
      isValid: errors.length === 0,
      sanitized,
      errors,
    };
  }

  /**
   * Rate limiting helper
   */
  private static rateLimitMap = new Map<
    string,
    { count: number; resetTime: number }
  >();

  static checkRateLimit(
    identifier: string,
    maxRequests: number = 5,
    windowMs: number = 60000,
  ): boolean {
    const now = Date.now();
    const key = identifier;
    const current = this.rateLimitMap.get(key);

    if (!current || now > current.resetTime) {
      this.rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
      return true;
    }

    if (current.count >= maxRequests) {
      return false;
    }

    current.count++;
    return true;
  }

  /**
   * Validate house code format
   */
  static validateHouseCode(code: string): ValidationResult {
    if (!code || typeof code !== 'string') {
      return { isValid: false, error: 'House code is required' };
    }

    if (code.length < 3) {
      return {
        isValid: false,
        error: 'House code must be at least 3 characters',
      };
    }

    if (code.length > 10) {
      return {
        isValid: false,
        error: 'House code must be less than 10 characters',
      };
    }

    if (!/^[A-Z0-9]+$/.test(code)) {
      return {
        isValid: false,
        error: 'House code can only contain uppercase letters and numbers',
      };
    }

    return { isValid: true };
  }
}
