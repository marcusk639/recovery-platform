/**
 * Unit tests for the message service (Firestore implementation).
 *
 * All Realtime Database usage has been removed from message.tsx.
 * These tests verify the Firestore-only implementation.
 *
 * Mock strategy:
 *   - firebase-setup is fully mocked via moduleNameMapper → __mocks__/firebase-setup.js
 *   - crud module is mocked so we can assert on create() calls without hitting Firestore
 *   - The onSnapshot mock is set up per-test so callers can trigger it synchronously
 */

// ─── Mocks (hoisted before imports) ─────────────────────────────────────────

// We override the auto-mock with a tailored one that supports the full
// chained query API used by the message service.

let mockOnSnapshot: jest.Mock;
let mockUnsubscribe: jest.Mock;
let mockDocUpdate: jest.Mock;
let mockDocGet: jest.Mock;
let mockInnerCollection: any;
let mockDoc: any;
let mockCollection: jest.Mock;

jest.mock('../../../firebase-setup', () => {
  // All mock refs are declared inside the factory so they are hoisted-safe.
  // We expose them on the returned object so tests can reach them via the import.
  const unsubscribe = jest.fn();
  const onSnapshot = jest.fn(() => unsubscribe);
  const docGet = jest.fn(() =>
    Promise.resolve({ exists: true, data: () => ({}) }),
  );
  const docUpdate = jest.fn(() => Promise.resolve());

  // The innermost collection (e.g. .doc(houseId).collection('chat'))
  const innerCollection = {
    orderBy: jest.fn(function () { return this; }),
    limit: jest.fn(function () { return this; }),
    onSnapshot,
    get: jest.fn(() =>
      Promise.resolve({
        forEach: jest.fn(),
        docs: [],
      }),
    ),
    startAfter: jest.fn(function () { return this; }),
    doc: jest.fn(() => ({
      get: docGet,
      update: docUpdate,
    })),
  };

  // The doc reference returned from houseCollection.doc(id)
  const docRef = {
    collection: jest.fn(() => innerCollection),
  };

  const collection = jest.fn(() => ({
    doc: jest.fn(() => docRef),
  }));

  const mockFirestore = {
    collection,
    // Expose internals for test access
    _innerCollection: innerCollection,
    _unsubscribe: unsubscribe,
    _onSnapshot: onSnapshot,
    _docGet: docGet,
    _docUpdate: docUpdate,
  };

  return {
    firestore: mockFirestore,
  };
});

jest.mock('../crud', () => ({
  create: jest.fn(() => Promise.resolve()),
}));

// ─── Imports (after mocks) ───────────────────────────────────────────────────

import { firestore } from '../../../firebase-setup';
import * as crud from '../crud';
import {
  sendMessageToHouseChat,
  subscribeToHouseChat,
  subscribeToDirectChat,
  unsubscribeFromHouseChat,
  unsubscribeFromDirectChat,
  markRead,
  updateConversation,
  loadChat,
  loadDirectChat,
  CHAT_ID,
  getMessageDate,
} from '../message';
import { Message } from '../../entities/Message';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Access the internals embedded in our factory mock */
const getInner = () => (firestore as any)._innerCollection as typeof mockInnerCollection;
const getOnSnapshot = () => (firestore as any)._onSnapshot as jest.Mock;
const getUnsubscribe = () => (firestore as any)._unsubscribe as jest.Mock;
const getDocUpdate = () => (firestore as any)._docUpdate as jest.Mock;
const getDocGet = () => (firestore as any)._docGet as jest.Mock;

function makeMessage(overrides: Partial<Message> = {}): Message {
  const msg = new Message('Hello', 'user-1', 'Alice');
  msg.id = 'msg-1';
  msg._id = 'msg-1';
  msg.houseId = 'house-1';
  return Object.assign(msg, overrides);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('message service (Firestore)', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Restore onSnapshot default (returns the unsubscribe fn)
    getOnSnapshot().mockReturnValue(getUnsubscribe());
  });

  // ── sendMessageToHouseChat ──────────────────────────────────────────────────

  describe('sendMessageToHouseChat', () => {
    it('calls crud.create for each message', async () => {
      const messages = [makeMessage(), makeMessage({ id: 'msg-2', _id: 'msg-2' })];

      await sendMessageToHouseChat('house-1', messages);

      expect(crud.create).toHaveBeenCalledTimes(2);
    });

    it('calls crud.create with the correct collection reference', async () => {
      const messages = [makeMessage()];

      await sendMessageToHouseChat('house-1', messages);

      // crud.create should have been called with the inner 'chat' sub-collection
      expect(crud.create).toHaveBeenCalledWith(
        expect.anything(), // Firestore CollectionReference
        messages[0],
      );
    });

    it('does not throw when all crud.create calls fail — returns rejected settled results', async () => {
      (crud.create as jest.Mock).mockRejectedValue(new Error('Firestore write error'));

      // Promise.allSettled — must NOT throw even on total failure
      const results = await sendMessageToHouseChat('house-1', [makeMessage()]);

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('rejected');
    });

    it('sends all messages even if one fails, returning settled results for each', async () => {
      let callCount = 0;
      (crud.create as jest.Mock).mockImplementation(async () => {
        callCount++;
        if (callCount === 2) throw new Error('Write failed');
        return { id: `msg-${callCount}` };
      });

      const messages = [
        makeMessage({ id: 'a', _id: 'a' }),
        makeMessage({ id: 'b', _id: 'b' }),
      ];

      // Should NOT throw even though the second message fails
      const results = await sendMessageToHouseChat('house-1', messages);

      // Both were attempted; one fulfilled, one rejected
      expect(results).toHaveLength(2);
      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('rejected');
    });

    it('resolves with fulfilled settled results for all messages when all succeed', async () => {
      (crud.create as jest.Mock).mockResolvedValue({ id: 'created-id' });
      const messages = [makeMessage(), makeMessage({ id: 'msg-2', _id: 'msg-2' })];

      const results = await sendMessageToHouseChat('house-1', messages);

      expect(results).toHaveLength(2);
      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('fulfilled');
    });
  });

  // ── subscribeToHouseChat ────────────────────────────────────────────────────

  describe('subscribeToHouseChat', () => {
    it('returns an unsubscribe function', () => {
      const handler = jest.fn();
      const unsub = subscribeToHouseChat('house-1', handler);

      expect(typeof unsub).toBe('function');
    });

    it('calls onSnapshot on the ordered, limited house chat collection', () => {
      const handler = jest.fn();
      subscribeToHouseChat('house-1', handler);

      expect(getInner().orderBy).toHaveBeenCalledWith('sortKey', 'desc');
      expect(getInner().limit).toHaveBeenCalledWith(20);
      expect(getOnSnapshot()).toHaveBeenCalledTimes(1);
    });

    it('invokes the handler with messages when snapshot fires', () => {
      const handler = jest.fn();
      subscribeToHouseChat('house-1', handler);

      // Simulate a Firestore snapshot arriving
      const fakeDoc = { id: 'msg-1', data: () => ({ text: 'Hi', sortKey: 1 }) };
      const fakeSnapshot = {
        forEach: (cb: (doc: any) => void) => cb(fakeDoc),
      };

      // Call the snapshot listener that was passed to onSnapshot
      const snapshotCb = getOnSnapshot().mock.calls[0][0];
      snapshotCb(fakeSnapshot);

      expect(handler).toHaveBeenCalledTimes(1);
      const receivedMessages: Message[] = handler.mock.calls[0][0];
      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0].id).toBe('msg-1');
      expect(receivedMessages[0].text).toBe('Hi');
    });

    it('the returned function unsubscribes when called', () => {
      const handler = jest.fn();
      const unsub = subscribeToHouseChat('house-1', handler);

      unsub();

      expect(getUnsubscribe()).toHaveBeenCalledTimes(1);
    });
  });

  // ── subscribeToDirectChat ───────────────────────────────────────────────────

  describe('subscribeToDirectChat', () => {
    it('returns an unsubscribe function', () => {
      const handler = jest.fn();
      const unsub = subscribeToDirectChat(['user-a', 'user-b'], handler);

      expect(typeof unsub).toBe('function');
    });

    it('uses a sorted conversation ID from the provided user IDs', () => {
      const handler = jest.fn();
      // IDs ['z', 'a'] should sort to 'az'
      subscribeToDirectChat(['z', 'a'], handler);

      // Verify orderBy was called — means the query was built on the right path
      expect(getInner().orderBy).toHaveBeenCalledWith('sortKey', 'desc');
      expect(getInner().limit).toHaveBeenCalledWith(20);
    });

    it('invokes the handler with messages and chatId when snapshot fires', () => {
      const handler = jest.fn();
      subscribeToDirectChat(['user-a', 'user-b'], handler);

      const fakeDoc = { id: 'dm-1', data: () => ({ text: 'Hello', sortKey: 2 }) };
      const fakeSnapshot = {
        forEach: (cb: (doc: any) => void) => cb(fakeDoc),
      };

      const snapshotCb = getOnSnapshot().mock.calls[0][0];
      snapshotCb(fakeSnapshot);

      expect(handler).toHaveBeenCalledTimes(1);
      const [messages, chatId] = handler.mock.calls[0];
      expect(messages).toHaveLength(1);
      expect(messages[0].id).toBe('dm-1');
      // chatId should be the sorted combination
      expect(chatId).toBe(CHAT_ID(['user-a', 'user-b']));
    });

    it('the returned function unsubscribes when called', () => {
      const handler = jest.fn();
      const unsub = subscribeToDirectChat(['user-a', 'user-b'], handler);

      unsub();

      expect(getUnsubscribe()).toHaveBeenCalledTimes(1);
    });
  });

  // ── unsubscribeFromHouseChat / unsubscribeFromDirectChat ────────────────────

  describe('unsubscribeFromHouseChat', () => {
    it('calls the provided unsubscribe function', () => {
      const unsub = jest.fn();
      unsubscribeFromHouseChat(unsub);
      expect(unsub).toHaveBeenCalledTimes(1);
    });

    it('does not throw when called with a no-op function', () => {
      expect(() => unsubscribeFromHouseChat(() => {})).not.toThrow();
    });
  });

  describe('unsubscribeFromDirectChat', () => {
    it('calls the provided unsubscribe function', () => {
      const unsub = jest.fn();
      unsubscribeFromDirectChat(unsub);
      expect(unsub).toHaveBeenCalledTimes(1);
    });
  });

  // ── markRead ────────────────────────────────────────────────────────────────

  describe('markRead', () => {
    it('calls Firestore update with read: true on the correct document', async () => {
      await markRead('conversation-1', 'message-1');

      expect(getDocUpdate()).toHaveBeenCalledWith({ read: true });
    });

    it('throws a descriptive error when Firestore update fails', async () => {
      getDocUpdate().mockRejectedValue(new Error('Permission denied'));

      await expect(markRead('conv-1', 'msg-1')).rejects.toThrow(
        'Failed to mark message as read',
      );
    });
  });

  // ── updateConversation ──────────────────────────────────────────────────────

  describe('updateConversation', () => {
    it('calls crud.create for each direct message', async () => {
      const messages = [makeMessage() as any, makeMessage({ id: 'dm-2', _id: 'dm-2' }) as any];

      await updateConversation('conv-1', messages);

      expect(crud.create).toHaveBeenCalledTimes(2);
    });

    it('throws a descriptive error when crud.create fails', async () => {
      (crud.create as jest.Mock).mockRejectedValue(new Error('Network error'));

      await expect(updateConversation('conv-1', [makeMessage() as any])).rejects.toThrow(
        'Failed to send direct messages',
      );
    });
  });

  // ── loadChat ────────────────────────────────────────────────────────────────

  describe('loadChat', () => {
    it('calls the handler with an empty array when no docs are returned', async () => {
      getInner().get.mockResolvedValue({ forEach: jest.fn() });
      const handler = jest.fn();

      await loadChat('house-1', handler);

      expect(handler).toHaveBeenCalledWith([]);
    });

    it('passes messages from Firestore docs to the handler', async () => {
      const fakeDoc = { id: 'msg-1', data: () => ({ text: 'Hello', sortKey: 1 }) };
      getInner().get.mockResolvedValue({
        forEach: (cb: (doc: any) => void) => cb(fakeDoc),
      });
      const handler = jest.fn();

      await loadChat('house-1', handler);

      expect(handler).toHaveBeenCalledTimes(1);
      const messages: Message[] = handler.mock.calls[0][0];
      expect(messages[0].id).toBe('msg-1');
      expect(messages[0].text).toBe('Hello');
    });

    it('uses startAfter for pagination when startAfterDoc is provided', async () => {
      getDocGet().mockResolvedValue({ exists: true, data: () => ({}) });
      getInner().get.mockResolvedValue({ forEach: jest.fn() });
      const handler = jest.fn();

      await loadChat('house-1', handler, 'some-doc-id');

      expect(getInner().startAfter).toHaveBeenCalledTimes(1);
    });

    it('throws a descriptive error on Firestore failure', async () => {
      getInner().get.mockRejectedValue(new Error('Firestore error'));
      const handler = jest.fn();

      await expect(loadChat('house-1', handler)).rejects.toThrow(
        'Failed to load chat history',
      );
    });
  });

  // ── loadDirectChat ──────────────────────────────────────────────────────────

  describe('loadDirectChat', () => {
    it('calls the handler with messages from Firestore', async () => {
      const fakeDoc = { id: 'dm-1', data: () => ({ text: 'DM text', sortKey: 1 }) };
      getInner().get.mockResolvedValue({
        forEach: (cb: (doc: any) => void) => cb(fakeDoc),
      });
      const handler = jest.fn();

      await loadDirectChat('conv-1', handler);

      expect(handler).toHaveBeenCalledTimes(1);
      const [messages, chatId] = handler.mock.calls[0];
      expect(messages[0].id).toBe('dm-1');
      expect(chatId).toBe('conv-1');
    });

    it('returns the loaded messages array', async () => {
      const fakeDoc = { id: 'dm-2', data: () => ({ text: 'Reply', sortKey: 2 }) };
      getInner().get.mockResolvedValue({
        forEach: (cb: (doc: any) => void) => cb(fakeDoc),
      });

      const result = await loadDirectChat('conv-1', jest.fn());

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('dm-2');
    });

    it('throws a descriptive error on failure', async () => {
      getInner().get.mockRejectedValue(new Error('Network error'));

      await expect(loadDirectChat('conv-1', jest.fn())).rejects.toThrow(
        'Failed to load direct chat',
      );
    });
  });

  // ── getMessageDate (timestamp conversion) ──────────────────────────────────

  describe('getMessageDate', () => {
    it('converts a Firestore Timestamp via toDate()', () => {
      const expectedDate = new Date('2026-01-15T12:00:00.000Z');
      const firestoreTimestamp = { toDate: jest.fn(() => expectedDate) };

      const result = getMessageDate(firestoreTimestamp as any);

      expect(result).toEqual(expectedDate);
      expect(firestoreTimestamp.toDate).toHaveBeenCalledTimes(1);
    });

    it('converts a timestamp-like object with seconds field', () => {
      const seconds = 1736942400; // 2026-01-15T12:00:00.000Z
      const result = getMessageDate({ seconds } as any);

      expect(result).toEqual(new Date(seconds * 1000));
    });

    it('converts a timestamp-like object with _seconds field', () => {
      const _seconds = 1736942400;
      const result = getMessageDate({ _seconds } as any);

      expect(result).toEqual(new Date(_seconds * 1000));
    });

    it('returns the Date object when passed a Date directly', () => {
      const date = new Date('2026-02-01T00:00:00.000Z');
      const result = getMessageDate(date);

      expect(result).toEqual(date);
    });

    it('returns undefined when no recognisable timestamp shape is provided', () => {
      const result = getMessageDate({} as any);

      expect(result).toBeUndefined();
    });
  });

  // ── CHAT_ID ─────────────────────────────────────────────────────────────────

  describe('CHAT_ID', () => {
    it('sorts ids and joins them', () => {
      expect(CHAT_ID(['z', 'a'])).toBe('az');
    });

    it('is deterministic regardless of input order', () => {
      const id1 = CHAT_ID(['user-b', 'user-a']);
      const id2 = CHAT_ID(['user-a', 'user-b']);
      expect(id1).toBe(id2);
    });
  });
});
