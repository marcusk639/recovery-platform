/**
 * Formats a phone number value into (XXX) XXX-XXXX format
 * @param value - Raw phone number input (string or number)
 * @returns Formatted phone number string
 */
export const phoneFormatter = (value: string | number): string => {
  const replaced = `${value}`
    .replace(/\D/g, '')
    .match(/(\d{0,3})(\d{0,3})(\d{0,4})/);

  if (!replaced) {
    return '';
  }

  return !replaced[2]
    ? replaced[1]
    : '(' +
        replaced[1] +
        ') ' +
        replaced[2] +
        (replaced[3] ? '-' + replaced[3] : '');
};
