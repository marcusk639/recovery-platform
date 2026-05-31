import {
  createSlice,
  createAsyncThunk,
  PayloadAction,
  createEntityAdapter,
  createSelector,
} from '@reduxjs/toolkit';
import auth from '@react-native-firebase/auth';
import {RootState} from '../types';
import {
  DirectMessageModel,
  generateThreadId,
} from '../../models/DirectMessageModel';
import {DirectMessage, DirectConversation} from '../../types';
import {trackActivity} from '../../services/activityTracker';

// Define entity types
export interface DirectMessageEntity extends DirectMessage {
  id: string;
}

export interface DirectConversationEntity {
  id: string; // threadId
  threadId: string;
  otherUserId: string;
  otherUserName: string;
  otherUserPhotoURL?: string;
  lastMessage: {
    text: string;
    senderId: string;
    sentAt: Date;
    read: {[userId: string]: boolean};
  };
  unreadCount: number;
  updatedAt: Date;
}

// Helper to convert DirectConversation to DirectConversationEntity
const toConversationEntity = (
  conversation: DirectConversation,
): DirectConversationEntity => ({
  id: conversation.threadId,
  threadId: conversation.threadId,
  otherUserId: conversation.otherUserId,
  otherUserName: conversation.otherUserName,
  otherUserPhotoURL: conversation.otherUserPhotoURL,
  lastMessage: conversation.lastMessage,
  unreadCount: conversation.unreadCount,
  updatedAt: conversation.updatedAt,
});

// Create entity adapters
const messagesAdapter = createEntityAdapter<DirectMessageEntity>({
  sortComparer: (a, b) => a.sentAt - b.sentAt,
});

const conversationsAdapter = createEntityAdapter<DirectConversationEntity>({
  sortComparer: (a, b) => {
    return b.updatedAt.getTime() - a.updatedAt.getTime(); // Most recent first
  },
});

// Define state interface
export interface DirectMessagesState {
  messages: ReturnType<typeof messagesAdapter.getInitialState>;
  conversations: ReturnType<typeof conversationsAdapter.getInitialState>;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
  lastFetched: Record<string, number>;
  threadMessageIds: Record<string, string[]>;
  hasMoreConversations: boolean;
  lastConversationThreadId: string | null;
}

// Initial state
const initialState: DirectMessagesState = {
  messages: messagesAdapter.getInitialState(),
  conversations: conversationsAdapter.getInitialState(),
  status: 'idle',
  error: null,
  lastFetched: {},
  threadMessageIds: {},
  hasMoreConversations: false,
  lastConversationThreadId: null,
};

// Constants
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes cache TTL

// Helper function to check if data is stale
const isDataStale = (lastFetched: number | undefined): boolean => {
  if (!lastFetched) return true;
  return Date.now() - lastFetched > CACHE_TTL;
};

// Async thunks
export const initializeThread = createAsyncThunk(
  'directMessages/initializeThread',
  async (
    {userId1, userId2}: {userId1: string; userId2: string},
    {rejectWithValue},
  ) => {
    try {
      const threadId = await DirectMessageModel.initializeOrGetThread(
        userId1,
        userId2,
      );
      return threadId;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to initialize thread');
    }
  },
);

export const fetchRecentMessages = createAsyncThunk(
  'directMessages/fetchRecentMessages',
  async (threadId: string, {getState, rejectWithValue}) => {
    try {
      const messages = await DirectMessageModel.getRecentMessages(threadId);
      return {threadId, messages};
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to fetch messages');
    }
  },
  {
    condition: (threadId, {getState}) => {
      const state = getState() as RootState;
      const lastFetchTime = state.directMessages.lastFetched[threadId];

      // If already loading, don't fetch again
      if (state.directMessages.status === 'loading') return false;

      return isDataStale(lastFetchTime);
    },
  },
);

export const fetchEarlierMessages = createAsyncThunk(
  'directMessages/fetchEarlierMessages',
  async (
    {threadId, beforeMessageId}: {threadId: string; beforeMessageId: string},
    {rejectWithValue},
  ) => {
    try {
      const messages = await DirectMessageModel.getMessagesBefore(
        threadId,
        beforeMessageId,
      );
      return {threadId, messages};
    } catch (error: any) {
      return rejectWithValue(
        error.message || 'Failed to fetch earlier messages',
      );
    }
  },
);

export const sendMessage = createAsyncThunk(
  'directMessages/sendMessage',
  async (
    {
      threadId,
      text,
      replyToMessageId = null,
      attachments,
    }: {
      threadId: string;
      text: string;
      replyToMessageId?: string | null;
      attachments?: {
        type: 'image' | 'file' | 'voice';
        url: string;
        name?: string;
        size?: number;
        duration?: number;
      }[];
    },
    {getState, rejectWithValue},
  ) => {
    try {
      // Get reply info if needed
      let replyTo = null;
      if (replyToMessageId) {
        const state = getState() as RootState;
        const message =
          state.directMessages.messages.entities[replyToMessageId];
        if (message) {
          replyTo = {
            messageId: message.id,
            senderName: message.senderName,
            text: message.text || '',
          };
        }
      }

      const message = await DirectMessageModel.sendMessage(
        threadId,
        text,
        attachments,
        replyTo,
      );

      // Track chat activity for admin inactivity detection
      const currentUser = auth().currentUser;
      if (currentUser) {
        trackActivity(currentUser.uid, 'chat_message');
      }

      return {threadId, message};
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to send message');
    }
  },
);

export const markMessageAsRead = createAsyncThunk(
  'directMessages/markMessageAsRead',
  async (
    {threadId, messageId}: {threadId: string; messageId: string},
    {rejectWithValue},
  ) => {
    try {
      const currentUser = auth().currentUser;
      await DirectMessageModel.markMessageAsRead(threadId, messageId);
      return {threadId, messageId, userId: currentUser?.uid};
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to mark message as read');
    }
  },
);

export const addReaction = createAsyncThunk(
  'directMessages/addReaction',
  async (
    {
      threadId,
      messageId,
      reactionType,
    }: {
      threadId: string;
      messageId: string;
      reactionType: string;
    },
    {rejectWithValue},
  ) => {
    try {
      await DirectMessageModel.addReaction(threadId, messageId, reactionType);
      return {threadId, messageId, reactionType};
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to add reaction');
    }
  },
);

export const removeReaction = createAsyncThunk(
  'directMessages/removeReaction',
  async (
    {
      threadId,
      messageId,
      reactionType,
    }: {
      threadId: string;
      messageId: string;
      reactionType: string;
    },
    {rejectWithValue},
  ) => {
    try {
      await DirectMessageModel.removeReaction(
        threadId,
        messageId,
        reactionType,
      );
      return {threadId, messageId, reactionType};
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to remove reaction');
    }
  },
);

export const deleteMessage = createAsyncThunk(
  'directMessages/deleteMessage',
  async (
    {threadId, messageId}: {threadId: string; messageId: string},
    {rejectWithValue},
  ) => {
    try {
      await DirectMessageModel.deleteMessage(threadId, messageId);
      return {threadId, messageId};
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to delete message');
    }
  },
);

export const fetchConversations = createAsyncThunk(
  'directMessages/fetchConversations',
  async (
    options: {limit?: number; lastThreadId?: string} | undefined,
    {rejectWithValue},
  ) => {
    try {
      const currentUser = auth().currentUser;
      if (!currentUser) {
        throw new Error('User not authenticated');
      }

      const conversations = await DirectMessageModel.getConversationsForUser(
        currentUser.uid,
        options ?? undefined,
      );
      return {
        conversations,
        hasMore: conversations.length === (options?.limit || 20),
      };
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to fetch conversations');
    }
  },
);

// Create the slice
const directMessagesSlice = createSlice({
  name: 'directMessages',
  initialState,
  reducers: {
    addOptimisticMessage: (
      state,
      action: PayloadAction<{
        threadId: string;
        message: DirectMessage & {isOptimistic?: boolean};
      }>,
    ) => {
      const {threadId, message} = action.payload;
      // Add message with optimistic flag
      messagesAdapter.upsertOne(state.messages, message);
      // Add to thread's message IDs
      if (!state.threadMessageIds[threadId]) {
        state.threadMessageIds[threadId] = [];
      }
      if (!state.threadMessageIds[threadId].includes(message.id)) {
        state.threadMessageIds[threadId].push(message.id);
      }
    },
    removeOptimisticMessage: (
      state,
      action: PayloadAction<{threadId: string; messageId: string}>,
    ) => {
      const {threadId, messageId} = action.payload;
      // Remove message
      messagesAdapter.removeOne(state.messages, messageId);
      // Remove from thread's message IDs
      if (state.threadMessageIds[threadId]) {
        state.threadMessageIds[threadId] = state.threadMessageIds[
          threadId
        ].filter(id => id !== messageId);
      }
    },
    clearError: state => {
      state.error = null;
    },
    setMessages: (
      state,
      action: PayloadAction<{threadId: string; messages: DirectMessage[]}>,
    ) => {
      const {threadId, messages} = action.payload;

      // Remove optimistic messages for this thread (they have temp IDs)
      // This handles the race condition where real-time listener fires before sendMessage.fulfilled
      const existingMessageIds = state.threadMessageIds[threadId] || [];
      const optimisticIds = existingMessageIds.filter(id =>
        id.startsWith('temp_'),
      );
      optimisticIds.forEach(id => {
        messagesAdapter.removeOne(state.messages, id);
      });

      // Update messages in the entity adapter
      messagesAdapter.upsertMany(state.messages, messages);

      // Get all non-optimistic messages for this thread and sort by sentAt
      const nonOptimisticIds = existingMessageIds.filter(
        id => !id.startsWith('temp_'),
      );
      const existingMessages = nonOptimisticIds
        .map(id => state.messages.entities[id])
        .filter(Boolean) as DirectMessage[];

      // Merge and sort all messages chronologically
      const allMessages = [...existingMessages, ...messages];
      const uniqueMessages = Array.from(
        new Map(allMessages.map(msg => [msg.id, msg])).values(),
      );
      // Sort by sentAt, with message ID as secondary sort for deterministic ordering
      uniqueMessages.sort((a, b) => {
        const timeDiff = a.sentAt - b.sentAt;
        if (timeDiff !== 0) return timeDiff;
        return a.id.localeCompare(b.id);
      });

      // Update the thread's message IDs in correct order
      state.threadMessageIds[threadId] = uniqueMessages.map(m => m.id);

      // Update last fetched timestamp
      state.lastFetched[threadId] = Date.now();
    },
    updateMessageReadStatus: (
      state,
      action: PayloadAction<{
        threadId: string;
        messageId: string;
        userId: string;
      }>,
    ) => {
      const {messageId, userId} = action.payload;
      const message = state.messages.entities[messageId];
      if (message) {
        messagesAdapter.updateOne(state.messages, {
          id: messageId,
          changes: {
            read: {
              ...message.read,
              [userId]: true,
            },
          },
        });
      }
    },
  },
  extraReducers: builder => {
    builder
      // Initialize thread
      .addCase(initializeThread.pending, state => {
        state.status = 'loading';
      })
      .addCase(initializeThread.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.error = null;
      })
      .addCase(initializeThread.rejected, (state, action) => {
        state.status = 'failed';
        state.error =
          (action.payload as string) || 'Failed to initialize thread';
      })

      // Fetch recent messages
      .addCase(fetchRecentMessages.pending, state => {
        state.status = 'loading';
      })
      .addCase(fetchRecentMessages.fulfilled, (state, action) => {
        state.status = 'succeeded';
        const {threadId, messages} = action.payload;
        messagesAdapter.upsertMany(state.messages, messages);
        state.threadMessageIds[threadId] = messages.map(m => m.id);
        state.lastFetched[threadId] = Date.now();
        state.error = null;
      })
      .addCase(fetchRecentMessages.rejected, (state, action) => {
        state.status = 'failed';
        state.error = (action.payload as string) || 'Failed to fetch messages';
      })

      // Fetch earlier messages
      .addCase(fetchEarlierMessages.pending, state => {
        state.status = 'loading';
      })
      .addCase(fetchEarlierMessages.fulfilled, (state, action) => {
        state.status = 'succeeded';
        const {threadId, messages} = action.payload;
        messagesAdapter.upsertMany(state.messages, messages);
        state.threadMessageIds[threadId] = [
          ...(state.threadMessageIds[threadId] || []),
          ...messages.map(m => m.id),
        ];
        state.error = null;
      })
      .addCase(fetchEarlierMessages.rejected, (state, action) => {
        state.status = 'failed';
        state.error =
          (action.payload as string) || 'Failed to fetch earlier messages';
      })

      // Send message
      .addCase(sendMessage.pending, state => {
        state.status = 'loading';
        // Note: Optimistic message is added via addOptimisticMessage action before this thunk
      })
      .addCase(sendMessage.fulfilled, (state, action) => {
        state.status = 'succeeded';
        const {threadId, message} = action.payload;

        // Remove any optimistic messages for this thread (they have temp IDs)
        const threadMessageIds = state.threadMessageIds[threadId] || [];
        const optimisticMessageIds = threadMessageIds.filter(id =>
          id.startsWith('temp_'),
        );
        optimisticMessageIds.forEach(id => {
          messagesAdapter.removeOne(state.messages, id);
        });
        state.threadMessageIds[threadId] = threadMessageIds.filter(
          id => !id.startsWith('temp_'),
        );

        // Add the real message
        messagesAdapter.upsertOne(state.messages, message);
        if (!state.threadMessageIds[threadId]) {
          state.threadMessageIds[threadId] = [];
        }
        if (!state.threadMessageIds[threadId].includes(message.id)) {
          state.threadMessageIds[threadId].push(message.id);
        }
        state.error = null;
      })
      .addCase(sendMessage.rejected, (state, action) => {
        state.status = 'failed';
        state.error = (action.payload as string) || 'Failed to send message';
      })

      // Mark message as read
      .addCase(markMessageAsRead.fulfilled, (state, action) => {
        const {messageId, userId} = action.payload;
        if (userId && state.messages.entities[messageId]) {
          messagesAdapter.updateOne(state.messages, {
            id: messageId,
            changes: {
              read: {
                ...state.messages.entities[messageId]?.read,
                [userId]: true,
              },
            },
          });
        }
        state.status = 'succeeded';
        state.error = null;
      })
      .addCase(markMessageAsRead.rejected, (state, action) => {
        state.status = 'failed';
        state.error =
          (action.payload as string) || 'Failed to mark message as read';
      })

      // Add reaction
      .addCase(addReaction.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.error = null;
      })
      .addCase(addReaction.rejected, (state, action) => {
        state.status = 'failed';
        state.error = (action.payload as string) || 'Failed to add reaction';
      })

      // Remove reaction
      .addCase(removeReaction.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.error = null;
      })
      .addCase(removeReaction.rejected, (state, action) => {
        state.status = 'failed';
        state.error = (action.payload as string) || 'Failed to remove reaction';
      })

      // Delete message
      .addCase(deleteMessage.fulfilled, (state, action) => {
        const {threadId, messageId} = action.payload;
        messagesAdapter.removeOne(state.messages, messageId);
        if (state.threadMessageIds[threadId]) {
          state.threadMessageIds[threadId] = state.threadMessageIds[
            threadId
          ].filter(id => id !== messageId);
        }
        state.status = 'succeeded';
        state.error = null;
      })
      .addCase(deleteMessage.rejected, (state, action) => {
        state.status = 'failed';
        state.error = (action.payload as string) || 'Failed to delete message';
      })

      // Fetch conversations
      .addCase(fetchConversations.pending, state => {
        state.status = 'loading';
      })
      .addCase(fetchConversations.fulfilled, (state, action) => {
        state.status = 'succeeded';
        const {conversations, hasMore} = action.payload;
        const entities = conversations.map(toConversationEntity);

        // Check if this is a reset (no lastThreadId in options)
        const isReset = !action.meta.arg || !action.meta.arg.lastThreadId;

        // If this is the first page or a reset, replace all conversations
        // Otherwise, append new conversations
        if (isReset || state.lastConversationThreadId === null) {
          conversationsAdapter.setAll(state.conversations, entities);
          // Reset pagination state on first page/reset
          state.lastConversationThreadId = null;
        } else {
          conversationsAdapter.upsertMany(state.conversations, entities);
        }

        state.hasMoreConversations = hasMore;
        if (entities.length > 0) {
          state.lastConversationThreadId =
            entities[entities.length - 1].threadId;
        }
        state.error = null;
      })
      .addCase(fetchConversations.rejected, (state, action) => {
        state.status = 'failed';
        state.error =
          (action.payload as string) || 'Failed to fetch conversations';
      });
  },
});

// Export actions and reducer
export const {
  clearError,
  setMessages,
  updateMessageReadStatus,
  addOptimisticMessage,
  removeOptimisticMessage,
} = directMessagesSlice.actions;

// Selectors
export const selectDirectMessagesStatus = (state: RootState) =>
  state.directMessages.status;
export const selectDirectMessagesError = (state: RootState) =>
  state.directMessages.error;

const messagesSelectors = messagesAdapter.getSelectors<RootState>(
  state => state.directMessages.messages,
);

const conversationsSelectors = conversationsAdapter.getSelectors<RootState>(
  state => state.directMessages.conversations,
);

export const selectMessagesByThread = createSelector(
  [
    messagesSelectors.selectEntities,
    (state: RootState, threadId: string) =>
      state.directMessages.threadMessageIds[threadId] || [],
  ],
  (entities, messageIds) => {
    return messageIds.map(id => entities[id]).filter(Boolean);
  },
);

export const selectAllConversations = conversationsSelectors.selectAll;
export const selectConversationById = conversationsSelectors.selectById;
export const selectHasMoreConversations = (state: RootState) =>
  state.directMessages.hasMoreConversations;
export const selectLastConversationThreadId = (state: RootState) =>
  state.directMessages.lastConversationThreadId;

// Selector for total unread message count across all conversations
export const selectTotalUnreadCount = createSelector(
  [selectAllConversations],
  conversations => {
    return conversations.reduce(
      (total, conversation) => total + (conversation.unreadCount || 0),
      0,
    );
  },
);

export default directMessagesSlice.reducer;
