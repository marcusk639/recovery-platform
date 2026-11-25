/**
 * message.tsx against the normalized Firebase operation log.
 *
 * Characterization for the React Native 0.88 upgrade (plan Task 10 Step 1).
 * This file stays byte-identical through the Task 10 migration (group 10d): a
 * mapping mistake in the rewrite fails here instead of being copied into an
 * edited expectation. Assertions are on outcomes and log entries only, never
 * on mock call chains or snapshot shapes.
 */
jest.mock('../../../firebase-setup', () => require('../../../__mocks__/firebase-modular/setup'));
jest.mock('@react-native-firebase/firestore', () =>
  require('../../../__mocks__/firebase-modular/firestore'),
);
jest.mock('@react-native-firebase/functions', () =>
  require('../../../__mocks__/firebase-modular/functions'),
);
jest.mock('../../util/logging', () => ({ logException: jest.fn() }));

import {
  failNext,
  getOpLog,
  readDoc,
  resetOpLog,
  seedDoc,
  seedQuery,
} from '../../../__mocks__/firebase-modular/log';
import {
  loadChat,
  loadDirectChat,
  markRead,
  sendMessageToHouseChat,
  subscribeToDirectChat,
  subscribeToHouseChat,
  unsubscribeFromHouseChat,
  updateConversation,
} from '../message';
import { Message } from '../../entities/Message';
import { DirectMessage } from '../../entities/DirectConversation';
import { logException } from '../../util/logging';
import { setCurrentUser } from '../../../__mocks__/firebase-modular/auth';

const HOUSE_CHAT = 'houses/h1/chat';
const DM_CHAT = 'direct-messages/u1u2/chat';
const PAGE = [
  ['orderBy', 'sortKey', 'desc'],
  ['limit', 20],
];
// The rules let only a message's sender or recipient read it, so a direct-chat
// query must filter to the signed-in user's messages (#183 item 2).
const ME = 'u1';
const DM_PAGE = [
  [
    'or',
    ['where', 'senderId', '==', ME],
    ['where', 'recipientId', '==', ME],
  ],
  ...PAGE,
];

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const msg = (fields: Record<string, unknown>) => fields as unknown as Message;

beforeEach(() => {
  resetOpLog();
  setCurrentUser({ uid: ME });
});

describe('sendMessageToHouseChat', () => {
  it('sets one chat doc per message and reports each as fulfilled', async () => {
    const results = await sendMessageToHouseChat('h1', [
      msg({ id: 'm1', text: 'hi' }),
      msg({ text: 'yo' }),
    ]);

    expect(results).toEqual([
      { status: 'fulfilled', value: { id: 'm1', text: 'hi' } },
      { status: 'fulfilled', value: { id: 'auto-1', text: 'yo' } },
    ]);
    expect(getOpLog()).toEqual([
      { op: 'set', path: `${HOUSE_CHAT}/m1`, data: { id: 'm1', text: 'hi' } },
      { op: 'set', path: `${HOUSE_CHAT}/auto-1`, data: { id: 'auto-1', text: 'yo' } },
    ]);
  });

  it('logs a failed write without throwing and keeps the others', async () => {
    const denied = new Error('permission-denied');
    failNext('set', denied, `${HOUSE_CHAT}/m1`);

    const results = await sendMessageToHouseChat('h1', [
      msg({ id: 'm1', text: 'hi' }),
      msg({ id: 'm2', text: 'yo' }),
    ]);

    expect(results).toEqual([
      { status: 'rejected', reason: denied },
      { status: 'fulfilled', value: { id: 'm2', text: 'yo' } },
    ]);
    expect(logException).toHaveBeenCalledWith(denied);
    expect(readDoc(`${HOUSE_CHAT}/m2`)).toEqual({ id: 'm2', text: 'yo' });
  });
});

describe('listeners', () => {
  it('subscribeToHouseChat listens to the latest 20 by sortKey and hands over messages', async () => {
    seedQuery(HOUSE_CHAT, [
      { id: 'm1', text: 'a', sortKey: 1 },
      { id: 'm2', text: 'b', sortKey: 2 },
    ]);
    const handler = jest.fn();

    const unsubscribe = subscribeToHouseChat('h1', handler);
    await flush();

    // The house-chat handler gets no chat id (an explicit undefined second arg).
    expect(handler).toHaveBeenCalledWith(
      [
        { id: 'm2', text: 'b', sortKey: 2 },
        { id: 'm1', text: 'a', sortKey: 1 },
      ],
      undefined,
    );
    expect(getOpLog()).toEqual([{ op: 'listen', path: HOUSE_CHAT, constraints: PAGE }]);
    unsubscribeFromHouseChat(unsubscribe);
  });

  it('subscribeToHouseChat stops delivering once unsubscribed', async () => {
    const handler = jest.fn();

    unsubscribeFromHouseChat(subscribeToHouseChat('h1', handler));
    await flush();

    expect(handler).not.toHaveBeenCalled();
  });

  it('subscribeToHouseChat routes a listener error to logException', async () => {
    const denied = new Error('permission-denied');
    failNext('listen', denied, HOUSE_CHAT);
    const handler = jest.fn();

    subscribeToHouseChat('h1', handler);
    await flush();

    expect(handler).not.toHaveBeenCalled();
    expect(logException).toHaveBeenCalledWith(denied);
  });

  it('subscribeToDirectChat listens on the sorted-id chat and passes the chat id', async () => {
    seedQuery(DM_CHAT, [{ id: 'm1', text: 'a', sortKey: 1, senderId: ME }]);
    const handler = jest.fn();

    subscribeToDirectChat(['u2', 'u1'], handler);
    await flush();

    expect(handler).toHaveBeenCalledWith(
      [{ id: 'm1', text: 'a', sortKey: 1, senderId: ME }],
      'u1u2',
    );
    expect(getOpLog()).toEqual([{ op: 'listen', path: DM_CHAT, constraints: DM_PAGE }]);
  });

  it('subscribeToDirectChat does not listen when nobody is signed in', () => {
    setCurrentUser(null);

    const unsubscribe = subscribeToDirectChat(['u1', 'u2'], jest.fn());

    expect(getOpLog()).toEqual([]);
    expect(() => unsubscribe()).not.toThrow();
  });

  it('subscribeToDirectChat routes a listener error to logException', async () => {
    const denied = new Error('permission-denied');
    failNext('listen', denied, DM_CHAT);

    subscribeToDirectChat(['u1', 'u2'], jest.fn());
    await flush();

    expect(logException).toHaveBeenCalledWith(denied);
  });
});

describe('loadChat', () => {
  it('reads the first page without a cursor', async () => {
    seedQuery(HOUSE_CHAT, [{ id: 'm1', text: 'a', sortKey: 1 }]);
    const handler = jest.fn();

    await loadChat('h1', handler);

    expect(handler).toHaveBeenCalledWith([{ id: 'm1', text: 'a', sortKey: 1 }]);
    expect(getOpLog()).toEqual([{ op: 'getDocs', path: HOUSE_CHAT, constraints: PAGE }]);
  });

  it('reads the cursor doc, then the page after it', async () => {
    seedQuery(HOUSE_CHAT, [
      { id: 'm1', sortKey: 1 },
      { id: 'm2', sortKey: 2 },
      { id: 'm3', sortKey: 3 },
    ]);
    const handler = jest.fn();

    await loadChat('h1', handler, 'm2');

    expect(handler).toHaveBeenCalledWith([{ id: 'm1', sortKey: 1 }]);
    expect(getOpLog()).toEqual([
      { op: 'get', path: `${HOUSE_CHAT}/m2` },
      {
        op: 'getDocs',
        path: HOUSE_CHAT,
        constraints: [...PAGE, ['startAfter', { __snap: `${HOUSE_CHAT}/m2` }]],
      },
    ]);
  });

  it('logs and rethrows a generic error when the read fails', async () => {
    const error = new Error('unavailable');
    failNext('getDocs', error, HOUSE_CHAT);

    await expect(loadChat('h1', jest.fn())).rejects.toThrow('Failed to load chat history');
    expect(logException).toHaveBeenCalledWith(error);
  });
});

describe('loadDirectChat', () => {
  it('returns the first page and tells the handler it is the initial load', async () => {
    seedQuery(DM_CHAT, [{ id: 'm1', text: 'a', sortKey: 1, recipientId: ME }]);
    const handler = jest.fn();

    expect(await loadDirectChat('u1u2', handler)).toEqual([
      { id: 'm1', text: 'a', sortKey: 1, recipientId: ME },
    ]);
    expect(handler).toHaveBeenCalledWith(
      [{ id: 'm1', text: 'a', sortKey: 1, recipientId: ME }],
      'u1u2',
      true,
    );
    expect(getOpLog()).toEqual([{ op: 'getDocs', path: DM_CHAT, constraints: DM_PAGE }]);
  });

  it("reads only the messages the signed-in user sent or received", async () => {
    seedQuery(DM_CHAT, [
      { id: 'sent', sortKey: 3, senderId: ME, recipientId: 'u2' },
      { id: 'received', sortKey: 2, senderId: 'u2', recipientId: ME },
      { id: 'other', sortKey: 1, senderId: 'u3', recipientId: 'u2' },
    ]);

    const messages = await loadDirectChat('u1u2', jest.fn());

    expect(messages.map((m) => m.id)).toEqual(['sent', 'received']);
  });

  it('refuses to load when nobody is signed in', async () => {
    setCurrentUser(null);

    await expect(loadDirectChat('u1u2', jest.fn())).rejects.toThrow('Failed to load direct chat');
    expect(getOpLog()).toEqual([]);
  });

  it('pages after the cursor doc and flags the load as not initial', async () => {
    seedQuery(DM_CHAT, [
      { id: 'm1', sortKey: 1, senderId: ME },
      { id: 'm2', sortKey: 2, senderId: ME },
    ]);
    const handler = jest.fn();

    expect(await loadDirectChat('u1u2', handler, 'm2')).toEqual([
      { id: 'm1', sortKey: 1, senderId: ME },
    ]);
    expect(handler).toHaveBeenCalledWith([{ id: 'm1', sortKey: 1, senderId: ME }], 'u1u2', false);
    expect(getOpLog()).toEqual([
      { op: 'get', path: `${DM_CHAT}/m2` },
      {
        op: 'getDocs',
        path: DM_CHAT,
        constraints: [...DM_PAGE, ['startAfter', { __snap: `${DM_CHAT}/m2` }]],
      },
    ]);
  });

  it('wraps a failed cursor read', async () => {
    failNext('get', new Error('unavailable'), `${DM_CHAT}/m2`);
    await expect(loadDirectChat('u1u2', jest.fn(), 'm2')).rejects.toThrow(
      'Failed to load direct chat',
    );
  });
});

describe('direct-message writes', () => {
  it('markRead updates the message with read: true', async () => {
    seedDoc(`${DM_CHAT}/m1`, { text: 'a' });

    await markRead('u1u2', 'm1');

    expect(getOpLog()).toEqual([{ op: 'update', path: `${DM_CHAT}/m1`, data: { read: true } }]);
    expect(readDoc(`${DM_CHAT}/m1`)).toEqual({ text: 'a', read: true });
  });

  it('markRead wraps a failed update', async () => {
    await expect(markRead('u1u2', 'missing')).rejects.toThrow('Failed to mark message as read');
    expect(logException).toHaveBeenCalled();
  });

  it('updateConversation sets one chat doc per message', async () => {
    await updateConversation('u1u2', [
      { id: 'm1', text: 'a' } as unknown as DirectMessage,
      { text: 'b' } as unknown as DirectMessage,
    ]);

    expect(getOpLog()).toEqual([
      { op: 'set', path: `${DM_CHAT}/m1`, data: { id: 'm1', text: 'a' } },
      { op: 'set', path: `${DM_CHAT}/auto-1`, data: { id: 'auto-1', text: 'b' } },
    ]);
  });

  it('updateConversation fails as a whole when one write fails', async () => {
    failNext('set', new Error('permission-denied'), `${DM_CHAT}/m1`);

    await expect(
      updateConversation('u1u2', [{ id: 'm1', text: 'a' } as unknown as DirectMessage]),
    ).rejects.toThrow('Failed to send direct messages');
  });
});
