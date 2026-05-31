import {
  createSlice,
  createAsyncThunk,
  PayloadAction,
  createEntityAdapter,
  createSelector,
} from '@reduxjs/toolkit';
import auth from '@react-native-firebase/auth';
import {RootState} from '../types';
import {ChatModel, GroupChat, ChatMessage} from '../../models/ChatModel';
import {trackActivity} from '../../services/activityTracker';

// Define entity types
export interface ChatMessageEntity extends ChatMessage {
  id: string;
}

export interface GroupChatEntity extends GroupChat {
  id: string;
}

// Create entity adapters
const toMs = (v: any): number => {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return new Date(v).getTime();
  if (v?.toDate) return v.toDate().getTime();
  return new Date(v).getTime();
};

const messagesAdapter = createEntityAdapter<ChatMessageEntity>({
  sortComparer: (a, b) => toMs(a.sentAt) - toMs(b.sentAt),
});

const chatsAdapter = createEntityAdapter<GroupChatEntity>();

// Define state interface
export interface ChatState {
  messages: ReturnType<typeof messagesAdapter.getInitialState>;
  chats: ReturnType<typeof chatsAdapter.getInitialState>;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
  lastFetched: Record<string, number>;
  groupMessageIds: Record<string, string[]>;
  unreadCounts: Record<string, number>;
  unreadCountsLoading: boolean;
}

// Initial state
const initialState: ChatState = {
  messages: messagesAdapter.getInitialState(),
  chats: chatsAdapter.getInitialState(),
  status: 'idle',
  error: null,
  lastFetched: {},
  groupMessageIds: {},
  unreadCounts: {},
  unreadCountsLoading: false,
};

// Constants
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes cache TTL

// Helper function to check if data is stale
const isDataStale = (lastFetched: number | undefined): boolean => {
  if (!lastFetched) return true;
  return Date.now() - lastFetched > CACHE_TTL;
};

// Async thunks
export const initializeGroupChat = createAsyncThunk(
  'chat/initializeGroupChat',
  async (groupId: string, {rejectWithValue}) => {
    try {
      const chatId = await ChatModel.initializeGroupChat(groupId);
      return chatId;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to initialize chat');
    }
  },
);

export const fetchRecentMessages = createAsyncThunk(
  'chat/fetchRecentMessages',
  async (groupId: string, {getState, rejectWithValue}) => {
    try {
      const messages = await ChatModel.getRecentMessages(groupId);
      return {groupId, messages};
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to fetch messages');
    }
  },
  {
    condition: (groupId, {getState}) => {
      const state = getState() as RootState;
      const lastFetchTime = state.chat.lastFetched[groupId];

      // If already loading, don't fetch again
      if (state.chat.status === 'loading') return false;

      return isDataStale(lastFetchTime);
    },
  },
);

export const fetchEarlierMessages = createAsyncThunk(
  'chat/fetchEarlierMessages',
  async (
    {groupId, beforeMessageId}: {groupId: string; beforeMessageId: string},
    {rejectWithValue},
  ) => {
    try {
      const messages = await ChatModel.getMessagesBefore(
        groupId,
        beforeMessageId,
      );
      return {groupId, messages};
    } catch (error: any) {
      return rejectWithValue(
        error.message || 'Failed to fetch earlier messages',
      );
    }
  },
);

export const sendMessage = createAsyncThunk(
  'chat/sendMessage',
  async (
    {
      groupId,
      text,
      replyToMessageId = null,
      isSystemMessage = false,
      attachments,
      mentionedUserIds,
    }: {
      groupId: string;
      text: string;
      replyToMessageId?: string | null;
      isSystemMessage?: boolean;
      attachments?: {
        type: 'image' | 'file' | 'voice';
        url: string;
        name?: string;
        size?: number;
        duration?: number;
      }[];
      mentionedUserIds?: string[];
    },
    {getState, rejectWithValue},
  ) => {
    try {
      // Get reply message data from state if replying
      let replyTo = null;
      if (replyToMessageId) {
        const state = getState() as RootState;
        const replyMessage = state.chat.messages.entities[replyToMessageId];
        if (replyMessage) {
          replyTo = {
            messageId: replyMessage.id,
            senderName: replyMessage.senderName,
            text: replyMessage.text?.substring(0, 100) || '',
          };
        }
      }

      const message = await ChatModel.sendMessage(
        groupId,
        text,
        attachments,
        replyTo,
        isSystemMessage,
        mentionedUserIds,
      );

      // Track chat activity for admin inactivity detection
      const currentUser = auth().currentUser;
      if (currentUser) {
        trackActivity(currentUser.uid, 'chat_message', groupId);
      }

      return {groupId, message};
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to send message');
    }
  },
);

export const addReaction = createAsyncThunk(
  'chat/addReaction',
  async (
    {
      groupId,
      messageId,
      reactionType,
    }: {
      groupId: string;
      messageId: string;
      reactionType: string;
    },
    {rejectWithValue},
  ) => {
    try {
      await ChatModel.addReaction(groupId, messageId, reactionType);
      return {groupId, messageId, reactionType};
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to add reaction');
    }
  },
);

export const markMessageAsRead = createAsyncThunk(
  'chat/markMessageAsRead',
  async (
    {
      groupId,
      messageId,
    }: {
      groupId: string;
      messageId: string;
    },
    {rejectWithValue},
  ) => {
    try {
      const currentUser = auth().currentUser;
      await ChatModel.markMessageAsRead(groupId, messageId);
      return {groupId, messageId, userId: currentUser?.uid};
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to mark message as read');
    }
  },
);

export const deleteMessage = createAsyncThunk(
  'chat/deleteMessage',
  async (
    {
      groupId,
      messageId,
    }: {
      groupId: string;
      messageId: string;
    },
    {rejectWithValue},
  ) => {
    try {
      await ChatModel.deleteMessage(groupId, messageId);
      return {groupId, messageId};
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to delete message');
    }
  },
);

export const fetchUnreadCount = createAsyncThunk(
  'chat/fetchUnreadCount',
  async (groupId: string, {rejectWithValue}) => {
    try {
      const currentUser = auth().currentUser;
      if (!currentUser) {
        throw new Error('Not authenticated');
      }
      const count = await ChatModel.getUnreadCount(groupId, currentUser.uid);
      return {groupId, count};
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  },
);

export const markChatAsRead = createAsyncThunk(
  'chat/markAsRead',
  async (
    {groupId, lastMessageId}: {groupId: string; lastMessageId?: string},
    {rejectWithValue},
  ) => {
    try {
      await ChatModel.markGroupChatAsRead(groupId, lastMessageId);
      return {groupId};
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  },
);

export const fetchAllUnreadCounts = createAsyncThunk(
  'chat/fetchAllUnreadCounts',
  async (groupIds: string[], {rejectWithValue}) => {
    try {
      const currentUser = auth().currentUser;
      if (!currentUser) {
        return [];
      }
      const results = await Promise.all(
        groupIds.map(async groupId => {
          const count = await ChatModel.getUnreadCount(
            groupId,
            currentUser.uid,
          );
          return {groupId, count};
        }),
      );
      return results;
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  },
);

// Create the slice
const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    clearChatError: state => {
      state.error = null;
    },
    incrementUnreadCount: (state, action: PayloadAction<string>) => {
      const groupId = action.payload;
      state.unreadCounts[groupId] = (state.unreadCounts[groupId] || 0) + 1;
    },
    addOptimisticMessage: (
      state,
      action: PayloadAction<{
        groupId: string;
        message: ChatMessage & {isOptimistic?: boolean};
      }>,
    ) => {
      const {groupId, message} = action.payload;
      // Add message with optimistic flag
      messagesAdapter.upsertOne(state.messages, message);
      // Add to group's message IDs
      if (!state.groupMessageIds[groupId]) {
        state.groupMessageIds[groupId] = [];
      }
      if (!state.groupMessageIds[groupId].includes(message.id)) {
        state.groupMessageIds[groupId].push(message.id);
      }
    },
    removeOptimisticMessage: (
      state,
      action: PayloadAction<{groupId: string; messageId: string}>,
    ) => {
      const {groupId, messageId} = action.payload;
      // Remove message
      messagesAdapter.removeOne(state.messages, messageId);
      // Remove from group's message IDs
      if (state.groupMessageIds[groupId]) {
        state.groupMessageIds[groupId] = state.groupMessageIds[groupId].filter(
          id => id !== messageId,
        );
      }
    },
    setMessages: (
      state,
      action: PayloadAction<{groupId: string; messages: ChatMessage[]}>,
    ) => {
      const {groupId, messages} = action.payload;

      // Remove optimistic messages for this group (they have temp IDs)
      const existingMessageIds = state.groupMessageIds[groupId] || [];
      const optimisticIds = existingMessageIds.filter(id =>
        id.startsWith('temp_'),
      );
      optimisticIds.forEach(id => {
        messagesAdapter.removeOne(state.messages, id);
      });

      // Update messages in the entity adapter
      messagesAdapter.upsertMany(state.messages, messages);

      // Get non-optimistic existing message IDs
      const nonOptimisticIds = existingMessageIds.filter(
        id => !id.startsWith('temp_'),
      );

      // Get new message IDs that aren't already in the list
      const newMessageIds = messages
        .map(m => m.id)
        .filter(id => !nonOptimisticIds.includes(id));

      // Update the group's message IDs, maintaining order
      state.groupMessageIds[groupId] = [...nonOptimisticIds, ...newMessageIds];

      // Update last fetched timestamp
      state.lastFetched[groupId] = Date.now();
    },
  },
  extraReducers: builder => {
    builder
      // Initialize group chat
      .addCase(initializeGroupChat.pending, state => {
        state.status = 'loading';
      })
      .addCase(initializeGroupChat.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.error = null;
      })
      .addCase(initializeGroupChat.rejected, (state, action) => {
        state.status = 'failed';
        state.error = (action.payload as string) || 'Failed to initialize chat';
      })

      // Fetch recent messages
      .addCase(fetchRecentMessages.pending, state => {
        state.status = 'loading';
      })
      .addCase(fetchRecentMessages.fulfilled, (state, action) => {
        state.status = 'succeeded';
        const {groupId, messages} = action.payload;
        messagesAdapter.upsertMany(state.messages, messages);
        state.groupMessageIds[groupId] = messages.map(m => m.id);
        state.lastFetched[groupId] = Date.now();
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
        const {groupId, messages} = action.payload;
        messagesAdapter.upsertMany(state.messages, messages);
        state.groupMessageIds[groupId] = [
          ...(state.groupMessageIds[groupId] || []),
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
        // Note: Optimistic message is added via addOptimisticMessage action
      })
      .addCase(sendMessage.fulfilled, (state, action) => {
        state.status = 'succeeded';
        const {groupId, message} = action.payload;

        // Remove any optimistic messages for this group (they have temp IDs)
        const groupMessageIds = state.groupMessageIds[groupId] || [];
        const optimisticMessageIds = groupMessageIds.filter(id =>
          id.startsWith('temp_'),
        );
        optimisticMessageIds.forEach(id => {
          messagesAdapter.removeOne(state.messages, id);
        });
        state.groupMessageIds[groupId] = groupMessageIds.filter(
          id => !id.startsWith('temp_'),
        );

        // Add the real message
        messagesAdapter.upsertOne(state.messages, message);
        if (!state.groupMessageIds[groupId]) {
          state.groupMessageIds[groupId] = [];
        }
        if (!state.groupMessageIds[groupId].includes(message.id)) {
          state.groupMessageIds[groupId].push(message.id);
        }
        state.error = null;
      })
      .addCase(sendMessage.rejected, (state, action) => {
        state.status = 'failed';
        state.error = (action.payload as string) || 'Failed to send message';
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

      // Mark message as read
      .addCase(markMessageAsRead.fulfilled, (state, action) => {
        const {messageId, userId} = action.payload;
        if (userId && state.messages.entities[messageId]) {
          messagesAdapter.updateOne(state.messages, {
            id: messageId,
            changes: {
              readBy: {
                ...state.messages.entities[messageId]?.readBy,
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

      // Delete message
      .addCase(deleteMessage.fulfilled, (state, action) => {
        const {groupId, messageId} = action.payload;
        messagesAdapter.removeOne(state.messages, messageId);
        if (state.groupMessageIds[groupId]) {
          state.groupMessageIds[groupId] = state.groupMessageIds[
            groupId
          ].filter(id => id !== messageId);
        }
        state.status = 'succeeded';
        state.error = null;
      })
      .addCase(deleteMessage.rejected, (state, action) => {
        state.status = 'failed';
        state.error = (action.payload as string) || 'Failed to delete message';
      })

      // Unread counts
      .addCase(fetchUnreadCount.fulfilled, (state, action) => {
        const {groupId, count} = action.payload;
        state.unreadCounts[groupId] = count;
      })
      .addCase(markChatAsRead.fulfilled, (state, action) => {
        const {groupId} = action.payload;
        state.unreadCounts[groupId] = 0;
      })
      .addCase(fetchAllUnreadCounts.pending, state => {
        state.unreadCountsLoading = true;
      })
      .addCase(fetchAllUnreadCounts.fulfilled, (state, action) => {
        state.unreadCountsLoading = false;
        action.payload.forEach(({groupId, count}) => {
          state.unreadCounts[groupId] = count;
        });
      })
      .addCase(fetchAllUnreadCounts.rejected, state => {
        state.unreadCountsLoading = false;
      });
  },
});

// Memoized selectors
const messagesSelectors = messagesAdapter.getSelectors<RootState>(
  state => state.chat.messages,
);

const chatsSelectors = chatsAdapter.getSelectors<RootState>(
  state => state.chat.chats,
);

// Export actions and reducer
export const {
  clearChatError,
  setMessages,
  addOptimisticMessage,
  removeOptimisticMessage,
  incrementUnreadCount,
} = chatSlice.actions;

// Selectors
export const selectChatStatus = (state: RootState) => state.chat.status;
export const selectChatError = (state: RootState) => state.chat.error;
export const selectUnreadCount = (state: RootState, groupId: string) =>
  state.chat.unreadCounts[groupId] || 0;
export const selectTotalUnreadCount = (state: RootState) =>
  Object.values(state.chat.unreadCounts).reduce((sum, count) => sum + count, 0);

export const selectMessagesByGroup = createSelector(
  [
    messagesSelectors.selectEntities,
    (state: RootState, groupId: string) =>
      state.chat.groupMessageIds[groupId] || [],
  ],
  (entities, messageIds) => {
    return messageIds.map(id => entities[id]).filter(Boolean);
  },
);

export default chatSlice.reducer;
