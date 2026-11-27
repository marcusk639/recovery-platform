// enforceAccountRateLimit against the in-memory Firestore: a fixed window per
// account and bucket, counted in a transaction.

jest.mock('firebase-functions', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../api/firestore', () => require('../helpers/memFirestore').apiFirestore);

import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { mem, memDb } from '../helpers/memFirestore';
import {
  AccountRateLimit,
  RATE_LIMIT_COLLECTION,
  enforceAccountRateLimit,
  rateLimitDocId,
} from '../../util/rateLimit';

const HOUR = 60 * 60 * 1000;
const T0 = 1_800_000_000_000;
const limit: AccountRateLimit = {
  bucket: 'testBucket',
  max: 3,
  windowMs: HOUR,
  message: 'Too many test calls.',
};

const callN = async (uid: string, n: number, now = T0) => {
  for (let i = 0; i < n; i++) await enforceAccountRateLimit(uid, limit, now);
};

const refusal = async (p: Promise<unknown>): Promise<HttpsError> => {
  try {
    await p;
  } catch (err) {
    return err as HttpsError;
  }
  throw new Error('expected a refusal');
};

beforeEach(() => mem.reset());

describe('enforceAccountRateLimit', () => {
  it('allows calls under the limit and counts each one', async () => {
    await callN('uid-a', 2);
    const doc = mem.get(`${RATE_LIMIT_COLLECTION}/${rateLimitDocId('testBucket', 'uid-a')}`);
    expect(doc).toMatchObject({ windowStart: T0, count: 2 });
  });

  it('allows the call that reaches the limit', async () => {
    await expect(callN('uid-a', 3)).resolves.toBeUndefined();
  });

  it('refuses the call over the limit with resource-exhausted and a retry time', async () => {
    await callN('uid-a', 3);
    const err = await refusal(enforceAccountRateLimit('uid-a', limit, T0 + 15 * 60 * 1000));
    expect(err).toBeInstanceOf(HttpsError);
    expect(err.code).toBe('resource-exhausted');
    expect(err.message).toBe('Too many test calls. Please try again in 45 minutes.');
    expect(err.details).toEqual({ retryAfterSeconds: 45 * 60 });
  });

  it('does not count a refused call', async () => {
    await callN('uid-a', 3);
    await refusal(enforceAccountRateLimit('uid-a', limit, T0 + 1));
    await refusal(enforceAccountRateLimit('uid-a', limit, T0 + 2));
    const doc = mem.get(`${RATE_LIMIT_COLLECTION}/${rateLimitDocId('testBucket', 'uid-a')}`);
    expect(doc).toMatchObject({ windowStart: T0, count: 3 });
  });

  it('says "1 minute" in the last minute of the window', async () => {
    await callN('uid-a', 3);
    const err = await refusal(enforceAccountRateLimit('uid-a', limit, T0 + HOUR - 5_000));
    expect(err.message).toBe('Too many test calls. Please try again in 1 minute.');
  });

  it('starts a new window once the old one has ended', async () => {
    await callN('uid-a', 3);
    await refusal(enforceAccountRateLimit('uid-a', limit, T0 + HOUR - 1));
    await expect(enforceAccountRateLimit('uid-a', limit, T0 + HOUR)).resolves.toBeUndefined();
    const doc = mem.get(`${RATE_LIMIT_COLLECTION}/${rateLimitDocId('testBucket', 'uid-a')}`);
    expect(doc).toMatchObject({ windowStart: T0 + HOUR, count: 1 });
    await callN('uid-a', 2, T0 + HOUR + 1);
    await refusal(enforceAccountRateLimit('uid-a', limit, T0 + HOUR + 2));
  });

  it('keeps each account separate', async () => {
    await callN('uid-a', 3);
    await refusal(enforceAccountRateLimit('uid-a', limit, T0));
    await expect(callN('uid-b', 3)).resolves.toBeUndefined();
    await refusal(enforceAccountRateLimit('uid-b', limit, T0));
  });

  it('keeps each bucket separate', async () => {
    await callN('uid-a', 3);
    const other = { ...limit, bucket: 'otherBucket' };
    await expect(enforceAccountRateLimit('uid-a', other, T0)).resolves.toBeUndefined();
  });

  it('sets expireAt a day after the window ends, for a TTL policy', async () => {
    await callN('uid-a', 2);
    const doc = mem.get(`${RATE_LIMIT_COLLECTION}/${rateLimitDocId('testBucket', 'uid-a')}`) as {
      expireAt: { _seconds: number };
    };
    expect(doc.expireAt._seconds * 1000).toBe(T0 + HOUR + 24 * HOUR);
  });

  it('hashes the uid into a fixed-length doc id', () => {
    const id = rateLimitDocId('findMeetings', 'a/b/../c');
    expect(id).toMatch(/^findMeetings_[0-9a-f]{64}$/);
    expect(id).not.toContain('a/b');
  });

  it('fails closed with unavailable when the counter cannot be read', async () => {
    const spy = jest.spyOn(memDb, 'runTransaction').mockRejectedValueOnce(new Error('UNAVAILABLE'));
    const err = await refusal(enforceAccountRateLimit('uid-a', limit, T0));
    expect(err.code).toBe('unavailable');
    expect(logger.error).toHaveBeenCalledWith(
      'rateLimit.check_failed',
      expect.objectContaining({ bucket: 'testBucket' }),
    );
    spy.mockRestore();
  });

  it('lets only one of two racing calls take the last slot', async () => {
    await callN('uid-a', 2);
    const path = `${RATE_LIMIT_COLLECTION}/${rateLimitDocId('testBucket', 'uid-a')}`;
    let competitor: Promise<void> | undefined;
    // A second call commits between the first call's read and its commit.
    mem.beforeCommit = async () => {
      mem.beforeCommit = null;
      competitor = enforceAccountRateLimit('uid-a', limit, T0);
      await competitor;
    };
    const err = await refusal(enforceAccountRateLimit('uid-a', limit, T0));
    await expect(competitor).resolves.toBeUndefined();
    expect(err.code).toBe('resource-exhausted');
    expect(mem.get(path)).toMatchObject({ windowStart: T0, count: 3 });
  });

  it('decides again on a retried transaction (no stale refusal)', async () => {
    await callN('uid-a', 3);
    const path = `${RATE_LIMIT_COLLECTION}/${rateLimitDocId('testBucket', 'uid-a')}`;
    // The first attempt sees the full window; before it ends, the counter is
    // replaced by a fresh one, so the retry must serve the call.
    mem.beforeCommit = () => {
      mem.beforeCommit = null;
      mem.seed(path, { windowStart: T0 + 10, count: 0 });
    };
    await expect(enforceAccountRateLimit('uid-a', limit, T0 + 20)).resolves.toBeUndefined();
    expect(mem.get(path)).toMatchObject({ windowStart: T0 + 10, count: 1 });
  });

  it('logs a refusal with ids only', async () => {
    await callN('uid-a', 3);
    await refusal(enforceAccountRateLimit('uid-a', limit, T0));
    expect(logger.warn).toHaveBeenCalledWith('rateLimit.exceeded', {
      bucket: 'testBucket',
      uid: 'uid-a',
      retryAfterSeconds: 3600,
    });
  });
});
