import * as admin from "firebase-admin";
import { logger } from "firebase-functions/v2";
import { ratsFirestore } from "../api/firestore";

const BATCH_LIMIT = 400;

type DeletableQuery = {
  limit(n: number): { get(): Promise<{ empty: boolean; docs: { ref: unknown }[] }> };
};

/** Delete every doc matching the query, in pages of at most 400 writes. Returns the count. */
async function deleteAllMatching(query: DeletableQuery): Promise<number> {
  let total = 0;
  for (;;) {
    const snap = await query.limit(BATCH_LIMIT).get();
    if (snap.empty) return total;
    const batch = ratsFirestore.batch();
    for (const doc of snap.docs) {
      batch.delete(doc.ref as FirebaseFirestore.DocumentReference);
    }
    await batch.commit();
    total += snap.docs.length;
  }
}

/**
 * Delete a user's personal Firestore records and Storage avatars. Idempotent:
 * empty queries and missing files are fine. Logs counts only, never identifiers.
 */
export async function deletePersonalData(
  uid: string,
  guestIds: string[],
  houseIdsByGuest: Record<string, string>,
): Promise<void> {
  const counts = {
    notifications: await deleteAllMatching(
      ratsFirestore.collection("notifications").where("userId", "==", uid),
    ),
    applications: await deleteAllMatching(
      ratsFirestore.collectionGroup("applications").where("applicantUid", "==", uid),
    ),
    // Only messages the user sent; messages they merely received belong to the sender.
    messages: await deleteAllMatching(
      ratsFirestore.collectionGroup("chat").where("senderId", "==", uid),
    ),
    guestWeeks: await deleteAllMatching(
      ratsFirestore.collection("guest-weeks").where("userId", "==", uid),
    ),
  };

  const bucket = admin.storage().bucket();
  await bucket.file(`users/${uid}/avatar`).delete({ ignoreNotFound: true });
  for (const guestId of guestIds) {
    const houseId = houseIdsByGuest[guestId];
    if (!houseId) continue;
    await bucket.deleteFiles({ prefix: `houses/${houseId}/guests/${guestId}/avatar/` });
  }

  logger.info("accountDeletion: personal data deleted", { ...counts, guests: guestIds.length });
}
