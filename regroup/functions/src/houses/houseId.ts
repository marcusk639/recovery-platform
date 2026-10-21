import { createHash } from 'crypto';

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
// ceil(256 / log2(62)) = 43: every SHA-256 digest fits in 43 base62 digits.
const DIGEST_BASE62_LENGTH = 43;
export const HOUSE_ID_LENGTH = 20;

const toBase62 = (bytes: Buffer): string => {
  let value = BigInt(`0x${bytes.toString('hex')}`);
  let out = '';
  while (value > 0n) {
    out = BASE62[Number(value % 62n)] + out;
    value /= 62n;
  }
  // Left-pad to a fixed width so the result never depends on leading zero bytes.
  return out.padStart(DIGEST_BASE62_LENGTH, '0');
};

/**
 * Server-derived house id. The client never chooses a house id: it sends a
 * requestKey, and the id is the first 20 base62 chars of
 * SHA-256(`${uid}:${requestKey}`). The same caller retrying with the same key
 * gets the same id (idempotent create), while no caller can target an id that
 * another operator's house — live or deleted — already uses, because the id is
 * bound to the caller's uid.
 */
export const deriveHouseId = (uid: string, requestKey: string): string => {
  const digest = createHash('sha256').update(`${uid}:${requestKey}`, 'utf8').digest();
  return toBase62(digest).slice(0, HOUSE_ID_LENGTH);
};
