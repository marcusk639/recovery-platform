/**
 * Validates an email address
 * @param email The email address to validate
 * @returns An error message if invalid, null if valid
 */
export const validateEmail = (email: string): string | null => {
  if (!email) {
    return 'Email is required';
  }

  // Regular expression for email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(email)) {
    return 'Please enter a valid email address';
  }

  return null;
};

/**
 * Validates a password
 * @param password The password to validate
 * @returns An error message if invalid, null if valid
 */
export const validatePassword = (password: string): string | null => {
  if (!password) {
    return 'Password is required';
  }

  if (password.length < 8) {
    return 'Password must be at least 8 characters long';
  }

  // Check for at least one letter and one number
  const hasLetter = /[A-Za-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);

  if (!hasLetter || !hasNumber) {
    return 'Password must include at least one letter and one number';
  }

  return null;
};
