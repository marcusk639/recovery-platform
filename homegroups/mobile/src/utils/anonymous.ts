/**
 * Returns a 12-step-style anonymized display name: first name + last initial.
 *
 * Examples:
 *   "John Smith"      -> "John S."
 *   "Mary Anne Jones" -> "Mary J."   (uses last whitespace-separated token)
 *   "Pat"             -> "Pat"        (no last name; first part only)
 *   ""                -> ""
 *
 * Anonymity is foundational to 12-step recovery (Tradition Twelve). Do not
 * change this to leak more of the surname than a single initial.
 */
export const getAnonymizedName = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  const last = parts[parts.length - 1];
  return `${parts[0]} ${last.charAt(0).toUpperCase()}.`;
};
