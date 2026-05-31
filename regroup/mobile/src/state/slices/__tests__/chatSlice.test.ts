// src/state/slices/__tests__/chatSlice.test.ts

// Mock firebase-setup before any imports that depend on it
jest.mock('../../../../firebase-setup', () => ({
  firestore: {
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(),
        set: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      })),
      get: jest.fn(),
      add: jest.fn(),
      where: jest.fn().mockReturnThis(),
    })),
  },
}));

// Mock the message service so async thunks don't touch Firebase
jest.mock('../../../services/message', () => ({
  loadDirectChat: jest.fn(),
  updateConversation: jest.fn(),
  markRead: jest.fn(),
}));

import { configureStore } from '@reduxjs/toolkit';
import chatReducer, {
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
  loadConversation,
  sendDirectMessage,
  markMessagesAsRead,
  selectConversation,
  selectActiveConversation,
  selectActiveConversationId,
  selectRecipient,
  selectSendingMessage,
  selectMessageSent,
  selectChatLoading,
  selectChatError,
  ChatState,
} from '../chatSlice';
import * as messageService from '../../../services/message';
import { Message } from '../../../entities/Message';

/**
 * Build a minimal plain-object Message without triggering the class constructor
 * (which calls Date.now() and generates ids).
 */
const makeMessage = (id = 'msg1', sortKey = 1000): Message =>
  ({
    id,
    _id: id,
    text: 'Hello',
    houseId: 'h1',
    senderId: 'u1',
    senderName: 'Alice',
    recipientId: 'u2',
    read: false,
    sortKey,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    user: { _id: 'u1', name: 'Alice', avatar: '' },
  } as Message);

const makeAdmin = (id = 'a1') =>
  ({
    id,
    firstName: 'Admin',
    lastName: 'User',
    email: 'admin@example.com',
    userId: 'u1',
    houseIds: ['h1'],
    superAdmin: [],
    phoneNumber: '',
    uniqueAdminAttribute: 'admin',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  } as any);

const makeStore = () =>
  configureStore({ reducer: { chat: chatReducer } });

describe('chatSlice', () => {
  const initialState = chatReducer(undefined, { type: '@@INIT' });

  // ---------------------------------------------------------------------------
  // Initial State
  // ---------------------------------------------------------------------------
  describe('Initial State', () => {
    it('returns the correct initial state shape', () => {
      expect(initialState.conversations).toEqual({});
      expect(initialState.activeConversationId).toBeNull();
      expect(initialState.recipient).toBeNull();
      expect(initialState.sendingMessage).toBe(false);
      expect(initialState.messageSent).toBe(false);
      expect(initialState.loading).toBe(false);
      expect(initialState.error).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Synchronous reducers
  // ---------------------------------------------------------------------------
  describe('setActiveConversation', () => {
    it('sets activeConversationId', () => {
      const state = chatReducer(initialState, setActiveConversation('conv-1'));
      expect(state.activeConversationId).toBe('conv-1');
    });

    it('replaces existing activeConversationId', () => {
      const s = { ...initialState, activeConversationId: 'conv-1' };
      const state = chatReducer(s, setActiveConversation('conv-2'));
      expect(state.activeConversationId).toBe('conv-2');
    });
  });

  describe('setRecipient', () => {
    it('sets recipient to the provided admin', () => {
      const admin = makeAdmin('a1');
      const state = chatReducer(initialState, setRecipient(admin));
      expect(state.recipient).not.toBeNull();
      expect((state.recipient as any).id).toBe('a1');
    });
  });

  describe('clearRecipient', () => {
    it('sets recipient to null', () => {
      const admin = makeAdmin('a1');
      const s = { ...initialState, recipient: admin };
      const state = chatReducer(s, clearRecipient());
      expect(state.recipient).toBeNull();
    });

    it('is a no-op when recipient is already null', () => {
      const state = chatReducer(initialState, clearRecipient());
      expect(state.recipient).toBeNull();
    });
  });

  describe('addMessageToConversation', () => {
    it('creates a new conversation array and adds the message', () => {
      const msg = makeMessage('msg1', 1000);
      const state = chatReducer(
        initialState,
        addMessageToConversation({ conversationId: 'conv-1', message: msg }),
      );
      expect(state.conversations['conv-1']).toHaveLength(1);
      expect(state.conversations['conv-1'][0].id).toBe('msg1');
    });

    it('appends to an existing conversation', () => {
      const msg1 = makeMessage('msg1', 1000);
      const s = { ...initialState, conversations: { 'conv-1': [msg1] } };
      const msg2 = makeMessage('msg2', 2000);
      const state = chatReducer(s, addMessageToConversation({ conversationId: 'conv-1', message: msg2 }));
      expect(state.conversations['conv-1']).toHaveLength(2);
    });

    it('sorts messages by sortKey ascending after adding', () => {
      const msg2 = makeMessage('msg2', 2000);
      const s = { ...initialState, conversations: { 'conv-1': [msg2] } };
      const msg1 = makeMessage('msg1', 1000);
      const state = chatReducer(s, addMessageToConversation({ conversationId: 'conv-1', message: msg1 }));
      expect(state.conversations['conv-1'][0].id).toBe('msg1');
      expect(state.conversations['conv-1'][1].id).toBe('msg2');
    });

    it('does not add a duplicate message (same sortKey)', () => {
      const msg = makeMessage('msg1', 1000);
      const s = { ...initialState, conversations: { 'conv-1': [msg] } };
      const state = chatReducer(s, addMessageToConversation({ conversationId: 'conv-1', message: msg }));
      expect(state.conversations['conv-1']).toHaveLength(1);
    });
  });

  describe('updateMessageInConversation', () => {
    it('updates the matching message by id', () => {
      const msg = makeMessage('msg1', 1000);
      const s = { ...initialState, conversations: { 'conv-1': [msg] } };
      const state = chatReducer(
        s,
        updateMessageInConversation({ conversationId: 'conv-1', messageId: 'msg1', updates: { text: 'Updated' } }),
      );
      expect(state.conversations['conv-1'][0].text).toBe('Updated');
    });

    it('does nothing when conversationId is not found', () => {
      const state = chatReducer(
        initialState,
        updateMessageInConversation({ conversationId: 'nonexistent', messageId: 'msg1', updates: { text: 'x' } }),
      );
      expect(state.conversations['nonexistent']).toBeUndefined();
    });

    it('does nothing when messageId is not found', () => {
      const msg = makeMessage('msg1', 1000);
      const s = { ...initialState, conversations: { 'conv-1': [msg] } };
      const state = chatReducer(
        s,
        updateMessageInConversation({ conversationId: 'conv-1', messageId: 'nonexistent', updates: { text: 'x' } }),
      );
      expect(state.conversations['conv-1'][0].text).toBe('Hello');
    });
  });

  describe('clearConversation', () => {
    it('removes the specified conversation', () => {
      const msg = makeMessage('msg1', 1000);
      const s = { ...initialState, conversations: { 'conv-1': [msg], 'conv-2': [msg] } };
      const state = chatReducer(s, clearConversation('conv-1'));
      expect(state.conversations['conv-1']).toBeUndefined();
      expect(state.conversations['conv-2']).toBeDefined();
    });

    it('is a no-op when conversationId does not exist', () => {
      const state = chatReducer(initialState, clearConversation('nonexistent'));
      expect(state.conversations).toEqual({});
    });
  });

  describe('clearAllConversations', () => {
    it('clears all conversations and resets activeConversationId', () => {
      const msg = makeMessage('msg1', 1000);
      const s = {
        ...initialState,
        conversations: { 'conv-1': [msg], 'conv-2': [msg] },
        activeConversationId: 'conv-1',
      };
      const state = chatReducer(s, clearAllConversations());
      expect(state.conversations).toEqual({});
      expect(state.activeConversationId).toBeNull();
    });

    it('is a no-op when conversations is already empty', () => {
      const state = chatReducer(initialState, clearAllConversations());
      expect(state.conversations).toEqual({});
      expect(state.activeConversationId).toBeNull();
    });
  });

  describe('resetMessageSent', () => {
    it('sets messageSent to false', () => {
      const s = { ...initialState, messageSent: true };
      const state = chatReducer(s, resetMessageSent());
      expect(state.messageSent).toBe(false);
    });
  });

  describe('clearError', () => {
    it('clears the error field', () => {
      const s = { ...initialState, error: 'something went wrong' };
      const state = chatReducer(s, clearError());
      expect(state.error).toBeNull();
    });

    it('is a no-op when there is no error', () => {
      const state = chatReducer(initialState, clearError());
      expect(state.error).toBeNull();
    });
  });

  describe('resetChatState', () => {
    it('resets the entire state to initial values', () => {
      const msg = makeMessage('msg1', 1000);
      const dirtyState: ChatState = {
        conversations: { 'conv-1': [msg] },
        activeConversationId: 'conv-1',
        recipient: makeAdmin('a1'),
        sendingMessage: true,
        messageSent: true,
        loading: true,
        error: 'err',
      };
      const state = chatReducer(dirtyState, resetChatState());
      expect(state).toEqual(initialState);
    });
  });

  // ---------------------------------------------------------------------------
  // Async thunks — loadConversation
  // ---------------------------------------------------------------------------
  describe('loadConversation thunk', () => {
    it('sets loading=true on pending', () => {
      const state = chatReducer(initialState, loadConversation.pending('', 'conv-1'));
      expect(state.loading).toBe(true);
      expect(state.error).toBeNull();
    });

    it('stores sorted messages in conversations on fulfilled', () => {
      const msg2 = makeMessage('msg2', 2000);
      const msg1 = makeMessage('msg1', 1000);
      const action = loadConversation.fulfilled({ conversationId: 'conv-1', messages: [msg2, msg1] }, '', 'conv-1');
      const state = chatReducer(initialState, action);
      expect(state.loading).toBe(false);
      expect(state.conversations['conv-1']).toHaveLength(2);
      // Should be sorted by sortKey ascending
      expect(state.conversations['conv-1'][0].id).toBe('msg1');
      expect(state.conversations['conv-1'][1].id).toBe('msg2');
    });

    it('sets error on rejected', () => {
      const action = loadConversation.rejected(new Error('Load failed'), '', 'conv-1');
      const state = chatReducer(initialState, action);
      expect(state.loading).toBe(false);
      expect(state.error).toBe('Load failed');
    });

    it('dispatches loadConversation and populates store via real store', async () => {
      const messages = [makeMessage('msg1', 1000)];
      (messageService.loadDirectChat as jest.Mock).mockResolvedValueOnce(messages);
      const store = makeStore();
      await store.dispatch(loadConversation('conv-1'));
      expect(store.getState().chat.conversations['conv-1']).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Async thunks — sendDirectMessage
  // ---------------------------------------------------------------------------
  describe('sendDirectMessage thunk', () => {
    const arg = {
      conversationId: 'conv-1',
      text: 'Hello',
      senderId: 'u1',
      senderName: 'Alice',
      recipientId: 'u2',
      houseId: 'h1',
    };

    it('sets sendingMessage=true and messageSent=false on pending', () => {
      const state = chatReducer(initialState, sendDirectMessage.pending('', arg));
      expect(state.sendingMessage).toBe(true);
      expect(state.messageSent).toBe(false);
      expect(state.error).toBeNull();
    });

    it('sets messageSent=true and appends message to conversation on fulfilled', () => {
      const msg = makeMessage('msg1', 1000);
      const action = sendDirectMessage.fulfilled({ conversationId: 'conv-1', message: msg }, '', arg);
      const state = chatReducer(initialState, action);
      expect(state.sendingMessage).toBe(false);
      expect(state.messageSent).toBe(true);
      expect(state.conversations['conv-1']).toHaveLength(1);
      expect(state.conversations['conv-1'][0].id).toBe('msg1');
    });

    it('creates a new conversation array if it does not exist on fulfilled', () => {
      const msg = makeMessage('msg1', 1000);
      const action = sendDirectMessage.fulfilled({ conversationId: 'new-conv', message: msg }, '', arg);
      const state = chatReducer(initialState, action);
      expect(state.conversations['new-conv']).toHaveLength(1);
    });

    it('sets error on rejected', () => {
      const action = sendDirectMessage.rejected(new Error('Send failed'), '', arg);
      const state = chatReducer(initialState, action);
      expect(state.sendingMessage).toBe(false);
      expect(state.messageSent).toBe(false);
      expect(state.error).toBe('Send failed');
    });

    it('dispatches sendDirectMessage and updates store via real store', async () => {
      (messageService.updateConversation as jest.Mock).mockResolvedValueOnce(undefined);
      const store = makeStore();
      await store.dispatch(sendDirectMessage(arg));
      expect(store.getState().chat.messageSent).toBe(true);
      expect(store.getState().chat.conversations['conv-1']).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Async thunks — markMessagesAsRead
  // ---------------------------------------------------------------------------
  describe('markMessagesAsRead thunk', () => {
    it('marks specified messages as read on fulfilled', () => {
      const msg1 = makeMessage('msg1', 1000);
      const msg2 = makeMessage('msg2', 2000);
      const s = { ...initialState, conversations: { 'conv-1': [msg1, msg2] } };
      const action = markMessagesAsRead.fulfilled(
        { conversationId: 'conv-1', messageIds: ['msg1'] },
        '',
        { conversationId: 'conv-1', messageIds: ['msg1'] },
      );
      const state = chatReducer(s, action);
      expect(state.conversations['conv-1'][0].read).toBe(true);
      expect(state.conversations['conv-1'][1].read).toBe(false);
    });

    it('does nothing when conversationId is not found on fulfilled', () => {
      const action = markMessagesAsRead.fulfilled(
        { conversationId: 'nonexistent', messageIds: ['msg1'] },
        '',
        { conversationId: 'nonexistent', messageIds: ['msg1'] },
      );
      const state = chatReducer(initialState, action);
      expect(state.conversations['nonexistent']).toBeUndefined();
    });

    it('sets error on rejected', () => {
      const action = markMessagesAsRead.rejected(
        new Error('Mark failed'),
        '',
        { conversationId: 'conv-1', messageIds: ['msg1'] },
      );
      const state = chatReducer(initialState, action);
      expect(state.error).toBe('Mark failed');
    });

    it('dispatches markMessagesAsRead and updates store via real store', async () => {
      (messageService.markRead as jest.Mock).mockResolvedValueOnce(undefined);
      const msg = makeMessage('msg1', 1000);
      const store = configureStore({
        reducer: { chat: chatReducer } as any,
        preloadedState: { chat: { ...initialState, conversations: { 'conv-1': [msg] } } } as any,
      });
      await store.dispatch(markMessagesAsRead({ conversationId: 'conv-1', messageIds: ['msg1'] }));
      expect(store.getState().chat.conversations['conv-1'][0].read).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Selectors
  // ---------------------------------------------------------------------------
  describe('selectors', () => {
    const msg1 = makeMessage('msg1', 1000);
    const msg2 = makeMessage('msg2', 2000);
    const storeState = {
      chat: {
        conversations: {
          'conv-1': [msg1, msg2],
          'conv-2': [msg1],
        },
        activeConversationId: 'conv-1',
        recipient: makeAdmin('a1'),
        sendingMessage: true,
        messageSent: true,
        loading: true,
        error: 'err',
      } as ChatState,
    };

    it('selectConversation returns messages for the given conversationId', () => {
      expect(selectConversation(storeState, 'conv-1')).toHaveLength(2);
    });

    it('selectConversation returns empty array for unknown conversationId', () => {
      expect(selectConversation(storeState, 'unknown')).toEqual([]);
    });

    it('selectActiveConversation returns messages for activeConversationId', () => {
      expect(selectActiveConversation(storeState)).toHaveLength(2);
    });

    it('selectActiveConversation returns empty array when activeConversationId is null', () => {
      const s = { chat: { ...storeState.chat, activeConversationId: null } };
      expect(selectActiveConversation(s)).toEqual([]);
    });

    it('selectActiveConversationId returns activeConversationId', () => {
      expect(selectActiveConversationId(storeState)).toBe('conv-1');
    });

    it('selectRecipient returns recipient', () => {
      expect(selectRecipient(storeState)).not.toBeNull();
      expect((selectRecipient(storeState) as any).id).toBe('a1');
    });

    it('selectSendingMessage returns sendingMessage flag', () => {
      expect(selectSendingMessage(storeState)).toBe(true);
    });

    it('selectMessageSent returns messageSent flag', () => {
      expect(selectMessageSent(storeState)).toBe(true);
    });

    it('selectChatLoading returns loading flag', () => {
      expect(selectChatLoading(storeState)).toBe(true);
    });

    it('selectChatError returns error', () => {
      expect(selectChatError(storeState)).toBe('err');
    });
  });
});
