import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import {
  COLLECTION_PATHS,
  DirectMessageThreadDocument,
  DirectMessageDocument,
  FirestoreDocument,
} from '../types/schema';
import {UserModel} from './UserModel';
import {GroupModel} from './GroupModel';
import {ChatAttachment, DirectMessage, DirectConversation} from '../types';
import {FirebaseFirestoreTypes} from '@react-native-firebase/firestore';

/**
 * Generate a deterministic thread ID for two users
 */
export function generateThreadId(userId1: string, userId2: string): string {
  return [userId1, userId2].sort().join('_');
}

/**
 * Direct Message Model for managing direct messages between users
 */
export class DirectMessageModel {
  /**
   * Convert a Firestore direct message document to a DirectMessage object
   */
  static messageFromFirestore(
    doc: FirestoreDocument<DirectMessageDocument>,
    threadId: string,
  ): DirectMessage {
    const data = doc.data();
    return {
      id: doc.id,
      threadId,
      senderId: data.senderId,
      senderName: data.senderName || 'Unknown',
      senderPhotoURL: data.senderPhotoURL,
      text: data.text,
      sentAt: data.sentAt ? data.sentAt.toDate().getTime() : Date.now(),
      read: data.read || {},
      attachments: data.attachments,
      reactions: data.reactions,
      replyTo: data.replyTo
        ? {
            messageId: data.replyTo.messageId,
            senderName: data.replyTo.senderName,
            text: data.replyTo.text,
          }
        : null,
    };
  }

  /**
   * Convert a Firestore thread document to a DirectConversation object
   */
  static conversationFromFirestore(
    doc: FirestoreDocument<DirectMessageThreadDocument>,
    currentUserId: string,
  ): DirectConversation | null {
    const data = doc.data();
    const participants = data.participants || [];

    // Find the other user (not the current user)
    const otherUserId = participants.find((id: string) => id !== currentUserId);
    if (!otherUserId) {
      return null; // Invalid conversation
    }

    // Get user info (we'll need to fetch this separately or store in thread)
    // For now, we'll use a placeholder and fetch in the slice
    return {
      threadId: doc.id,
      otherUserId,
      otherUserName: 'Loading...', // Will be populated by fetching user data
      otherUserPhotoURL: undefined,
      lastMessage: {
        text: data.lastMessage?.text || '',
        senderId: data.lastMessage?.senderId || '',
        sentAt: data.lastMessage?.sentAt?.toDate() || new Date(),
        read: data.lastMessage?.read || {},
      },
      unreadCount: 0, // Will be calculated
      updatedAt: data.lastMessage?.sentAt?.toDate() || new Date(),
    };
  }

  /**
   * Check if a user can message another user
   */
  static async checkCanMessage(
    senderId: string,
    recipientId: string,
  ): Promise<{canMessage: boolean; reason?: string}> {
    try {
      // Check if recipient allows direct messages
      const recipientUser = await UserModel.getById(recipientId);
      if (!recipientUser) {
        return {canMessage: false, reason: 'User not found'};
      }

      if (recipientUser.privacySettings?.allowDirectMessages === false) {
        return {
          canMessage: false,
          reason: 'This user does not allow direct messages',
        };
      }

      // Check if users share at least one group
      const senderUser = await UserModel.getById(senderId);
      if (!senderUser) {
        return {canMessage: false, reason: 'User not found'};
      }

      const senderGroups = senderUser.homeGroups || [];
      const recipientGroups = recipientUser.homeGroups || [];

      const sharedGroups = senderGroups.filter(groupId =>
        recipientGroups.includes(groupId),
      );

      if (sharedGroups.length === 0) {
        return {
          canMessage: false,
          reason: 'You must be members of the same group to message each other',
        };
      }

      return {canMessage: true};
    } catch (error) {
      console.error('Error checking if user can message:', error);
      return {canMessage: false, reason: 'Error checking permissions'};
    }
  }

  /**
   * Initialize or get a thread between two users
   */
  static async initializeOrGetThread(
    userId1: string,
    userId2: string,
  ): Promise<string> {
    try {
      const threadId = generateThreadId(userId1, userId2);

      // Check if thread already exists
      const threadRef = firestore()
        .collection(COLLECTION_PATHS.DIRECT_MESSAGE_THREADS)
        .doc(threadId);
      const threadDoc = await threadRef.get();

      if (threadDoc.exists) {
        return threadId;
      }

      // Verify users can message each other
      const canMessage = await this.checkCanMessage(userId1, userId2);
      if (!canMessage.canMessage) {
        throw new Error(canMessage.reason || 'Cannot message this user');
      }

      // Get user info for both participants
      const [user1, user2] = await Promise.all([
        UserModel.getById(userId1),
        UserModel.getById(userId2),
      ]);

      if (!user1 || !user2) {
        throw new Error('User not found');
      }

      // Create new thread using a transaction to handle race conditions
      // This ensures only one thread is created if both users try simultaneously
      const timestamp = firestore.FieldValue.serverTimestamp();

      try {
        await firestore().runTransaction(async transaction => {
          const threadSnapshot = await transaction.get(threadRef);

          // If thread was created by another process, just return
          if (threadSnapshot.exists) {
            return;
          }

          // Create the thread
          transaction.set(threadRef, {
            participants: [userId1, userId2],
            lastMessage: {
              text: 'Conversation started',
              senderId: userId1,
              sentAt: timestamp,
              read: {[userId1]: true},
            },
            unreadCounts: {
              [userId1]: 0,
              [userId2]: 0,
            },
            createdAt: timestamp,
            updatedAt: timestamp,
          });
        });
      } catch (transactionError: any) {
        // If transaction fails due to contention, check if thread exists
        const existingDoc = await threadRef.get();
        if (existingDoc.exists) {
          // Thread was created by another process, that's fine
          return threadId;
        }
        // Otherwise, re-throw the error
        throw transactionError;
      }

      return threadId;
    } catch (error) {
      console.error('Error initializing thread:', error);
      throw error;
    }
  }

  /**
   * Send a direct message
   */
  static async sendMessage(
    threadId: string,
    text: string,
    attachments?: ChatAttachment[],
    replyTo?: {messageId: string; senderName: string; text: string} | null,
  ): Promise<DirectMessage> {
    const currentUser = auth().currentUser;
    if (!currentUser) {
      throw new Error('User not authenticated');
    }

    // Verify thread exists and user is a participant
    const threadRef = firestore()
      .collection(COLLECTION_PATHS.DIRECT_MESSAGE_THREADS)
      .doc(threadId);
    const threadDoc = await threadRef.get();

    if (!threadDoc.exists) {
      throw new Error('Thread not found');
    }

    const threadData = threadDoc.data() as DirectMessageThreadDocument;
    if (!threadData.participants.includes(currentUser.uid)) {
      throw new Error('Not a participant in this thread');
    }

    // Find the recipient (the other participant)
    const recipientId = threadData.participants.find(
      id => id !== currentUser.uid,
    );
    if (!recipientId) {
      throw new Error('Invalid thread: recipient not found');
    }

    const now = new Date();
    const messageRef = firestore()
      .collection(COLLECTION_PATHS.DIRECT_MESSAGES(threadId))
      .doc();

    const messageData = {
      id: messageRef.id,
      senderId: currentUser.uid,
      senderName: currentUser.displayName || 'Anonymous',
      senderPhotoURL: currentUser.photoURL || undefined,
      text,
      sentAt: firestore.Timestamp.fromDate(now),
      read: {[currentUser.uid]: true}, // Sender has read their own message
      attachments:
        attachments && attachments.length > 0 ? attachments : undefined,
      reactions: {},
      replyTo: replyTo || undefined,
    };

    // Remove undefined fields
    Object.keys(messageData).forEach(
      key =>
        (messageData as any)[key] === undefined &&
        delete (messageData as any)[key],
    );

    await messageRef.set(messageData);

    // Update thread's lastMessage and increment recipient's unread count
    const updateData: any = {
      lastMessage: {
        text: text.substring(0, 100), // Truncate for preview
        senderId: currentUser.uid,
        sentAt: firestore.Timestamp.fromDate(now),
        read: {[currentUser.uid]: true},
      },
      updatedAt: firestore.FieldValue.serverTimestamp(),
    };

    // Increment recipient's unread count atomically
    // Initialize unreadCounts if it doesn't exist (backward compatibility)
    if (!threadData.unreadCounts) {
      updateData.unreadCounts = {
        [currentUser.uid]: 0,
        [recipientId]: 1,
      };
    } else {
      updateData[`unreadCounts.${recipientId}`] =
        firestore.FieldValue.increment(1);
    }

    await threadRef.update(updateData);

    return {
      id: messageRef.id,
      threadId,
      senderId: messageData.senderId,
      senderName: messageData.senderName,
      senderPhotoURL: messageData.senderPhotoURL,
      text: messageData.text,
      sentAt: now.getTime(),
      read: messageData.read,
      replyTo: messageData.replyTo,
      attachments: messageData.attachments ?? [],
      reactions: messageData.reactions,
    };
  }

  /**
   * Get recent messages for a thread
   */
  static async getRecentMessages(
    threadId: string,
    limit: number = 20,
  ): Promise<DirectMessage[]> {
    try {
      const messagesRef = firestore().collection(
        COLLECTION_PATHS.DIRECT_MESSAGES(threadId),
      );
      const messagesSnapshot = await messagesRef
        .orderBy('sentAt', 'desc')
        .limit(limit)
        .get();

      return messagesSnapshot.docs
        .map(doc =>
          this.messageFromFirestore(
            {
              id: doc.id,
              data: () => doc.data() as any,
            },
            threadId,
          ),
        )
        .reverse(); // Oldest first
    } catch (error) {
      console.error('Error getting recent messages:', error);
      throw error;
    }
  }

  /**
   * Get messages before a certain message (for pagination)
   */
  static async getMessagesBefore(
    threadId: string,
    beforeMessageId: string,
    limit: number = 20,
  ): Promise<DirectMessage[]> {
    try {
      const beforeMessageRef = firestore()
        .collection(COLLECTION_PATHS.DIRECT_MESSAGES(threadId))
        .doc(beforeMessageId);

      const beforeMessageDoc = await beforeMessageRef.get();
      if (!beforeMessageDoc.exists) {
        throw new Error('Reference message not found');
      }

      const beforeData = beforeMessageDoc.data() as any;
      const beforeSentAt = beforeData.sentAt;

      const messagesRef = firestore().collection(
        COLLECTION_PATHS.DIRECT_MESSAGES(threadId),
      );
      const messagesSnapshot = await messagesRef
        .orderBy('sentAt', 'desc')
        .where('sentAt', '<', beforeSentAt)
        .limit(limit)
        .get();

      return messagesSnapshot.docs
        .map(doc =>
          this.messageFromFirestore(
            {
              id: doc.id,
              data: () => doc.data() as any,
            },
            threadId,
          ),
        )
        .reverse();
    } catch (error) {
      console.error('Error getting messages before:', error);
      throw error;
    }
  }

  /**
   * Mark a message as read
   */
  static async markMessageAsRead(
    threadId: string,
    messageId: string,
  ): Promise<void> {
    try {
      const currentUser = auth().currentUser;
      if (!currentUser) {
        throw new Error('User not authenticated');
      }

      const messageRef = firestore()
        .collection(COLLECTION_PATHS.DIRECT_MESSAGES(threadId))
        .doc(messageId);

      // Get message data first to check if it was previously unread
      const messageDoc = await messageRef.get();
      if (!messageDoc.exists) {
        throw new Error('Message not found');
      }

      const messageData = messageDoc.data() as any;
      const wasUnread = !messageData.read?.[currentUser.uid];

      // Update message read status
      await messageRef.update({
        [`read.${currentUser.uid}`]: true,
      });

      // Update thread's lastMessage.read and decrement unread count if message was unread
      const threadRef = firestore()
        .collection(COLLECTION_PATHS.DIRECT_MESSAGE_THREADS)
        .doc(threadId);
      const threadDoc = await threadRef.get();

      if (threadDoc.exists) {
        const threadData = threadDoc.data() as DirectMessageThreadDocument;
        const updateData: any = {};

        // Check if this message is the last message in the thread
        if (
          threadData.lastMessage?.sentAt &&
          messageData.sentAt &&
          threadData.lastMessage.sentAt.isEqual(messageData.sentAt)
        ) {
          // Update thread's lastMessage.read
          updateData[`lastMessage.read.${currentUser.uid}`] = true;
        }

        // Decrement unread count if message was previously unread
        if (wasUnread) {
          // Initialize unreadCounts if it doesn't exist (backward compatibility)
          if (!threadData.unreadCounts) {
            updateData.unreadCounts = {
              [currentUser.uid]: 0,
            };
            // Find the other participant
            const otherUserId = threadData.participants.find(
              id => id !== currentUser.uid,
            );
            if (otherUserId) {
              updateData.unreadCounts[otherUserId] = 0;
            }
          } else {
            // Use increment(-1) to decrement, but ensure it doesn't go below 0
            const currentCount = threadData.unreadCounts[currentUser.uid] || 0;
            if (currentCount > 0) {
              updateData[`unreadCounts.${currentUser.uid}`] =
                firestore.FieldValue.increment(-1);
            }
          }
        }

        if (Object.keys(updateData).length > 0) {
          await threadRef.update(updateData);
        }
      }
    } catch (error) {
      console.error('Error marking message as read:', error);
      throw error;
    }
  }

  /**
   * Add a reaction to a message
   */
  static async addReaction(
    threadId: string,
    messageId: string,
    reactionType: string,
  ): Promise<void> {
    try {
      const currentUser = auth().currentUser;
      if (!currentUser) {
        throw new Error('User not authenticated');
      }

      const messageRef = firestore()
        .collection(COLLECTION_PATHS.DIRECT_MESSAGES(threadId))
        .doc(messageId);

      await messageRef.update({
        [`reactions.${reactionType}`]: firestore.FieldValue.arrayUnion(
          currentUser.uid,
        ),
      });
    } catch (error) {
      console.error('Error adding reaction:', error);
      throw error;
    }
  }

  /**
   * Remove a reaction from a message
   */
  static async removeReaction(
    threadId: string,
    messageId: string,
    reactionType: string,
  ): Promise<void> {
    try {
      const currentUser = auth().currentUser;
      if (!currentUser) {
        throw new Error('User not authenticated');
      }

      const messageRef = firestore()
        .collection(COLLECTION_PATHS.DIRECT_MESSAGES(threadId))
        .doc(messageId);

      await messageRef.update({
        [`reactions.${reactionType}`]: firestore.FieldValue.arrayRemove(
          currentUser.uid,
        ),
      });
    } catch (error) {
      console.error('Error removing reaction:', error);
      throw error;
    }
  }

  /**
   * Delete a message
   */
  static async deleteMessage(
    threadId: string,
    messageId: string,
  ): Promise<void> {
    try {
      const currentUser = auth().currentUser;
      if (!currentUser) {
        throw new Error('User not authenticated');
      }

      const messageRef = firestore()
        .collection(COLLECTION_PATHS.DIRECT_MESSAGES(threadId))
        .doc(messageId);

      const messageDoc = await messageRef.get();
      if (!messageDoc.exists) {
        throw new Error('Message not found');
      }

      const messageData = messageDoc.data() as any;
      if (messageData.senderId !== currentUser.uid) {
        throw new Error('Not authorized to delete this message');
      }

      // Get thread data to check if this is the last message
      const threadRef = firestore()
        .collection(COLLECTION_PATHS.DIRECT_MESSAGE_THREADS)
        .doc(threadId);
      const threadDoc = await threadRef.get();

      if (!threadDoc.exists) {
        throw new Error('Thread not found');
      }

      const threadData = threadDoc.data() as DirectMessageThreadDocument;
      const isLastMessage =
        threadData.lastMessage?.sentAt &&
        messageData.sentAt &&
        threadData.lastMessage.sentAt.isEqual(messageData.sentAt);

      // Find the recipient (the other participant)
      const recipientId = threadData.participants.find(
        id => id !== currentUser.uid,
      );

      // Check if the deleted message was unread by the recipient
      const wasUnreadByRecipient =
        recipientId && !messageData.read?.[recipientId];

      // Delete the message
      await messageRef.delete();

      // If the message was unread by recipient, decrement their unread count
      if (wasUnreadByRecipient && threadData.unreadCounts) {
        const currentCount = threadData.unreadCounts[recipientId] || 0;
        if (currentCount > 0) {
          await threadRef.update({
            [`unreadCounts.${recipientId}`]: firestore.FieldValue.increment(-1),
          });
        }
      }

      // If this was the last message, update thread's lastMessage to the previous message
      if (isLastMessage) {
        const messagesRef = firestore().collection(
          COLLECTION_PATHS.DIRECT_MESSAGES(threadId),
        );
        const previousMessages = await messagesRef
          .orderBy('sentAt', 'desc')
          .limit(1)
          .get();

        if (previousMessages.docs.length > 0) {
          const prevMsg = previousMessages.docs[0].data() as any;
          await threadRef.update({
            lastMessage: {
              text: prevMsg.text?.substring(0, 100) || '',
              senderId: prevMsg.senderId,
              sentAt: prevMsg.sentAt,
              read: prevMsg.read || {},
            },
            updatedAt: firestore.FieldValue.serverTimestamp(),
          });
        } else {
          // No messages left, set default lastMessage
          await threadRef.update({
            lastMessage: {
              text: 'Conversation started',
              senderId: currentUser.uid,
              sentAt: firestore.FieldValue.serverTimestamp(),
              read: {[currentUser.uid]: true},
            },
            updatedAt: firestore.FieldValue.serverTimestamp(),
          });
        }
      }
    } catch (error) {
      console.error('Error deleting message:', error);
      throw error;
    }
  }

  /**
   * Listen for new messages in real-time
   */
  static listenForMessages(
    threadId: string,
    callback: (messages: DirectMessage[]) => void,
    options?: {limit?: number},
  ): () => void {
    const limit = options?.limit || 30;
    const messagesRef = firestore().collection(
      COLLECTION_PATHS.DIRECT_MESSAGES(threadId),
    );

    const unsubscribe = messagesRef
      .orderBy('sentAt', 'desc')
      .limit(limit)
      .onSnapshot(
        snapshot => {
          const messages = snapshot.docs
            .map(doc =>
              this.messageFromFirestore(
                {
                  id: doc.id,
                  data: () => doc.data() as any,
                },
                threadId,
              ),
            )
            .reverse(); // Oldest first

          callback(messages);
        },
        error => {
          console.error('Error listening for messages:', error);
        },
      );

    return unsubscribe;
  }

  /**
   * Get all conversations for a user
   */
  static async getConversationsForUser(
    userId: string,
    options?: {
      limit?: number;
      lastThreadId?: string; // For cursor-based pagination
    },
  ): Promise<DirectConversation[]> {
    try {
      const limit = options?.limit || 20;
      const threadsRef = firestore().collection(
        COLLECTION_PATHS.DIRECT_MESSAGE_THREADS,
      );

      // Note: Pagination with orderBy requires a composite index on participants + updatedAt
      // For now, we'll fetch all and paginate/sort in memory
      // This can be optimized later when the index is created
      const threadsSnapshot = await threadsRef
        .where('participants', 'array-contains', userId)
        .get();

      const conversations: DirectConversation[] = [];

      for (const doc of threadsSnapshot.docs) {
        const threadData = doc.data() as DirectMessageThreadDocument;
        const otherUserId = threadData.participants.find(
          (id: string) => id !== userId,
        );

        if (!otherUserId) continue;

        // Get other user's info
        const otherUser = await UserModel.getById(otherUserId);

        // Get unread count from thread document (optimized)
        // Fallback to 0 if unreadCounts doesn't exist (backward compatibility)
        const unreadCount = threadData.unreadCounts?.[userId] || 0;

        conversations.push({
          threadId: doc.id,
          otherUserId,
          otherUserName: otherUser?.displayName || 'Unknown',
          otherUserPhotoURL: otherUser?.photoUrl || undefined,
          lastMessage: {
            text: threadData.lastMessage?.text || '',
            senderId: threadData.lastMessage?.senderId || '',
            sentAt: threadData.lastMessage?.sentAt?.toDate() || new Date(),
            read: threadData.lastMessage?.read || {},
          },
          unreadCount,
          updatedAt:
            threadData.lastMessage?.sentAt?.toDate() ||
            doc.data().createdAt?.toDate() ||
            new Date(),
        });
      }

      // Sort conversations by updatedAt (most recent first)
      conversations.sort(
        (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
      );

      // Apply pagination in memory
      // If lastThreadId provided, find its index and return conversations after it
      let startIndex = 0;
      if (options?.lastThreadId) {
        const lastIndex = conversations.findIndex(
          c => c.threadId === options.lastThreadId,
        );
        if (lastIndex >= 0) {
          startIndex = lastIndex + 1;
        }
      }

      // Return paginated results
      return conversations.slice(startIndex, startIndex + limit);
    } catch (error) {
      console.error('Error getting conversations:', error);
      throw error;
    }
  }
}
