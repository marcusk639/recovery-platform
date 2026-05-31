import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { Message } from '../../entities/Message';
import { Guest } from '../../entities/Guest';
import Admin from '../../entities/Admin';
import * as messageService from '../../services/message';

/**
 * Conversation: Array of messages sorted by sortKey
 */
export type Conversation = Message[];

/**
 * Conversations: Map of conversation ID to messages
 */
export interface Conversations {
  [conversationId: string]: Conversation;
}

/**
 * Chat State Interface
 */
export interface ChatState {
  // Conversations
  conversations: Conversations;
  activeConversationId: string | null;
  recipient: Guest | Admin | null;

  // Message sending
  sendingMessage: boolean;
  messageSent: boolean;

  // Loading & errors
  loading: boolean;
  error: string | null;
}

/**
 * Initial State
 */
const initialState: ChatState = {
  conversations: {},
  activeConversationId: null,
  recipient: null,
  sendingMessage: false,
  messageSent: false,
  loading: false,
  error: null,
};

/**
 * Async Thunks
 */

/**
 * Load a conversation's messages
 */
export const loadConversation = createAsyncThunk<
  { conversationId: string; messages: Message[] },
  string
>(
  'chat/loadConversation',
  async (conversationId: string) => {
    const messages = await messageService.loadDirectChat(
      conversationId,
      () => {}, // Empty callback - we handle messages in fulfilled reducer
      undefined
    );
    return { conversationId, messages };
  }
);

/**
 * Send a direct message
 */
export const sendDirectMessage = createAsyncThunk<
  { conversationId: string; message: Message },
  {
    conversationId: string;
    text: string;
    senderId: string;
    senderName: string;
    recipientId: string;
    houseId: string;
  }
>(
  'chat/sendMessage',
  async ({
    conversationId,
    text,
    senderId,
    senderName,
    recipientId,
    houseId,
  }) => {
    const message = new Message(text, senderId, senderName);
    message.recipientId = recipientId;
    message.houseId = houseId;
    message.read = false;
    await messageService.updateConversation(conversationId, [message as any]);
    return { conversationId, message };
  }
);

/**
 * Mark messages as read
 */
export const markMessagesAsRead = createAsyncThunk<
  { conversationId: string; messageIds: string[] },
  { conversationId: string; messageIds: string[] }
>(
  'chat/markAsRead',
  async ({ conversationId, messageIds }) => {
    await Promise.all(
      messageIds.map(messageId =>
        messageService.markRead(conversationId, messageId)
      )
    );
    return { conversationId, messageIds };
  }
);

/**
 * Chat Slice
 */
const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    // Set active conversation
    setActiveConversation: (state, action: PayloadAction<string>) => {
      state.activeConversationId = action.payload;
    },

    // Set recipient
    setRecipient: (state, action: PayloadAction<Guest | Admin>) => {
      state.recipient = action.payload;
    },

    // Clear recipient
    clearRecipient: (state) => {
      state.recipient = null;
    },

    // Add message to conversation (optimistic update or real-time listener)
    addMessageToConversation: (
      state,
      action: PayloadAction<{ conversationId: string; message: Message }>
    ) => {
      const { conversationId, message } = action.payload;

      if (!state.conversations[conversationId]) {
        state.conversations[conversationId] = [];
      }

      // Check if message already exists (by sortKey)
      const exists = state.conversations[conversationId].some(
        (m) => m.sortKey === message.sortKey
      );

      if (!exists) {
        state.conversations[conversationId].push(message);
        // Sort by sortKey ascending (oldest first)
        state.conversations[conversationId].sort((a, b) => Number(a.sortKey) - Number(b.sortKey));
      }
    },

    // Update message in conversation
    updateMessageInConversation: (
      state,
      action: PayloadAction<{ conversationId: string; messageId: string; updates: Partial<Message> }>
    ) => {
      const { conversationId, messageId, updates } = action.payload;
      const conversation = state.conversations[conversationId];

      if (conversation) {
        const index = conversation.findIndex((m) => m.id === messageId);
        if (index !== -1) {
          conversation[index] = { ...conversation[index], ...updates };
        }
      }
    },

    // Clear conversation
    clearConversation: (state, action: PayloadAction<string>) => {
      delete state.conversations[action.payload];
    },

    // Clear all conversations
    clearAllConversations: (state) => {
      state.conversations = {};
      state.activeConversationId = null;
    },

    // Reset message sent flag
    resetMessageSent: (state) => {
      state.messageSent = false;
    },

    // Clear error
    clearError: (state) => {
      state.error = null;
    },

    // Reset chat state
    resetChatState: () => initialState,
  },
  extraReducers: (builder) => {
    // Load Conversation
    builder
      .addCase(loadConversation.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loadConversation.fulfilled, (state, action) => {
        state.loading = false;
        const { conversationId, messages } = action.payload;

        // Replace conversation with loaded messages
        state.conversations[conversationId] = messages.sort(
          (a: Message, b: Message) => Number(a.sortKey) - Number(b.sortKey)
        );
      })
      .addCase(loadConversation.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to load conversation';
      });

    // Send Direct Message
    builder
      .addCase(sendDirectMessage.pending, (state) => {
        state.sendingMessage = true;
        state.messageSent = false;
        state.error = null;
      })
      .addCase(sendDirectMessage.fulfilled, (state, action) => {
        state.sendingMessage = false;
        state.messageSent = true;
        const { conversationId, message } = action.payload;

        // Add message to conversation
        if (!state.conversations[conversationId]) {
          state.conversations[conversationId] = [];
        }

        state.conversations[conversationId].push(message);
        state.conversations[conversationId].sort(
          (a, b) => Number(a.sortKey) - Number(b.sortKey)
        );
      })
      .addCase(sendDirectMessage.rejected, (state, action) => {
        state.sendingMessage = false;
        state.messageSent = false;
        state.error = action.error.message || 'Failed to send message';
      });

    // Mark Messages as Read
    builder
      .addCase(markMessagesAsRead.fulfilled, (state, action) => {
        const { conversationId, messageIds } = action.payload;
        const conversation = state.conversations[conversationId];

        if (conversation) {
          conversation.forEach((message) => {
            if (messageIds.includes(message.id)) {
              message.read = true;
            }
          });
        }
      })
      .addCase(markMessagesAsRead.rejected, (state, action) => {
        state.error = action.error.message || 'Failed to mark messages as read';
      });

  },
});

/**
 * Actions
 */
export const {
  setActiveConversation,
  setRecipient,
  clearRecipient,
  addMessageToConversation,
  updateMessageInConversation,
  clearConversation,
  clearAllConversations,
  resetMessageSent,
  clearError,
  resetChatState,
} = chatSlice.actions;

/**
 * Selectors
 */
export const selectConversation = (state: { chat: ChatState }, conversationId: string) =>
  state.chat.conversations[conversationId] || [];
export const selectActiveConversation = (state: { chat: ChatState }) =>
  state.chat.activeConversationId
    ? state.chat.conversations[state.chat.activeConversationId] || []
    : [];
export const selectActiveConversationId = (state: { chat: ChatState }) =>
  state.chat.activeConversationId;
export const selectRecipient = (state: { chat: ChatState }) => state.chat.recipient;
export const selectSendingMessage = (state: { chat: ChatState }) => state.chat.sendingMessage;
export const selectMessageSent = (state: { chat: ChatState }) => state.chat.messageSent;
export const selectChatLoading = (state: { chat: ChatState }) => state.chat.loading;
export const selectChatError = (state: { chat: ChatState }) => state.chat.error;

/**
 * Reducer
 */
export default chatSlice.reducer;
