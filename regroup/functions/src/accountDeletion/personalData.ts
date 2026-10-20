import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';
import { ratsFirestore } from '../api/firestore';

const BATCH_LIMIT = 400;

type DocRef = Parameters<typeof isDirectMessage>[0];
type Snap = { ref: unknown };
type PagedQuery = {
  limit(n: number): PagedQuery;
  startAfter(s: Snap): PagedQuery;
  get(): Promise<{ empty: boolean; docs: Snap[] }>;
};

/**
 * Delete every doc matching the query (optionally narrowed by `keep`), in pages of
 * at most 400 writes. Pages with a startAfter cursor so pages made up entirely of
 * skipped docs still make progress. Returns the count deleted.
 */
async function deleteAllMatching(
  query: PagedQuery,
  shouldDelete: (ref: DocRef) => boolean = () => true,
): Promise<number> {
  let total = 0;
  let last: Snap | undefined;
  for (;;) {
    const page = last ? query.startAfter(last) : query;
    const snap = await page.limit(BATCH_LIMIT).get();
    if (snap.empty) return total;
    last = snap.docs[snap.docs.length - 1];
    const batch = ratsFirestore.batch();
    let n = 0;
    for (const doc of snap.docs) {
      if (!shouldDelete(doc.ref as DocRef)) continue;
      batch.delete(doc.ref as FirebaseFirestore.DocumentReference);
      n++;
    }
    if (n > 0) await batch.commit();
    total += n;
  }
}

/** True for `direct-messages/{conversationId}/chat/{chatId}` docs. */
const isDirectMessage = (ref: {
  parent?: { parent?: { parent?: { id?: string } | null } | null };
}) => ref.parent?.parent?.parent?.id === 'direct-messages';

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
      ratsFirestore.collection('notifications').where('userId', '==', uid) as unknown as PagedQuery,
    ),
    applications: await deleteAllMatching(
      ratsFirestore
        .collectionGroup('applications')
        .where('applicantUid', '==', uid) as unknown as PagedQuery,
    ),
    // Only DMs the user sent; received messages and house group chat (houses/*/chat) survive.
    messages: await deleteAllMatching(
      ratsFirestore.collectionGroup('chat').where('senderId', '==', uid) as unknown as PagedQuery,
      isDirectMessage,
    ),
    guestWeeks: await deleteAllMatching(
      ratsFirestore.collection('guest-weeks').where('userId', '==', uid) as unknown as PagedQuery,
    ),
  };

  const bucket = admin.storage().bucket();
  await bucket.file(`users/${uid}/avatar`).delete({ ignoreNotFound: true });
  for (const guestId of guestIds) {
    const houseId = houseIdsByGuest[guestId];
    if (!houseId) continue;
    await bucket.deleteFiles({ prefix: `houses/${houseId}/guests/${guestId}/avatar/` });
  }

  logger.info('accountDeletion: personal data deleted', { ...counts, guests: guestIds.length });
}
