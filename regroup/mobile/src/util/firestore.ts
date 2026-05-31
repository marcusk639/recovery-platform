/**
 * Firestore timestamp helpers.
 *
 * Background: Firestore timestamps arrive in multiple shapes depending on
 * cache/offline state, platform (RN Firebase SDK vs web SDK), and whether
 * the source is a live snapshot, a Cloud Function return, or a deserialized
 * cached document. Common shapes seen across the codebase:
 *
 *   - `FirebaseFirestoreTypes.Timestamp` (has `.toDate()` method)
 *   - `{ seconds, nanoseconds }` or `{ _seconds, _nanoseconds }` (JSON form)
 *   - `Date`
 *   - ISO-8601 string
 *   - numeric epoch (ms)
 *
 * Every consumer that parses timestamps needs to handle all of these or risk
 * `Invalid Date` (for `parseISO(someTimestamp)`) or runtime crashes (for
 * `.toDate()` on a plain object). Rather than duplicating the fallback chain
 * at every call site, route through `toDateSafe`.
 */

type FirestoreLikeTimestamp =
  | { toDate: () => Date }
  | { seconds: number; nanoseconds?: number }
  | { _seconds: number; _nanoseconds?: number }
  | Date
  | string
  | number
  | null
  | undefined;

/**
 * Convert any Firestore-like timestamp value into a `Date`. Returns `null`
 * if the input cannot be interpreted as a date — callers should branch on
 * null rather than assume every input is convertible.
 */
export function toDateSafe(value: unknown): Date | null {
  if (value == null) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'object') {
    const v = value as FirestoreLikeTimestamp;
    // Firebase SDK Timestamp class
    if (typeof (v as { toDate?: unknown }).toDate === 'function') {
      try {
        const d = (v as { toDate: () => Date }).toDate();
        return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
      } catch {
        return null;
      }
    }
    // Plain object with `seconds` / `_seconds` (cache or JSON-encoded)
    const seconds =
      (v as { seconds?: number; _seconds?: number }).seconds ??
      (v as { _seconds?: number })._seconds;
    const nanos =
      (v as { nanoseconds?: number; _nanoseconds?: number }).nanoseconds ??
      (v as { _nanoseconds?: number })._nanoseconds ??
      0;
    if (typeof seconds === 'number') {
      const ms = seconds * 1000 + Math.floor(nanos / 1_000_000);
      const d = new Date(ms);
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }
  return null;
}

/**
 * Convenience variant that falls back to a caller-supplied default when the
 * value cannot be parsed. Useful for UI formatters that always need a Date.
 *
 *   const created = toDateOr(payment.createdAt, new Date(0));
 *   format(created, 'MMM d, yyyy');
 */
export function toDateOr(value: unknown, fallback: Date): Date {
  return toDateSafe(value) ?? fallback;
}
