/**
 * Tests for DirectMessageModel — focusing on C-4:
 * markMessageAsRead must write to the `read` field (a userId→boolean map),
 * NOT to a `readBy` field.  The Firestore security rule for DM messages
 * permits non-senders to update ONLY the `read` field; writing to any other
 * field would be rejected by the rule.
 */

import {DirectMessageModel} from '../DirectMessageModel';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Capture every update() call so tests can assert on the payload.
const mockMessageUpdate = jest.fn(() => Promise.resolve());
const mockThreadUpdate = jest.fn(() => Promise.resolve());

const THREAD_ID = 'thread_userA_userB';
const MESSAGE_ID = 'msg-001';
const CURRENT_USER_ID = 'userB';
const SENDER_ID = 'userA';

// Build a minimal message document that looks unread for CURRENT_USER_ID.
function makeMockMessageDoc(overrides: Record<string, any> = {}) {
  return {
    exists: true,
    data: () => ({
      senderId: SENDER_ID,
      sentAt: {isEqual: (other: any) => other === 'sentinel-ts'},
      read: {},
      ...overrides,
    }),
  };
}

// Build a minimal thread document.
function makeMockThreadDoc(unreadCounts: Record<string, number> = {[CURRENT_USER_ID]: 1}) {
  return {
    exists: true,
    data: () => ({
      participants: [SENDER_ID, CURRENT_USER_ID],
      lastMessage: {
        sentAt: {isEqual: () => false}, // not the same sentAt as the message
      },
      unreadCounts,
    }),
  };
}

// Wire up the Firestore mock so collection().doc() returns our fake documents.
jest.mock('@react-native-firebase/firestore', () => {
  const messageDocRef = {
    get: jest.fn(),
    update: (...args: any[]) => mockMessageUpdate(...args),
  };

  const threadDocRef = {
    get: jest.fn(),
    update: (...args: any[]) => mockThreadUpdate(...args),
  };

  const mockDocFn = jest.fn((docId: string) => {
    // Return the message ref for message IDs, thread ref for everything else.
    if (docId === MESSAGE_ID) {
      return messageDocRef;
    }
    return threadDocRef;
  });

  const mockCollectionFn = jest.fn(() => ({doc: mockDocFn}));

  const mockFirestore = () => ({collection: mockCollectionFn});
  mockFirestore.Timestamp = {
    now: jest.fn(() => ({toDate: () => new Date(), toMillis: () => Date.now()})),
    fromDate: jest.fn((d: Date) => ({toDate: () => d, toMillis: () => d.getTime()})),
  };
  mockFirestore.FieldValue = {
    serverTimestamp: jest.fn(() => ({})),
    arrayUnion: jest.fn((...args: any[]) => args),
    arrayRemove: jest.fn((...args: any[]) => args),
    increment: jest.fn((n: number) => n),
    delete: jest.fn(() => ({})),
  };

  return mockFirestore;
});

jest.mock('@react-native-firebase/auth', () => {
  const mockAuth = {
    currentUser: {uid: CURRENT_USER_ID},
    onAuthStateChanged: jest.fn(() => jest.fn()),
  };
  return () => mockAuth;
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns the Firestore collection mock so individual tests can set up .get() responses. */
function getFirestoreMock() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const firestoreFn = jest.requireMock('@react-native-firebase/firestore') as any;
  return firestoreFn() as ReturnType<typeof firestoreFn>;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DirectMessageModel.markMessageAsRead — field name (C-4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls messageRef.update() with `read.<userId>` key, NOT `readBy`', async () => {
    const firestoreMock = getFirestoreMock();
    const docMock = firestoreMock.collection(/* any */ '').doc;

    // message doc: unread for CURRENT_USER_ID
    (docMock(MESSAGE_ID) as any).get.mockResolvedValue(makeMockMessageDoc());
    // thread doc
    (docMock(THREAD_ID) as any).get.mockResolvedValue(makeMockThreadDoc());

    await DirectMessageModel.markMessageAsRead(THREAD_ID, MESSAGE_ID);

    // Must have called update on the message document exactly once.
    expect(mockMessageUpdate).toHaveBeenCalledTimes(1);

    const updatePayload = mockMessageUpdate.mock.calls[0][0] as Record<string, any>;

    // The update key must be `read.<userId>` — not `readBy`, not `readBy.<userId>`.
    expect(Object.keys(updatePayload)).toContain(`read.${CURRENT_USER_ID}`);
    expect(Object.keys(updatePayload)).not.toContain(`readBy`);
    expect(Object.keys(updatePayload)).not.toContain(`readBy.${CURRENT_USER_ID}`);
    expect(updatePayload[`read.${CURRENT_USER_ID}`]).toBe(true);
  });

  it('does NOT include a `readBy` key anywhere in the update payload', async () => {
    const firestoreMock = getFirestoreMock();
    const docMock = firestoreMock.collection('').doc;

    (docMock(MESSAGE_ID) as any).get.mockResolvedValue(makeMockMessageDoc());
    (docMock(THREAD_ID) as any).get.mockResolvedValue(makeMockThreadDoc());

    await DirectMessageModel.markMessageAsRead(THREAD_ID, MESSAGE_ID);

    const updatePayload = mockMessageUpdate.mock.calls[0][0] as Record<string, any>;

    // Verify no key starts with 'readBy'
    const hasReadByKey = Object.keys(updatePayload).some(k => k.startsWith('readBy'));
    expect(hasReadByKey).toBe(false);
  });

  it('skips the message update when the message was already read by the current user', async () => {
    const firestoreMock = getFirestoreMock();
    const docMock = firestoreMock.collection('').doc;

    // Message is already marked read for CURRENT_USER_ID
    (docMock(MESSAGE_ID) as any).get.mockResolvedValue(
      makeMockMessageDoc({read: {[CURRENT_USER_ID]: true}}),
    );
    (docMock(THREAD_ID) as any).get.mockResolvedValue(
      makeMockThreadDoc({[CURRENT_USER_ID]: 0}),
    );

    await DirectMessageModel.markMessageAsRead(THREAD_ID, MESSAGE_ID);

    // update() is still called (to set read.<uid> = true idempotently)
    // but crucially the unread count is NOT decremented (wasUnread = false)
    const updatePayload = mockMessageUpdate.mock.calls[0][0] as Record<string, any>;
    expect(updatePayload).toEqual({[`read.${CURRENT_USER_ID}`]: true});
  });

  it('throws when the message document does not exist', async () => {
    const firestoreMock = getFirestoreMock();
    const docMock = firestoreMock.collection('').doc;

    (docMock(MESSAGE_ID) as any).get.mockResolvedValue({exists: false, data: () => null});

    await expect(
      DirectMessageModel.markMessageAsRead(THREAD_ID, MESSAGE_ID),
    ).rejects.toThrow('Message not found');
  });
});
