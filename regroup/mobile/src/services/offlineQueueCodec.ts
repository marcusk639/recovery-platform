/**
 * Serialisation for the offline activity queue's AsyncStorage payload.
 */

import type { QueuedActivity } from './offlineQueue';

const DATE_TAG = '__DATE__';

/** JSON.stringify replacer: Date instances become tagged ISO strings. */
function replacer(_key: string, value: unknown): unknown {
  return value instanceof Date ? `${DATE_TAG}${value.toISOString()}` : value;
}

/** JSON.parse reviver: tagged ISO strings become Date instances again. */
function reviver(_key: string, value: unknown): unknown {
  if (typeof value === 'string' && value.startsWith(DATE_TAG)) {
    return new Date(value.slice(DATE_TAG.length));
  }
  return value;
}

export function serialize(queue: QueuedActivity[]): string {
  return JSON.stringify(queue, replacer);
}

/**
 * Parse a stored payload. Anything that is not an array of objects yields an
 * empty queue and is reported (via onUnreadable, which must not
 * include the content): the next save replaces
 * the bad payload. Items stored before `ownerUid` existed fall back to loggedBy.
 */
export function deserialize(raw: string, onUnreadable: () => void): QueuedActivity[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw, reviver);
  } catch {
    onUnreadable();
    return [];
  }
  if (!Array.isArray(parsed)) {
    onUnreadable();
    return [];
  }
  return parsed
    .filter((item): item is QueuedActivity => typeof item === 'object' && item !== null)
    .map((item) => ({ ...item, ownerUid: item.ownerUid ?? item.loggedBy }));
}
