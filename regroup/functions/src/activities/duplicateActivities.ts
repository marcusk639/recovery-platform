/**
 * Find activities that look like retries of the same log.
 *
 * Before the trigger, a resident's logActivity saved the activity and then
 * threw on the (denied) summary write, so the app showed "Could not save" for
 * a saved activity and the resident tapped again. Those retries are real
 * duplicate documents; the trigger and backfill count them.
 *
 * A suspected duplicate is an active activity with the same guestId, type and
 * equal `data` as an earlier active one, whose `timestamp` is within
 * DUPLICATE_WINDOW_MINUTES of it. `timestamp` is the activity's own time: a
 * plain retry gets a new Date() seconds later, and a retry of a backdated log
 * reuses the identical form timestamp, so one window catches both.
 * `loggedAt` is deliberately NOT used: update, delete, dispute, resolve and
 * verify all overwrite it with serverTimestamp, so an admin verifying a week
 * of identical daily activities would make them look like a burst.
 *
 * Why 10 minutes: an error-then-retry happens within seconds to a couple of
 * minutes, while two genuine identical logs (same chore name, same meeting,
 * same medication, same job and hours) within 10 minutes are implausible.
 * Widening it starts flagging real repeats (e.g. twice-daily medication).
 *
 * Report-only: nothing here deletes or changes an activity.
 */
import { toInstant } from './weekSummaryMath';

export const DUPLICATE_WINDOW_MINUTES = 10;

type Data = Record<string, unknown>;

export interface SuspectedDuplicate {
  /** The later activity, likely the retry. */
  id: string;
  /** The earlier activity it repeats. */
  duplicateOf: string;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const keys = Object.keys(value as Data).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stable((value as Data)[k])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

export function findSuspectedDuplicates(
  activities: Array<{ id: string; data: Data }>,
  windowMinutes: number = DUPLICATE_WINDOW_MINUTES,
): SuspectedDuplicate[] {
  const windowMs = windowMinutes * 60_000;
  const groups = new Map<string, Array<{ id: string; at: number }>>();
  for (const { id, data } of activities) {
    if (data.status !== 'active') continue;
    const at = toInstant(data.timestamp);
    if (!at) continue;
    const key = stable([data.guestId, data.type, data.data]);
    const list = groups.get(key) ?? [];
    list.push({ id, at: at.getTime() });
    groups.set(key, list);
  }

  const found: SuspectedDuplicate[] = [];
  for (const list of groups.values()) {
    list.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
    for (let i = 1; i < list.length; i++) {
      if (list[i].at - list[i - 1].at <= windowMs) {
        found.push({ id: list[i].id, duplicateOf: list[i - 1].id });
      }
    }
  }
  return found;
}
