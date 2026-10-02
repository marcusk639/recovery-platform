/**
 * Direct messages must never cross a user boundary.
 *
 * Conversations and message bodies are the most sensitive data this app holds.
 * Every field of DirectMessagesState belongs to exactly one inbox, so the
 * contract is simpler than the groups list: when the authenticated user
 * changes, none of the previous user's inbox may remain readable — not after
 * the switch, and not for a frame during it.
 */

const mockAuthState: {currentUser: {uid: string} | null} = {currentUser: null};
jest.mock('@react-native-firebase/auth', () => {
  const fn: any = () => ({
    get currentUser() {
      return mockAuthState.currentUser;
    },
  });
  return {__esModule: true, default: fn};
});

jest.mock('../../../models/DirectMessageModel', () => ({
  DirectMessageModel: {},
  generateThreadId: jest.fn((a: string, b: string) => [a, b].sort().join('_')),
}));
jest.mock('../../../services/activityTracker', () => ({trackActivity: jest.fn()}));

import {configureStore} from '@reduxjs/toolkit';
import directMessagesReducer, {
  fetchConversations,
  setMessages,
  selectAllConversations,
  selectMessagesByThread,
  selectTotalUnreadCount,
} from '../directMessagesSlice';
import authReducer, {setUser, signOut} from '../authSlice';
import type {RootState} from '../../types';

const USER_A = 'user-a-uid';
const USER_B = 'user-b-uid';

function buildStore() {
  return configureStore({
    reducer: {auth: authReducer, directMessages: directMessagesReducer},
    middleware: g => g({serializableCheck: false}),
  });
}
type TestStore = ReturnType<typeof buildStore>;

function signInAs(store: TestStore, uid: string | null) {
  mockAuthState.currentUser = uid ? {uid} : null;
  store.dispatch(setUser(uid ? ({uid} as any) : null));
}

function convo(threadId: string, unread = 1) {
  return {
    threadId,
    participants: [USER_A, 'someone-else'],
    lastMessage: 'private text',
    lastMessageAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    unreadCount: unread,
  } as any;
}

/** What the inbox screen would render. */
function renderedThreadIds(store: TestStore): string[] {
  return selectAllConversations(store.getState() as unknown as RootState).map(
    (c: any) => c.threadId ?? c.id,
  );
}

function loadConversations(store: TestStore, reqId: string, convos: any[]) {
  store.dispatch(fetchConversations.pending(reqId, undefined as any));
  store.dispatch(
    fetchConversations.fulfilled(
      {conversations: convos, hasMore: false} as any,
      reqId,
      undefined as any,
    ),
  );
}

beforeEach(() => {
  mockAuthState.currentUser = null;
});

describe('direct messages do not cross a user boundary', () => {
  it("drops the previous user's conversations when a new user signs in", () => {
    const store = buildStore();
    signInAs(store, USER_A);
    loadConversations(store, 'req-a', [convo('thread-1'), convo('thread-2')]);
    expect(renderedThreadIds(store).sort()).toEqual(['thread-1', 'thread-2']);

    signInAs(store, USER_B);

    expect(renderedThreadIds(store)).toEqual([]);
  });

  it('renders an empty inbox after sign-out', () => {
    const store = buildStore();
    signInAs(store, USER_A);
    loadConversations(store, 'req-a', [convo('thread-1')]);

    signInAs(store, null);

    expect(renderedThreadIds(store)).toEqual([]);
  });

  it("does not apply user A's in-flight conversation fetch after B signs in", () => {
    const store = buildStore();
    signInAs(store, USER_A);
    store.dispatch(fetchConversations.pending('req-a', undefined as any));

    signInAs(store, USER_B);
    store.dispatch(
      fetchConversations.fulfilled(
        {conversations: [convo('thread-1')], hasMore: false} as any,
        'req-a',
        undefined as any,
      ),
    );

    expect(renderedThreadIds(store)).toEqual([]);
  });

  it('does not leak the previous inbox through the unread badge', () => {
    const store = buildStore();
    signInAs(store, USER_A);
    loadConversations(store, 'req-a', [convo('thread-1', 4)]);

    signInAs(store, USER_B);

    expect(selectTotalUnreadCount(store.getState() as unknown as RootState)).toBe(0);
  });

  it('does not expose message bodies once nobody is signed in', () => {
    const store = buildStore();
    signInAs(store, USER_A);
    loadConversations(store, 'req-a', [convo('thread-1')]);
    store.dispatch(
      setMessages({
        threadId: 'thread-1',
        messages: [
          {
            id: 'm1',
            threadId: 'thread-1',
            senderId: USER_A,
            text: 'private text',
            createdAt: new Date('2026-01-01T00:00:00Z'),
          },
        ],
      } as any),
    );
    expect(
      selectMessagesByThread(store.getState() as unknown as RootState, 'thread-1'),
    ).toHaveLength(1);

    // The real window: signOut.fulfilled nulls auth.user immediately, while
    // setUser(null) only reaches this slice later via onAuthStateChanged. Do
    // NOT dispatch setUser here — that triggers the reset and would make this
    // test pass without exercising the gap at all.
    store.dispatch(signOut.fulfilled(undefined as any, 'req-signout', undefined as any));

    expect(
      selectMessagesByThread(store.getState() as unknown as RootState, 'thread-1'),
    ).toEqual([]);
  });
});
