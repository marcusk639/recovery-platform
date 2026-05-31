// src/services/__tests__/notifications.test.ts
//
// Unit tests for the notifications service.
//
// The service exports:
//   getNotification              — crud.get
//   getNotifications             — crud.getByAttribute → map by id
//   updateNotification           — crud.update (sets id if missing)
//   createNotification           — crud.create
//   deleteNotification           — accepts string or object; fetches if string
//   registerDeviceToken          — firestore.collection('userDeviceTokens').doc(userId).set(...)
//   getUserNotifications         — crud.getByAttribute on 'userId'
//   markNotificationAsRead       — calls updateNotification with { read: true }
//   markAllNotificationsAsRead   — fetches user notifications, updates unread ones

// ─── Mocks (hoisted before imports) ─────────────────────────────────────────

jest.mock('../../../firebase-setup', () => {
  const docObj = {
    id: 'generated-doc-id',
    get: jest.fn(() => Promise.resolve({ exists: false, data: () => null })),
    set: jest.fn(() => Promise.resolve()),
    update: jest.fn(() => Promise.resolve()),
    delete: jest.fn(() => Promise.resolve()),
  };

  const collectionObj: any = {
    doc: jest.fn(() => docObj),
    where: jest.fn(),
    get: jest.fn(() => Promise.resolve({ docs: [] })),
    add: jest.fn(() => Promise.resolve({ id: 'mock-id' })),
  };

  collectionObj.where = jest.fn(() => collectionObj);

  return {
    firestore: {
      collection: jest.fn(() => collectionObj),
      _docObj: docObj,
      _collectionObj: collectionObj,
    },
    FirebaseFirestoreTypes: {},
  };
});

jest.mock('../crud', () => ({
  get: jest.fn(),
  getByAttribute: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  deleteObject: jest.fn(),
}));

// Prevent import of react-native-size-matters (ESM) via util/display chain
jest.mock('../../util/display', () => ({
  getTodaysDate: jest.fn(() => '2024-01-01'),
  getCurrentTime: jest.fn(() => '2024-01-01T00:00:00.000Z'),
  getDaysOfWeek: jest.fn(() => []),
  formatDate: jest.fn((d: string) => d),
}));

// ─── Imports (after mocks) ───────────────────────────────────────────────────

import { firestore } from '../../../firebase-setup';
import * as crud from '../crud';
import {
  getNotification,
  getNotifications,
  updateNotification,
  createNotification,
  deleteNotification,
  registerDeviceToken,
  getUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from '../notifications';
import { Notification } from '../../entities/Notification';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeNotification = (overrides: Partial<Notification> = {}): Notification => {
  const n = new Notification();
  (n as any).id = 'n1';
  n.userId = 'u1';
  n.houseId = 'h1';
  n.message = 'Test notification';
  n.read = false;
  Object.assign(n, overrides);
  return n;
};

const getDocObj = () => (firestore as any)._docObj as {
  set: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  get: jest.Mock;
};

const getCollectionObj = () => (firestore as any)._collectionObj as {
  doc: jest.Mock;
  where: jest.Mock;
  get: jest.Mock;
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('notifications service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Restore default doc set resolution
    getDocObj().set.mockResolvedValue(undefined);
  });

  // ── getNotification ───────────────────────────────────────────────────────

  describe('getNotification', () => {
    it('delegates to crud.get and returns the notification', async () => {
      const notif = makeNotification();
      (crud.get as jest.Mock).mockResolvedValue(notif);

      const result = await getNotification('n1');

      expect(crud.get).toHaveBeenCalledTimes(1);
      expect(crud.get).toHaveBeenCalledWith(expect.anything(), 'n1');
      expect((result as any).id).toBe('n1');
    });

    it('propagates errors from crud.get', async () => {
      (crud.get as jest.Mock).mockRejectedValue(new Error('Not found'));

      await expect(getNotification('n1')).rejects.toThrow('Not found');
    });
  });

  // ── getNotifications ──────────────────────────────────────────────────────

  describe('getNotifications', () => {
    it('returns notifications as an id-keyed map', async () => {
      const notifications = [
        makeNotification({ id: 'n1' } as any),
        makeNotification({ id: 'n2' } as any),
      ];
      (crud.getByAttribute as jest.Mock).mockResolvedValue(notifications);

      const result = await getNotifications('userId', 'u1');

      expect(Object.keys(result)).toHaveLength(2);
      expect(result['n1']).toBeDefined();
      expect(result['n2']).toBeDefined();
    });

    it('always uses the == operator', async () => {
      (crud.getByAttribute as jest.Mock).mockResolvedValue([]);

      await getNotifications('houseId', 'h1');

      expect(crud.getByAttribute).toHaveBeenCalledWith(
        expect.anything(),
        'houseId',
        '==',
        'h1',
      );
    });

    it('returns an empty object when no notifications match', async () => {
      (crud.getByAttribute as jest.Mock).mockResolvedValue([]);

      const result = await getNotifications('userId', 'nobody');

      expect(result).toEqual({});
    });
  });

  // ── updateNotification ────────────────────────────────────────────────────

  describe('updateNotification', () => {
    it('delegates to crud.update', async () => {
      (crud.update as jest.Mock).mockResolvedValue(undefined);

      await updateNotification('n1', { message: 'Updated' });

      expect(crud.update).toHaveBeenCalledTimes(1);
    });

    it('sets the id on values when not already present', async () => {
      (crud.update as jest.Mock).mockResolvedValue(undefined);

      await updateNotification('n1', { message: 'No id in values' });

      expect(crud.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: 'n1' }),
      );
    });

    it('preserves an existing id in values', async () => {
      (crud.update as jest.Mock).mockResolvedValue(undefined);

      await updateNotification('n1', { id: 'n1', read: true } as any);

      expect(crud.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: 'n1', read: true }),
      );
    });

    it('propagates errors from crud.update', async () => {
      (crud.update as jest.Mock).mockRejectedValue(new Error('Update error'));

      await expect(updateNotification('n1', {})).rejects.toThrow('Update error');
    });
  });

  // ── createNotification ────────────────────────────────────────────────────

  describe('createNotification', () => {
    it('delegates to crud.create', async () => {
      const notif = makeNotification();
      (crud.create as jest.Mock).mockResolvedValue(notif);

      await createNotification(notif);

      expect(crud.create).toHaveBeenCalledTimes(1);
      expect(crud.create).toHaveBeenCalledWith(expect.anything(), notif);
    });

    it('returns the created notification', async () => {
      const notif = makeNotification();
      (crud.create as jest.Mock).mockResolvedValue(notif);

      const result = await createNotification(notif);

      expect(result).toBe(notif);
    });

    it('propagates errors from crud.create', async () => {
      (crud.create as jest.Mock).mockRejectedValue(new Error('Create error'));

      await expect(createNotification(makeNotification())).rejects.toThrow('Create error');
    });
  });

  // ── deleteNotification ────────────────────────────────────────────────────

  describe('deleteNotification', () => {
    it('calls crud.deleteObject when given a Notification object', async () => {
      const notif = makeNotification();
      (crud.deleteObject as jest.Mock).mockResolvedValue(undefined);

      await deleteNotification(notif);

      expect(crud.deleteObject).toHaveBeenCalledTimes(1);
      expect(crud.deleteObject).toHaveBeenCalledWith(expect.anything(), notif);
      expect(crud.get).not.toHaveBeenCalled();
    });

    it('fetches the notification first when given a string id, then deletes', async () => {
      const notif = makeNotification();
      (crud.get as jest.Mock).mockResolvedValue(notif);
      (crud.deleteObject as jest.Mock).mockResolvedValue(undefined);

      await deleteNotification('n1');

      expect(crud.get).toHaveBeenCalledTimes(1);
      expect(crud.get).toHaveBeenCalledWith(expect.anything(), 'n1');
      expect(crud.deleteObject).toHaveBeenCalledTimes(1);
      expect(crud.deleteObject).toHaveBeenCalledWith(expect.anything(), notif);
    });

    it('propagates errors when the string-path fetch fails', async () => {
      (crud.get as jest.Mock).mockRejectedValue(new Error('Fetch error'));

      await expect(deleteNotification('n1')).rejects.toThrow('Fetch error');
    });

    it('propagates errors from crud.deleteObject', async () => {
      const notif = makeNotification();
      (crud.deleteObject as jest.Mock).mockRejectedValue(new Error('Delete error'));

      await expect(deleteNotification(notif)).rejects.toThrow('Delete error');
    });
  });

  // ── registerDeviceToken ───────────────────────────────────────────────────

  describe('registerDeviceToken', () => {
    it('calls firestore.collection("userDeviceTokens")', async () => {
      await registerDeviceToken('u1', 'device-token-abc');

      expect(firestore.collection).toHaveBeenCalledWith('userDeviceTokens');
    });

    it('calls doc(userId) on the userDeviceTokens collection', async () => {
      await registerDeviceToken('u1', 'device-token-abc');

      expect(getCollectionObj().doc).toHaveBeenCalledWith('u1');
    });

    it('calls set on the doc reference with merge: true', async () => {
      await registerDeviceToken('u1', 'device-token-abc');

      expect(getDocObj().set).toHaveBeenCalledTimes(1);
      expect(getDocObj().set).toHaveBeenCalledWith(
        expect.objectContaining({ updatedAt: expect.any(String) }),
        { merge: true },
      );
    });

    it('propagates errors from the set call', async () => {
      getDocObj().set.mockRejectedValueOnce(new Error('Set failed'));

      await expect(registerDeviceToken('u1', 'token')).rejects.toThrow('Set failed');
    });
  });

  // ── getUserNotifications ──────────────────────────────────────────────────

  describe('getUserNotifications', () => {
    it('calls crud.getByAttribute with userId == the given userId', async () => {
      (crud.getByAttribute as jest.Mock).mockResolvedValue([]);

      await getUserNotifications('u1');

      expect(crud.getByAttribute).toHaveBeenCalledWith(
        expect.anything(),
        'userId',
        '==',
        'u1',
      );
    });

    it('returns the array of notifications', async () => {
      const notifications = [makeNotification({ id: 'n1' } as any), makeNotification({ id: 'n2' } as any)];
      (crud.getByAttribute as jest.Mock).mockResolvedValue(notifications);

      const result = await getUserNotifications('u1');

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
    });

    it('returns an empty array when the user has no notifications', async () => {
      (crud.getByAttribute as jest.Mock).mockResolvedValue([]);

      const result = await getUserNotifications('u1');

      expect(result).toEqual([]);
    });
  });

  // ── markNotificationAsRead ────────────────────────────────────────────────

  describe('markNotificationAsRead', () => {
    it('calls updateNotification with the id and read: true', async () => {
      (crud.update as jest.Mock).mockResolvedValue(undefined);

      await markNotificationAsRead('n1');

      expect(crud.update).toHaveBeenCalledTimes(1);
      expect(crud.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: 'n1', read: true }),
      );
    });

    it('propagates errors from the underlying update', async () => {
      (crud.update as jest.Mock).mockRejectedValue(new Error('Update failed'));

      await expect(markNotificationAsRead('n1')).rejects.toThrow('Update failed');
    });
  });

  // ── markAllNotificationsAsRead ────────────────────────────────────────────

  describe('markAllNotificationsAsRead', () => {
    it('only updates notifications that are not yet read', async () => {
      const readNotif = makeNotification({ read: true } as any);
      (readNotif as any).id = 'n-read';
      const unreadNotif1 = makeNotification({ read: false } as any);
      (unreadNotif1 as any).id = 'n-unread-1';
      const unreadNotif2 = makeNotification({ read: false } as any);
      (unreadNotif2 as any).id = 'n-unread-2';

      (crud.getByAttribute as jest.Mock).mockResolvedValue([readNotif, unreadNotif1, unreadNotif2]);
      (crud.update as jest.Mock).mockResolvedValue(undefined);

      await markAllNotificationsAsRead('u1');

      // Only 2 unread notifications should be updated
      expect(crud.update).toHaveBeenCalledTimes(2);
    });

    it('does not call update when all notifications are already read', async () => {
      const readNotif = makeNotification({ read: true } as any);
      (crud.getByAttribute as jest.Mock).mockResolvedValue([readNotif]);
      (crud.update as jest.Mock).mockResolvedValue(undefined);

      await markAllNotificationsAsRead('u1');

      expect(crud.update).not.toHaveBeenCalled();
    });

    it('does nothing when the user has no notifications', async () => {
      (crud.getByAttribute as jest.Mock).mockResolvedValue([]);
      (crud.update as jest.Mock).mockResolvedValue(undefined);

      await markAllNotificationsAsRead('u1');

      expect(crud.update).not.toHaveBeenCalled();
    });

    it('propagates errors from getUserNotifications', async () => {
      (crud.getByAttribute as jest.Mock).mockRejectedValue(new Error('Fetch error'));

      await expect(markAllNotificationsAsRead('u1')).rejects.toThrow('Fetch error');
    });
  });
});
