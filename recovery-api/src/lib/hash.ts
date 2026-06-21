import { createHash } from 'crypto';

/**
 * One-way hash of a user uid for attribution-only audit rows. The raw uid is
 * NEVER stored alongside directory reads — only this hex digest. sha256 (not the
 * 24-char sha1 directory-id recipe in lib/meetings/identity.ts) so the two
 * concerns never share a recipe: identity.ts hashes meeting identity, this
 * hashes a user for non-reversible attribution.
 */
export function hashUid(uid: string): string {
  return createHash('sha256').update(uid).digest('hex');
}
