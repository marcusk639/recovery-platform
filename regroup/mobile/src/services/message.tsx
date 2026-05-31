/**
 * Message Service - Firestore Implementation
 *
 * MIGRATED: Phase 5.3 - Switched from Firebase Realtime Database to Firestore
 *
 * Benefits of Firestore:
 * - Better querying with compound indexes
 * - Consistent with other collections in the app
 * - Better offline support and caching
 * - More scalable pagination
 * - Automatic indexing
 *
 * Migration Notes:
 * - All functions now use Firestore collections instead of Realtime DB refs
 * - Data structure: /houses/{id}/chat and /direct-messages/{id}/chat
 * - Unsubscribe pattern changed: store returned function and call it directly
 * - See MIGRATION_MESSAGE_SERVICE.md for backend migration steps
 *
 * IMPORTANT: Requires backend data migration before deployment
 */
import { firestore } from '../../firebase-setup';
import { Message } from '../entities/Message';
import { DirectMessage } from '../entities/DirectConversation';
import * as crud from './crud';
import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { logException } from '../util/logging';

const houseCollection = firestore.collection('houses');
const directMessageCollection = firestore.collection('direct-messages');

export function getMessageDate(
  createdAt:
    | FirebaseFirestoreTypes.Timestamp
    | { seconds?: number; _seconds?: number }
    | Date,
): Date | undefined {
  if (typeof (createdAt as any).toDate === 'function') {
    return (createdAt as FirebaseFirestoreTypes.Timestamp).toDate();
  }
  const timestampLike = createdAt as { seconds?: number; _seconds?: number };
  if (timestampLike.seconds) {
    return new Date(timestampLike.seconds * 1000);
  }
  if (timestampLike._seconds) {
    return new Date(timestampLike._seconds * 1000);
  }
  if (createdAt instanceof Date) {
    return createdAt;
  }
  return undefined;
}

/**
 * Send messages to house chat (Firestore)
 *
 * Uses Promise.allSettled so that a single failed write does not abort the
 * entire batch.  Each result is either { status: 'fulfilled', value: Message }
 * or { status: 'rejected', reason: unknown }.  Individual failures are logged
 * via logException but do NOT cause the function to throw — partial success is
 * acceptable.
 *
 * @param houseId - House ID
 * @param messages - Messages to send
 */
export async function sendMessageToHouseChat(
  houseId: string,
  messages: Message[],
): Promise<PromiseSettledResult<Message>[]> {
  const promises = messages.map(message =>
    crud.create<Message>(
      houseCollection.doc(houseId).collection('chat'),
      message,
    ),
  );
  const results = await Promise.allSettled(promises);

  // Log any individual failures without throwing — partial success is acceptable
  results.forEach(result => {
    if (result.status === 'rejected') {
      logException(result.reason);
    }
  });

  return results;
}

export const sortByDate = (messages: Message[]) =>
  messages.sort(
    (left, right) =>
      new Date(right.createdAt as any).getTime() -
      new Date(left.createdAt as any).getTime(),
  );

/**
 * Handle Firestore chat snapshot changes
 */
function onChatSnapshot(
  querySnapshot: FirebaseFirestoreTypes.QuerySnapshot,
  newMessageHandler: (messages: Message[], chatId?: string) => any,
  chatId?: string,
) {
  const messages: Message[] = [];
  querySnapshot.forEach(doc => {
    messages.push({ id: doc.id, ...doc.data() } as Message);
  });
  newMessageHandler(messages, chatId);
}

/**
 * Subscribe to house chat real-time updates (Firestore)
 * @param houseId - House ID
 * @param newMessageHandler - Callback for new messages
 * @returns Unsubscribe function
 */
export function subscribeToHouseChat(
  houseId: string,
  newMessageHandler: (houseMessages: Message[]) => any,
): () => void {
  return houseCollection
    .doc(houseId)
    .collection('chat')
    .orderBy('sortKey', 'desc')
    .limit(20)
    .onSnapshot(
      querySnapshot => onChatSnapshot(querySnapshot, newMessageHandler),
      // Firestore permission / network errors would otherwise silently
      // terminate the stream — route to Sentry so the user's stale chat
      // does not go unexplained.
      error => logException(error),
    );
}

export const CHAT_ID = (ids: string[]) => ids.sort().join('');

/**
 * Handle house chat snapshot (Firestore)
 */
const onHouseChatSnapshot = (
  snapshot: FirebaseFirestoreTypes.QuerySnapshot,
  newMessageHandler: (houseMessages: Message[]) => any,
) => {
  const messages: Message[] = [];
  snapshot.forEach(doc => {
    messages.push({ id: doc.id, ...doc.data() } as Message);
  });
  newMessageHandler(messages);
};

/**
 * Load house chat history (Firestore)
 * @param houseId - House ID
 * @param newMessageHandler - Callback with messages
 * @param startAfterDoc - Document ID to start after (for pagination)
 */
export const loadChat = async (
  houseId: string,
  newMessageHandler: (houseMessages: Message[]) => any,
  startAfterDoc?: string,
): Promise<void> => {
  try {
    let query = houseCollection
      .doc(houseId)
      .collection('chat')
      .orderBy('sortKey', 'desc')
      .limit(20);

    if (startAfterDoc) {
      const startDoc = await houseCollection
        .doc(houseId)
        .collection('chat')
        .doc(startAfterDoc)
        .get();
      query = query.startAfter(startDoc);
    }

    const snapshot = await query.get();
    onHouseChatSnapshot(snapshot, newMessageHandler);
  } catch (error) {
    logException(error);
    throw new Error('Failed to load chat history');
  }
};

/**
 * Load direct chat history (Firestore)
 * @param id - Conversation ID (sorted user IDs joined)
 * @param newMessageHandler - Callback with messages
 * @param startAfterDoc - Document ID to start after (for pagination)
 */
export const loadDirectChat = async (
  id: string,
  newMessageHandler: (
    houseMessages: Message[],
    chatId?: string,
    loading?: boolean,
  ) => any,
  startAfterDoc?: string,
): Promise<Message[]> => {
  try {
    let query = directMessageCollection
      .doc(id)
      .collection('chat')
      .orderBy('sortKey', 'desc')
      .limit(20);

    if (startAfterDoc) {
      const startDoc = await directMessageCollection
        .doc(id)
        .collection('chat')
        .doc(startAfterDoc)
        .get();
      query = query.startAfter(startDoc);
    }

    const snapshot = await query.get();
    const messages: Message[] = [];
    snapshot.forEach(doc => {
      messages.push({ id: doc.id, ...doc.data() } as Message);
    });

    newMessageHandler(messages, id, !startAfterDoc);
    return messages;
  } catch (error) {
    logException(error);
    throw new Error('Failed to load direct chat');
  }
};

/**
 * Subscribe to direct chat real-time updates (Firestore)
 * @param ids - Array of user IDs (will be sorted to create conversation ID)
 * @param newMessageHandler - Callback for new messages
 * @returns Unsubscribe function
 */
export function subscribeToDirectChat(
  ids: string[],
  newMessageHandler: (directMessages: Message[], chatId?: string) => any,
): () => void {
  const id = CHAT_ID(ids);
  return directMessageCollection
    .doc(id)
    .collection('chat')
    .orderBy('sortKey', 'desc')
    .limit(20)
    .onSnapshot(
      querySnapshot => onChatSnapshot(querySnapshot, newMessageHandler, id),
      error => logException(error),
    );
}

/**
 * Mark a message as read (Firestore)
 * @param chatId - Conversation ID
 * @param messageId - Message ID to mark as read
 */
export async function markRead(
  chatId: string,
  messageId: string,
): Promise<void> {
  try {
    await directMessageCollection
      .doc(chatId)
      .collection('chat')
      .doc(messageId)
      .update({ read: true });
  } catch (error) {
    logException(error);
    throw new Error('Failed to mark message as read');
  }
}

/**
 * Unsubscribe from direct chat (Firestore)
 * Note: With Firestore, unsubscribe is handled by calling the function
 * returned from subscribeToDirectChat()
 * @param unsubscribe - The unsubscribe function returned from subscribeToDirectChat
 */
export function unsubscribeFromDirectChat(unsubscribe: () => void): void {
  if (unsubscribe) {
    unsubscribe();
  }
}

/**
 * Unsubscribe from house chat (Firestore)
 * Note: With Firestore, unsubscribe is handled by calling the function
 * returned from subscribeToHouseChat()
 * @param unsubscribe - The unsubscribe function returned from subscribeToHouseChat
 */
export function unsubscribeFromHouseChat(unsubscribe: () => void): void {
  if (unsubscribe) {
    unsubscribe();
  }
}

/**
 * Note: With Firestore onSnapshot, each subscription returns its own unsubscribe
 * function that should be called directly. These utility functions are maintained
 * for backwards compatibility but callers should store and call unsubscribe
 * functions returned from subscribe methods.
 */

/**
 * Send messages to a direct conversation (Firestore)
 * @param id - Conversation ID (sorted user IDs joined)
 * @param messages - Messages to send
 */
export async function updateConversation(
  id: string,
  messages: DirectMessage[],
): Promise<void> {
  try {
    const promises = messages.map(message =>
      crud.create<DirectMessage>(
        directMessageCollection.doc(id).collection('chat'),
        message,
      ),
    );
    await Promise.all(promises);
  } catch (error) {
    logException(error);
    throw new Error('Failed to send direct messages');
  }
}
