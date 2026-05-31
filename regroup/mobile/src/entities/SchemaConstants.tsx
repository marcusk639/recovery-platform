/**
 * Constants for yup schema validations
 * Min/max limits, error messages, etc
 */
export default class SchemaConstants {
  static REQUIRED = 'Required';
  static INTEGER = 'Must be an integer';
  static NUMBER = 'Must be a number';
  static EMAIL = 'Must be a valid email address';
  static PASSWORD =
    'Must contain 1 number, 1 lower case letter, and 1 upper case letter';
  static PASSWORD_CONFIRM = 'Passwords must match';

  static stringMax = (max: number): string => `Must be shorter than ${max} characters`;
  static stringMin = (min: number): string => `Must be longer than ${min} characters`;
  static numberMax = (max: number): string => `Must be more than ${max}`;
  static numberMin = (min: number): string => `Must be less than ${min}`;
}
