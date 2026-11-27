/**
 * The only writer of custom claims (a test fails on any other
 * `setCustomUserClaims` call in src/).
 *
 * An ID token keeps the claims it was minted with for up to an hour, and the
 * rules read the token. So after every claims write this stamps
 * `claims-updates/{uid}` (server-only; the account may read its own doc). The
 * app listens to it and force-refreshes the token, so a promotion, demotion or
 * removal reaches the affected user's app within seconds instead of at the
 * next hourly refresh (mobile `src/services/claimsUpdates.ts`).
 *
 * This is cooperative: an unmodified app refreshes, but a client that ignores
 * the marker can keep using its old token until it expires. Callables read
 * live claims, so they are not affected. See "Stale tokens" in
 * functions/CLAUDE.md for why refresh tokens are not revoked.
 */
import { auth, firestore } from 'firebase-admin';
import { logger } from 'firebase-functions';

export const CLAIMS_UPDATES_COLLECTION = 'claims-updates';

/**
 * Stamps the marker. Never throws: the claims are already written, and the
 * worst case of a missing marker is the old hourly refresh.
 */
export async function markClaimsUpdated(uid: string): Promise<void> {
  try {
    await firestore()
      .collection(CLAIMS_UPDATES_COLLECTION)
      .doc(uid)
      .set({ updatedAt: firestore.FieldValue.serverTimestamp() });
  } catch (error) {
    logger.error('claims_marker.write_failed', { uid, error });
  }
}

/** `auth().setCustomUserClaims`, then the marker. */
export async function setUserClaims(uid: string, claims: object): Promise<void> {
  await auth().setCustomUserClaims(uid, claims);
  await markClaimsUpdated(uid);
}
