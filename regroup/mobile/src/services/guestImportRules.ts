/**
 * What a resident row in an imported CSV must hold (P5 Task 17, review
 * 2026-11-27). A row that breaks a rule is skipped with a reason the
 * operator can act on; nothing is dropped silently.
 */

/** At most this many residents per file: a house is never near it. */
export const MAX_IMPORT_ROWS = 500;

/** Longest value each field may hold, in characters. */
export const FIELD_CAPS = {
  firstName: 100,
  lastName: 100,
  email: 320,
  drugOfChoice: 100,
  phoneNumber: 40,
} as const;

export const REQUIRED_FIELDS = [
  'firstName',
  'lastName',
  'email',
  'sobrietyDate',
  'drugOfChoice',
] as const;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const US_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

/** The same email whatever its case or surrounding spaces. */
export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/**
 * A date as YYYY-MM-DD, from YYYY-MM-DD or M/D/YYYY (what a spreadsheet
 * exports), or null when it is not a real calendar date.
 */
export function toIsoDate(value: string): string | null {
  const iso = ISO_DATE.exec(value);
  const us = US_DATE.exec(value);
  const [y, m, d] = iso
    ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : us
      ? [Number(us[3]), Number(us[1]), Number(us[2])]
      : [NaN, NaN, NaN];
  if (!Number.isInteger(y) || y < 1900 || y > 2100) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

/**
 * Why a row can't be imported, or null when it can. `seenEmails` holds the
 * normalized emails of the rows accepted so far in the file.
 */
export function rowProblem(record: Record<string, string>, seenEmails: Set<string>): string | null {
  const missing = REQUIRED_FIELDS.filter((f) => !record[f]);
  if (missing.length > 0) return `missing ${missing.join(', ')}`;
  for (const [field, cap] of Object.entries(FIELD_CAPS)) {
    if ((record[field] ?? '').length > cap) return `${field} is longer than ${cap} characters`;
  }
  if (!EMAIL_REGEX.test(record.email)) return 'email is not a valid address';
  if (seenEmails.has(normalizeEmail(record.email))) return 'email appears earlier in the file';
  if (!toIsoDate(record.sobrietyDate)) return 'sobrietyDate is not a date (use YYYY-MM-DD)';
  if (record.moveInDate && !toIsoDate(record.moveInDate)) {
    return 'moveInDate is not a date (use YYYY-MM-DD)';
  }
  return null;
}
