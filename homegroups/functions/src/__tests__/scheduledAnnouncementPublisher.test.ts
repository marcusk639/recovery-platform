/**
 * Tests for scheduledAnnouncementPublisher Cloud Function
 * and the onAnnouncementCreate skip logic.
 */

export {}; // Ensure this file is treated as an isolated module by TypeScript

// ---- Mocks must be defined before imports ----

const mockUpdate = jest.fn().mockResolvedValue(undefined);
const mockDocRef = { update: mockUpdate };
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

// The scheduledAnnouncementPublisher uses functionsV1.pubsub.schedule().timeZone().onRun(handler)
// We want the export to BE the handler so we can call it directly
jest.mock('firebase-functions/v1', () => ({
  pubsub: {
    schedule: jest.fn().mockReturnValue({
      timeZone: jest.fn().mockReturnValue({
        onRun: jest.fn().mockImplementation((handler: Function) => handler),
      }),
    }),
  },
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

// ---- Helper to create mock Firestore documents ----
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createDoc = (id: string, data: Record<string, any>) => ({
  id,
  data: () => data,
  ref: { update: mockUpdate },
});

// ---- Tests ----

describe('scheduledAnnouncementPublisher', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSendEachForMulticast.mockResolvedValue({
      successCount: 1,
      failureCount: 0,
      responses: [{ success: true }],
    });
  });

  it('Positive case: marks a due scheduled announcement as published and sends notifications', async () => {
    const now = new Date();
    const pastTime = new Date(now.getTime() - 60 * 60 * 1000); // 1 hour ago

    const announcementId = 'ann-1';
    const groupId = 'group-1';

    const announcementDoc = createDoc(announcementId, {
      status: 'scheduled',
      scheduledFor: {
        toDate: () => pastTime,
        seconds: Math.floor(pastTime.getTime() / 1000),
        nanoseconds: 0,
      },
      groupId,
      title: 'Test Announcement',
      content: 'Test content for scheduled announcement',
      createdBy: 'user-admin',
    });

    mockCollection.mockImplementation((name: string) => {
      if (name === 'announcements') {
        return {
          where: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              get: jest.fn().mockResolvedValue({
                empty: false,
                size: 1,
                docs: [announcementDoc],
              }),
            }),
          }),
        };
      }
      if (name === 'groups') {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => ({ name: 'Recovery Group' }),
            }),
          }),
        };
      }
      if (name === 'members') {
        return {
          where: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              docs: [createDoc('member-1', { userId: 'user-member', groupId })],
            }),
          }),
        };
      }
      if (name === 'users') {
        return {
          where: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              docs: [
                createDoc('user-member', {
                  fcmTokens: ['token-abc'],
                  notificationSettings: {
                    announcements: true,
                    allowPushNotifications: true,
                  },
                }),
              ],
            }),
          }),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
      };
    });

    jest.resetModules();
    const { scheduledAnnouncementPublisher } = await import(
      '../triggers/scheduled/scheduledAnnouncementPublisher'
    );

    await (scheduledAnnouncementPublisher as Function)();

    // The doc should have been updated to 'published'
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'published' }),
    );

    // Notifications should have been sent
    expect(mockSendEachForMulticast).toHaveBeenCalledWith(
      expect.objectContaining({
        tokens: ['token-abc'],
        notification: expect.objectContaining({
          body: expect.stringContaining('Test Announcement'),
        }),
      }),
    );
  });

  it('Negative case: does not publish announcements when none are due', async () => {
    mockCollection.mockImplementation((name: string) => {
      if (name === 'announcements') {
        return {
          where: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              get: jest.fn().mockResolvedValue({
                empty: true,
                size: 0,
                docs: [],
              }),
            }),
          }),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
      };
    });

    jest.resetModules();
    const { scheduledAnnouncementPublisher } = await import(
      '../triggers/scheduled/scheduledAnnouncementPublisher'
    );

    await (scheduledAnnouncementPublisher as Function)();

    // No updates or notifications should be sent
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockSendEachForMulticast).not.toHaveBeenCalled();
  });
});

describe('onAnnouncementCreate skip logic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('Positive case: proceeds to send notification for published announcements using top-level members collection', async () => {
    mockCollection.mockImplementation((name: string) => {
      if (name === 'groups') {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => ({ name: 'Test Group' }),
            }),
          }),
        };
      }
      if (name === 'members') {
        // Top-level members collection — correct path after FC-1 fix
        return {
          where: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              empty: false,
              docs: [createDoc('group-1_user-2', { userId: 'user-2', groupId: 'group-1' })],
            }),
          }),
        };
      }
      if (name === 'users') {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              exists: true,
              id: 'user-2',
              data: () => ({
                fcmTokens: ['token-xyz'],
                notificationSettings: {
                  announcements: true,
                  allowPushNotifications: true,
                },
              }),
            }),
          }),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
      };
    });

    mockSendEachForMulticast.mockResolvedValue({
      successCount: 1,
      failureCount: 0,
      responses: [{ success: true }],
    });

    jest.resetModules();
    const { onAnnouncementCreate } = await import(
      '../triggers/firestore/onAnnouncementCreate'
    );

    const mockSnap = {
      data: () => ({
        title: 'Test',
        content: 'Content here',
        createdBy: 'user-1',
        groupId: 'group-1',
        status: 'published', // NOT scheduled — should proceed
      }),
    };

    // FC-4 fix: context.params no longer contains groupId; announcementId is still there
    const mockContext = {
      params: { announcementId: 'ann-1' },
    };

    await (onAnnouncementCreate as Function)(mockSnap, mockContext);

    // Should have looked up the group
    expect(mockCollection).toHaveBeenCalledWith('groups');

    // Should have queried the TOP-LEVEL members collection (FC-1 fix)
    expect(mockCollection).toHaveBeenCalledWith('members');
  });

  it('Verifies onAnnouncementCreate uses top-level members collection with groupId where clause', async () => {
    const groupId = 'group-test';
    let membersWhereCalledWithGroupId = false;

    mockCollection.mockImplementation((name: string) => {
      if (name === 'groups') {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => ({ name: 'Test Group' }),
            }),
          }),
        };
      }
      if (name === 'members') {
        return {
          where: jest.fn().mockImplementation((field: string, op: string, val: string) => {
            if (field === 'groupId' && op === '==' && val === groupId) {
              membersWhereCalledWithGroupId = true;
            }
            return {
              get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
            };
          }),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
      };
    });

    jest.resetModules();
    const { onAnnouncementCreate } = await import(
      '../triggers/firestore/onAnnouncementCreate'
    );

    const mockSnap = {
      data: () => ({
        title: 'Test',
        content: 'Content here',
        createdBy: 'user-1',
        groupId,
        status: 'published',
      }),
    };

    const mockContext = { params: { announcementId: 'ann-verify' } };

    await (onAnnouncementCreate as Function)(mockSnap, mockContext);

    // Confirm the where clause was called with the correct groupId field
    expect(membersWhereCalledWithGroupId).toBe(true);
  });

  it('Negative case: returns null early for scheduled announcements without sending notification', async () => {
    jest.resetModules();
    const { onAnnouncementCreate } = await import(
      '../triggers/firestore/onAnnouncementCreate'
    );

    const mockSnap = {
      data: () => ({
        title: 'Future Post',
        content: 'This will post later',
        createdBy: 'user-1',
        groupId: 'group-1',
        status: 'scheduled', // <-- should trigger early return
        scheduledFor: {
          toDate: () => new Date(Date.now() + 3600000),
        },
      }),
    };

    const mockContext = {
      params: { announcementId: 'ann-future' },
    };

    const result = await (onAnnouncementCreate as Function)(mockSnap, mockContext);

    // Should return null early
    expect(result).toBeNull();
    // Should NOT have sent any notifications
    expect(mockSendEachForMulticast).not.toHaveBeenCalled();
    // Should NOT have tried to look up the group (early return before that)
    expect(mockCollection).not.toHaveBeenCalledWith('groups');
  });
});
