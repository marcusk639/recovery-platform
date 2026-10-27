/**
 * Age cutoff for retried event triggers.
 *
 * A v2 trigger registered with `retry: true` is redelivered after every
 * failure, for up to 7 days. Handlers that are safe to retry (they recompute
 * from current state) still should not keep retrying a permanent error for
 * days, so they stop once the event is older than a cutoff.
 */

/** Six hours: long enough to ride out an Auth or Firestore outage. */
export const RETRY_CUTOFF_MS = 6 * 60 * 60 * 1000;

/**
 * Age of the event in whole minutes, or null when event.time is missing or
 * unparseable (the event is then treated as fresh).
 */
export function eventAgeMinutes(
  time: string | undefined,
  nowMs: number = Date.now(),
): number | null {
  if (!time) return null;
  const at = Date.parse(time);
  if (Number.isNaN(at)) return null;
  return Math.floor((nowMs - at) / 60000);
}

/** True when the event is older than maxAgeMs. */
export function isStaleEvent(
  time: string | undefined,
  nowMs: number = Date.now(),
  maxAgeMs: number = RETRY_CUTOFF_MS,
): boolean {
  const age = eventAgeMinutes(time, nowMs);
  return age !== null && age * 60000 > maxAgeMs;
}
