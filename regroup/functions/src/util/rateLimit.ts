import { createHash } from 'crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { ratsFirestore } from '../api/firestore';

/**
 * Per-account call limits for callables that spend money on every call (the
 * 12-step meeting callables call Google Maps and the recovery-api directory).
 *
 * A fixed window per account and bucket, counted in a Firestore transaction:
 * an in-memory counter would not hold, because instances are not reused
 * between calls and several run at once. The counter lives in the server-only
 * `rateLimits` collection (no client rule, so the rules deny every client).
 */
export interface AccountRateLimit {
  /** One bucket per callable, e.g. `findMeetings`. Part of the doc id. */
  bucket: string;
  /** Calls allowed per window; the next call in the window is refused. */
  max: number;
  windowMs: number;
  /** What the refusal tells the user, before "Please try again in N minutes." */
  message: string;
}

export const RATE_LIMIT_COLLECTION = 'rateLimits';

/**
 * How long a counter doc outlives its window. Only sets `expireAt`: deleting
 * expired docs needs a TTL policy on `rateLimits.expireAt` (an ops step, see
 * functions/CLAUDE.md). Without one the docs stay, one per account and bucket.
 */
const RETENTION_AFTER_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * `rateLimits/{bucket}_{sha256(uid)}`. Hashed so the id is always a valid,
 * fixed-length doc id (an Admin-SDK uid may hold any character) and the
 * collection holds no account ids. Not a sequential key, so no hot-spotting.
 */
export function rateLimitDocId(bucket: string, uid: string): string {
  return `${bucket}_${createHash('sha256').update(uid).digest('hex')}`;
}

function retryMessage(limit: AccountRateLimit, retryAfterMs: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterMs / 60_000));
  return `${limit.message} Please try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
}

/**
 * Counts one call by `uid` against `limit`, or throws:
 * - `resource-exhausted` (with `details.retryAfterSeconds`) when the account
 *   already made `max` calls in the current window. A refused call is not
 *   counted, so the window still ends `windowMs` after its first call.
 * - `unavailable` when the counter cannot be read or written. Fails closed:
 *   the limit is a cost control, and a Firestore outage breaks the callers'
 *   own writes (a check-in's attendance record) anyway.
 */
export async function enforceAccountRateLimit(
  uid: string,
  limit: AccountRateLimit,
  now: number = Date.now(),
): Promise<void> {
  const ref = ratsFirestore
    .collection(RATE_LIMIT_COLLECTION)
    .doc(rateLimitDocId(limit.bucket, uid));
  let retryAfterMs: number | null = null;
  try {
    await ratsFirestore.runTransaction(async (tx) => {
      retryAfterMs = null; // a retried transaction decides again
      const snap = await tx.get(ref);
      const data = snap.exists ? snap.data() : undefined;
      const windowStart = typeof data?.windowStart === 'number' ? data.windowStart : undefined;
      const count = typeof data?.count === 'number' ? data.count : 0;
      if (windowStart === undefined || now - windowStart >= limit.windowMs) {
        tx.set(ref, {
          windowStart: now,
          count: 1,
          expireAt: Timestamp.fromMillis(now + limit.windowMs + RETENTION_AFTER_WINDOW_MS),
        });
        return;
      }
      if (count >= limit.max) {
        retryAfterMs = windowStart + limit.windowMs - now;
        return;
      }
      tx.set(ref, {
        windowStart,
        count: count + 1,
        expireAt: Timestamp.fromMillis(windowStart + limit.windowMs + RETENTION_AFTER_WINDOW_MS),
      });
    });
  } catch (err) {
    logger.error('rateLimit.check_failed', {
      bucket: limit.bucket,
      error: (err as Error)?.message,
    });
    throw new HttpsError('unavailable', 'Something went wrong. Please try again in a moment.');
  }
  if (retryAfterMs !== null) {
    const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
    // ids only (no PII): which account hit which bucket.
    logger.warn('rateLimit.exceeded', { bucket: limit.bucket, uid, retryAfterSeconds });
    throw new HttpsError('resource-exhausted', retryMessage(limit, retryAfterMs), {
      retryAfterSeconds,
    });
  }
}
