/**
 * Central registry of timezones processed by the weekly transfer scheduler.
 *
 * Houses in Firestore store their IANA timezone string in the `timezone`
 * column. Adding a new timezone here causes it to be processed on the next
 * weekly run — no scheduler redeployment is required beyond the standard
 * `firebase deploy`.
 */
export const WEEKLY_TRANSFER_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
] as const;

export type SupportedTimezone = (typeof WEEKLY_TRANSFER_TIMEZONES)[number];

/**
 * Sentinel value passed to `transferStats` for houses with no `timezone`
 * field set. Kept as a named constant so calling code reads intentionally.
 */
export const FALLBACK_TIMEZONE = null;
