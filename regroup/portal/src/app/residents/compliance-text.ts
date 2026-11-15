// Report fields are untrusted input, so the report is given plain text and real
// numbers. Ordinary text and real numbers print exactly as before.
const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ESCAPES[c]);

const TEXT_FIELDS = ['firstName', 'lastName', 'phase'] as const;

export function reportGuest<T extends Record<string, unknown>>(guest: T): T {
  const copy: Record<string, unknown> = { ...guest };
  for (const field of TEXT_FIELDS) {
    if (copy[field] != null) copy[field] = escape(String(copy[field]));
  }
  return copy as T;
}

// Number(x) for a numeric field; missing stays missing. Something that isn't a
// number becomes NaN, which fails every comparison, so a rule still reads FAIL.
const asNumber = (x: unknown) => Number(x);

function withNumbers<T extends Record<string, unknown>>(source: T, fields: readonly string[]): T {
  const copy: Record<string, unknown> = { ...source };
  for (const field of fields) {
    if (copy[field] != null) copy[field] = asNumber(copy[field]);
  }
  return copy as T;
}

const STAT_FIELDS = ['meetingsAttended', 'choresCompleted', 'hoursWorked', 'primarySupporterMet', 'medicationTaken'];
const RULE_FIELDS = ['meetings', 'work'];

export const reportStats = <T extends Record<string, any>>(stats: T): T => withNumbers(stats, STAT_FIELDS);
export const reportRules = <T extends Record<string, any>>(rules: T): T => withNumbers(rules, RULE_FIELDS);
