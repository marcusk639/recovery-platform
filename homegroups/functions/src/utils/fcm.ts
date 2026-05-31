import * as logger from "firebase-functions/logger";
import { db } from "./firebase";
import * as admin from "firebase-admin";

/**
 * After a sendEachForMulticast call, removes tokens that Firebase reports as
 * no longer registered from their owner's Firestore user documents.
 *
 * @param tokenOwners Ordered list of {uid, token} pairs — must match the
 *   `tokens` array passed to sendEachForMulticast (same length, same order).
 * @param responses The `responses` array from the SendResponse returned by
 *   sendEachForMulticast.
 */
export async function pruneStaleTokens(
  tokenOwners: { uid: string; token: string }[],
  responses: admin.messaging.SendResponse[],
): Promise<void> {
  const staleByUser = new Map<string, string[]>();

  responses.forEach((resp, idx) => {
    if (!resp.success && resp.error) {
      const code = resp.error.code;
      if (
        code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-registration-token"
      ) {
        const { uid, token } = tokenOwners[idx];
        const existing = staleByUser.get(uid) ?? [];
        staleByUser.set(uid, [...existing, token]);
      }
    }
  });

  if (staleByUser.size === 0) return;

  const batch = db.batch();
  staleByUser.forEach((tokens, uid) => {
    const ref = db.collection("users").doc(uid);
    batch.update(ref, {
      fcmTokens: admin.firestore.FieldValue.arrayRemove(...tokens),
    });
  });

  try {
    await batch.commit();
    logger.info(`Pruned stale FCM tokens from ${staleByUser.size} user(s)`);
  } catch (err) {
    logger.warn("Failed to prune stale FCM tokens:", err);
  }
}
