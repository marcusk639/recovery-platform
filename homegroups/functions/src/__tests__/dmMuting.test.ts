/**
 * Tests for onDirectMessageCreate Cloud Function — DM muting behaviour.
 *
 * Covers:
 * 1. Positive: notification IS sent when thread is NOT muted
 * 2. Negative: notification IS skipped when thread IS muted by recipient
 * 3. Edge case: mutedThreads field is undefined → treat as not muted
 */

// ---- Mocks must be defined before imports ----

const mockUpdate = jest.fn().mockResolvedValue(undefined);
const mockSendEachForMulticast = jest.fn();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockCollection = jest.fn() as jest.MockedFunction<(name: string) => any>;

jest.mock('firebase-admin', () => {
  const fromDate = (date: Date) => ({
    toDate: () => date,
    seconds: Math.floor(date.getTime() / 1000),
    nanoseconds: 0,
  });
  return {
    apps: [],
    initializeApp: jest.fn(),
    firestore: Object.assign(
      jest.fn().mockReturnValue({ collection: mockCollection }),
      {
        Timestamp: {
          fromDate,
          now: () => fromDate(new Date()),
        },
      },
    ),
    app: jest.fn().mockReturnValue({}),
    auth: jest.fn().mockReturnValue({}),
  };
});

jest.mock('firebase-admin/messaging', () => ({
  getMessaging: jest.fn().mockReturnValue({
    sendEachForMulticast: mockSendEachForMulticast,
  }),
}));

jest.mock('firebase-functions', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('firebase-functions/v1', () => ({
  firestore: {
    document: jest.fn().mockReturnValue({
      onCreate: jest.fn().mockImplementation((handler: Function) => handler),
    }),
  },
}));

jest.mock('../utils/firebase', () => ({
  db: { collection: mockCollection },
  messaging: { sendEachForMulticast: mockSendEachForMulticast },
}));

// ---- Helper to build mock Firestore document snapshots ----
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createDoc = (id: string, data: Record<string, any>) => ({
  id,
  exists: true,
  data: () => data,
  ref: { update: mockUpdate },
});

const createMissingDoc = () => ({
  id: 'missing',
  exists: false,
  data: () => undefined,
});

// ---- Shared test data ----
const THREAD_ID = 'thread-abc';
const MESSAGE_ID = 'msg-001';
const SENDER_ID = 'user-sender';
const RECIPIENT_ID = 'user-recipient';

/** Build the mock snap object that Cloud Function receives */
const buildSnap = (text = 'Hello') => ({
  data: () => ({
    senderId: SENDER_ID,
    senderName: 'Alice',
    text,
    sentAt: { toDate: () => new Date() },
  }),
});

/** Build the mock context object */
const buildContext = () => ({
  params: { threadId: THREAD_ID, messageId: MESSAGE_ID },
});

/** Thread document with two participants */
const threadDoc = createDoc(THREAD_ID, {
  participants: [SENDER_ID, RECIPIENT_ID],
});

/** Successful send mock return value */
const sendSuccess = {
  successCount: 1,
  failureCount: 0,
  responses: [{ success: true }],
};

// ---- Tests ----

describe('onDirectMessageCreate — mute check', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSendEachForMulticast.mockResolvedValue(sendSuccess);
  });

  it('Positive: sends notification when thread is NOT muted', async () => {
    // Recipient has no mutedThreads entry for this thread
    const recipientDoc = createDoc(RECIPIENT_ID, {
      fcmTokens: ['token-recipient-1'],
      displayName: 'Bob',
      notificationSettings: { allowPushNotifications: true },
      // mutedThreads is absent → treated as []
    });

    mockCollection.mockImplementation((name: string) => {
      if (name === 'direct_message_threads') {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue(threadDoc),
          }),
        };
      }
      if (name === 'users') {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue(recipientDoc),
          }),
        };
      }
      return { doc: jest.fn().mockReturnThis() };
    });

    jest.resetModules();
    const { onDirectMessageCreate } = await import(
      '../triggers/firestore/onDirectMessageCreate'
    );

    await (onDirectMessageCreate as Function)(buildSnap(), buildContext());

    // Notification should have been sent
    expect(mockSendEachForMulticast).toHaveBeenCalledTimes(1);
    expect(mockSendEachForMulticast).toHaveBeenCalledWith(
      expect.objectContaining({
        tokens: ['token-recipient-1'],
        notification: expect.objectContaining({
          title: 'Alice',
          body: 'Hello',
        }),
        data: expect.objectContaining({
          type: 'direct_message',
          threadId: THREAD_ID,
        }),
      }),
    );
  });

  it('Negative: skips notification when thread IS muted by recipient', async () => {
    // Recipient has this thread in mutedThreads
    const recipientDoc = createDoc(RECIPIENT_ID, {
      fcmTokens: ['token-recipient-1'],
      displayName: 'Bob',
      notificationSettings: { allowPushNotifications: true },
      mutedThreads: [THREAD_ID], // <-- muted
    });

    mockCollection.mockImplementation((name: string) => {
      if (name === 'direct_message_threads') {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue(threadDoc),
          }),
        };
      }
      if (name === 'users') {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue(recipientDoc),
          }),
        };
      }
      return { doc: jest.fn().mockReturnThis() };
    });

    jest.resetModules();
    const { onDirectMessageCreate } = await import(
      '../triggers/firestore/onDirectMessageCreate'
    );

    await (onDirectMessageCreate as Function)(buildSnap(), buildContext());

    // Notification should NOT have been sent
    expect(mockSendEachForMulticast).not.toHaveBeenCalled();
  });

  it('Edge case: mutedThreads is undefined → notification IS sent', async () => {
    // Recipient document exists but mutedThreads field is missing
    const recipientDoc = createDoc(RECIPIENT_ID, {
      fcmTokens: ['token-recipient-2'],
      displayName: 'Carol',
      notificationSettings: { allowPushNotifications: true },
      // mutedThreads: undefined (field not set at all)
    });

    mockCollection.mockImplementation((name: string) => {
      if (name === 'direct_message_threads') {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue(threadDoc),
          }),
        };
      }
      if (name === 'users') {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue(recipientDoc),
          }),
        };
      }
      return { doc: jest.fn().mockReturnThis() };
    });

    jest.resetModules();
    const { onDirectMessageCreate } = await import(
      '../triggers/firestore/onDirectMessageCreate'
    );

    await (onDirectMessageCreate as Function)(buildSnap('Hey there'), buildContext());

    // Should send notification (not muted)
    expect(mockSendEachForMulticast).toHaveBeenCalledTimes(1);
    expect(mockSendEachForMulticast).toHaveBeenCalledWith(
      expect.objectContaining({
        tokens: ['token-recipient-2'],
        notification: expect.objectContaining({
          body: 'Hey there',
        }),
      }),
    );
  });

  it('Thread not found: returns null without sending notification', async () => {
    mockCollection.mockImplementation((name: string) => {
      if (name === 'direct_message_threads') {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue(createMissingDoc()),
          }),
        };
      }
      return { doc: jest.fn().mockReturnThis() };
    });

    jest.resetModules();
    const { onDirectMessageCreate } = await import(
      '../triggers/firestore/onDirectMessageCreate'
    );

    const result = await (onDirectMessageCreate as Function)(buildSnap(), buildContext());

    expect(result).toBeNull();
    expect(mockSendEachForMulticast).not.toHaveBeenCalled();
  });

  it('Recipient has no FCM tokens: returns null without sending notification', async () => {
    const recipientDoc = createDoc(RECIPIENT_ID, {
      fcmTokens: [], // no tokens
      displayName: 'Bob',
      notificationSettings: { allowPushNotifications: true },
    });

    mockCollection.mockImplementation((name: string) => {
      if (name === 'direct_message_threads') {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue(threadDoc),
          }),
        };
      }
      if (name === 'users') {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue(recipientDoc),
          }),
        };
      }
      return { doc: jest.fn().mockReturnThis() };
    });

    jest.resetModules();
    const { onDirectMessageCreate } = await import(
      '../triggers/firestore/onDirectMessageCreate'
    );

    const result = await (onDirectMessageCreate as Function)(buildSnap(), buildContext());

    expect(result).toBeNull();
    expect(mockSendEachForMulticast).not.toHaveBeenCalled();
  });
});
