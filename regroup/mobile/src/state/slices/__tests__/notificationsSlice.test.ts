// src/state/slices/__tests__/notificationsSlice.test.ts

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

// Mock the notifications service so async thunks don't touch Firebase
jest.mock('../../../services/notifications', () => ({
  registerDeviceToken: jest.fn(),
  getUserNotifications: jest.fn(),
  markNotificationAsRead: jest.fn(),
  markAllNotificationsAsRead: jest.fn(),
  deleteNotification: jest.fn(),
  notificationCollection: {},
}));

import { configureStore } from '@reduxjs/toolkit';
import notificationsReducer, {
  setFcmToken,
  addNotification,
  updateNotification,
  removeNotification,
  clearAllNotifications,
  clearError,
  resetNotificationsState,
  registerDevice,
  fetchNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  selectAllNotifications,
  selectUnreadNotifications,
  selectUnreadCount,
  selectFcmToken,
  selectNotificationsLoading,
  selectNotificationsError,
  NotificationsState,
} from '../notificationsSlice';
import * as notificationService from '../../../services/notifications';
import { Notification } from '../../../entities/Notification';

/**
 * Build a minimal plain-object Notification without triggering the class constructor.
 */
const makeNotification = (id = 'n1', read = false): Notification =>
  ({
    id,
    userId: 'u1',
    guestId: '',
    houseId: 'h1',
    adminIds: [],
    superAdminId: '',
    message: 'Test notification',
    subject: 'Test',
    date: '2024-01-01',
    type: 'dispute' as const,
    read,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  } as Notification);

const makeStore = () =>
  configureStore({ reducer: { notifications: notificationsReducer } });

describe('notificationsSlice', () => {
  const initialState = notificationsReducer(undefined, { type: '@@INIT' });

  // ---------------------------------------------------------------------------
  // Initial State
  // ---------------------------------------------------------------------------
  describe('Initial State', () => {
    it('returns the correct initial state shape', () => {
      expect(initialState.notifications).toEqual([]);
      expect(initialState.unreadCount).toBe(0);
      expect(initialState.fcmToken).toBeNull();
      expect(initialState.loading).toBe(false);
      expect(initialState.error).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Synchronous reducers
  // ---------------------------------------------------------------------------
  describe('setFcmToken', () => {
    it('sets the fcmToken', () => {
      const state = notificationsReducer(initialState, setFcmToken('my-token'));
      expect(state.fcmToken).toBe('my-token');
    });

    it('replaces an existing fcmToken', () => {
      const s = { ...initialState, fcmToken: 'old-token' };
      const state = notificationsReducer(s, setFcmToken('new-token'));
      expect(state.fcmToken).toBe('new-token');
    });
  });

  describe('addNotification', () => {
    it('prepends an unread notification and increments unreadCount', () => {
      const n = makeNotification('n1', false);
      const state = notificationsReducer(initialState, addNotification(n));
      expect(state.notifications).toHaveLength(1);
      expect(state.notifications[0].id).toBe('n1');
      expect(state.unreadCount).toBe(1);
    });

    it('prepends a read notification without changing unreadCount', () => {
      const n = makeNotification('n1', true);
      const state = notificationsReducer(initialState, addNotification(n));
      expect(state.notifications).toHaveLength(1);
      expect(state.unreadCount).toBe(0);
    });

    it('inserts new notifications at the front (unshift)', () => {
      const n1 = makeNotification('n1', false);
      const stateWithN1 = { ...initialState, notifications: [n1], unreadCount: 1 };
      const n2 = makeNotification('n2', false);
      const state = notificationsReducer(stateWithN1, addNotification(n2));
      expect(state.notifications[0].id).toBe('n2');
      expect(state.notifications[1].id).toBe('n1');
      expect(state.unreadCount).toBe(2);
    });
  });

  describe('updateNotification', () => {
    it('updates the matching notification by id', () => {
      const n = makeNotification('n1', false);
      const s = { ...initialState, notifications: [n], unreadCount: 1 };
      const state = notificationsReducer(
        s,
        updateNotification({ id: 'n1', updates: { message: 'Updated' } }),
      );
      expect(state.notifications[0].message).toBe('Updated');
    });

    it('decrements unreadCount when marking notification as read', () => {
      const n = makeNotification('n1', false);
      const s = { ...initialState, notifications: [n], unreadCount: 1 };
      const state = notificationsReducer(
        s,
        updateNotification({ id: 'n1', updates: { read: true } }),
      );
      expect(state.notifications[0].read).toBe(true);
      expect(state.unreadCount).toBe(0);
    });

    it('increments unreadCount when marking a read notification as unread', () => {
      const n = makeNotification('n1', true);
      const s = { ...initialState, notifications: [n], unreadCount: 0 };
      const state = notificationsReducer(
        s,
        updateNotification({ id: 'n1', updates: { read: false } }),
      );
      expect(state.unreadCount).toBe(1);
    });

    it('does nothing when id is not found', () => {
      const n = makeNotification('n1', false);
      const s = { ...initialState, notifications: [n], unreadCount: 1 };
      const state = notificationsReducer(
        s,
        updateNotification({ id: 'nonexistent', updates: { message: 'x' } }),
      );
      expect(state.notifications[0].message).toBe('Test notification');
      expect(state.unreadCount).toBe(1);
    });
  });

  describe('removeNotification', () => {
    it('removes the matching notification', () => {
      const n1 = makeNotification('n1', false);
      const n2 = makeNotification('n2', false);
      const s = { ...initialState, notifications: [n1, n2], unreadCount: 2 };
      const state = notificationsReducer(s, removeNotification('n1'));
      expect(state.notifications).toHaveLength(1);
      expect(state.notifications[0].id).toBe('n2');
    });

    it('decrements unreadCount when removing an unread notification', () => {
      const n = makeNotification('n1', false);
      const s = { ...initialState, notifications: [n], unreadCount: 1 };
      const state = notificationsReducer(s, removeNotification('n1'));
      expect(state.unreadCount).toBe(0);
    });

    it('does not change unreadCount when removing a read notification', () => {
      const n = makeNotification('n1', true);
      const s = { ...initialState, notifications: [n], unreadCount: 0 };
      const state = notificationsReducer(s, removeNotification('n1'));
      expect(state.unreadCount).toBe(0);
    });

    it('does nothing when id is not found', () => {
      const n = makeNotification('n1', false);
      const s = { ...initialState, notifications: [n], unreadCount: 1 };
      const state = notificationsReducer(s, removeNotification('nonexistent'));
      expect(state.notifications).toHaveLength(1);
      expect(state.unreadCount).toBe(1);
    });

    it('does not allow unreadCount to go below 0', () => {
      // Edge case: if state is somehow inconsistent (unreadCount=0, unread notification)
      const n = makeNotification('n1', false);
      const s = { ...initialState, notifications: [n], unreadCount: 0 };
      const state = notificationsReducer(s, removeNotification('n1'));
      expect(state.unreadCount).toBe(0);
    });
  });

  describe('clearAllNotifications', () => {
    it('clears all notifications and resets unreadCount', () => {
      const s = {
        ...initialState,
        notifications: [makeNotification('n1', false), makeNotification('n2', true)],
        unreadCount: 1,
      };
      const state = notificationsReducer(s, clearAllNotifications());
      expect(state.notifications).toEqual([]);
      expect(state.unreadCount).toBe(0);
    });

    it('is a no-op when notifications is already empty', () => {
      const state = notificationsReducer(initialState, clearAllNotifications());
      expect(state.notifications).toEqual([]);
      expect(state.unreadCount).toBe(0);
    });
  });

  describe('clearError', () => {
    it('clears the error', () => {
      const s = { ...initialState, error: 'oops' };
      const state = notificationsReducer(s, clearError());
      expect(state.error).toBeNull();
    });

    it('is a no-op when there is no error', () => {
      const state = notificationsReducer(initialState, clearError());
      expect(state.error).toBeNull();
    });
  });

  describe('resetNotificationsState', () => {
    it('resets the entire state to initial values', () => {
      const dirtyState: NotificationsState = {
        notifications: [makeNotification('n1', false)],
        unreadCount: 1,
        fcmToken: 'some-token',
        loading: true,
        error: 'some error',
      };
      const state = notificationsReducer(dirtyState, resetNotificationsState());
      expect(state).toEqual(initialState);
    });
  });

  // ---------------------------------------------------------------------------
  // Async thunks — registerDevice
  // ---------------------------------------------------------------------------
  describe('registerDevice thunk', () => {
    it('sets loading=true on pending', () => {
      const state = notificationsReducer(
        initialState,
        registerDevice.pending('', { userId: 'u1', token: 'tok' }),
      );
      expect(state.loading).toBe(true);
      expect(state.error).toBeNull();
    });

    it('stores the token and sets loading=false on fulfilled', () => {
      const action = registerDevice.fulfilled('tok', '', { userId: 'u1', token: 'tok' });
      const state = notificationsReducer(initialState, action);
      expect(state.loading).toBe(false);
      expect(state.fcmToken).toBe('tok');
    });

    it('sets error on rejected', () => {
      const action = registerDevice.rejected(
        new Error('Register failed'),
        '',
        { userId: 'u1', token: 'tok' },
      );
      const state = notificationsReducer(initialState, action);
      expect(state.loading).toBe(false);
      expect(state.error).toBe('Register failed');
    });

    it('dispatches registerDevice and updates store via real store', async () => {
      (notificationService.registerDeviceToken as jest.Mock).mockResolvedValueOnce(undefined);
      const store = makeStore();
      await store.dispatch(registerDevice({ userId: 'u1', token: 'my-fcm-token' }));
      expect(store.getState().notifications.fcmToken).toBe('my-fcm-token');
    });
  });

  // ---------------------------------------------------------------------------
  // Async thunks — fetchNotifications
  // ---------------------------------------------------------------------------
  describe('fetchNotifications thunk', () => {
    it('sets loading=true on pending', () => {
      const state = notificationsReducer(initialState, fetchNotifications.pending('', 'u1'));
      expect(state.loading).toBe(true);
    });

    it('populates notifications and computes unreadCount on fulfilled', () => {
      const unread = makeNotification('n1', false);
      const read = makeNotification('n2', true);
      const action = fetchNotifications.fulfilled([unread, read], '', 'u1');
      const state = notificationsReducer(initialState, action);
      expect(state.loading).toBe(false);
      expect(state.notifications).toHaveLength(2);
      expect(state.unreadCount).toBe(1);
    });

    it('sets unreadCount=0 when all notifications are read', () => {
      const n1 = makeNotification('n1', true);
      const n2 = makeNotification('n2', true);
      const action = fetchNotifications.fulfilled([n1, n2], '', 'u1');
      const state = notificationsReducer(initialState, action);
      expect(state.unreadCount).toBe(0);
    });

    it('sets error on rejected', () => {
      const action = fetchNotifications.rejected(new Error('Fetch failed'), '', 'u1');
      const state = notificationsReducer(initialState, action);
      expect(state.loading).toBe(false);
      expect(state.error).toBe('Fetch failed');
    });

    it('dispatches fetchNotifications and updates store via real store', async () => {
      const notifications = [makeNotification('n1', false)];
      (notificationService.getUserNotifications as jest.Mock).mockResolvedValueOnce(notifications);
      const store = makeStore();
      await store.dispatch(fetchNotifications('u1'));
      expect(store.getState().notifications.notifications).toHaveLength(1);
      expect(store.getState().notifications.unreadCount).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Async thunks — markAsRead
  // ---------------------------------------------------------------------------
  describe('markAsRead thunk', () => {
    it('marks the notification as read and decrements unreadCount on fulfilled', () => {
      const n = makeNotification('n1', false);
      const s = { ...initialState, notifications: [n], unreadCount: 1 };
      const action = markAsRead.fulfilled('n1', '', 'n1');
      const state = notificationsReducer(s, action);
      expect(state.notifications[0].read).toBe(true);
      expect(state.unreadCount).toBe(0);
    });

    it('does not change an already-read notification or decrement unreadCount', () => {
      const n = makeNotification('n1', true);
      const s = { ...initialState, notifications: [n], unreadCount: 0 };
      const action = markAsRead.fulfilled('n1', '', 'n1');
      const state = notificationsReducer(s, action);
      expect(state.notifications[0].read).toBe(true);
      expect(state.unreadCount).toBe(0);
    });

    it('sets error on rejected', () => {
      const action = markAsRead.rejected(new Error('Mark failed'), '', 'n1');
      const state = notificationsReducer(initialState, action);
      expect(state.error).toBe('Mark failed');
    });

    it('dispatches markAsRead and updates store via real store', async () => {
      (notificationService.markNotificationAsRead as jest.Mock).mockResolvedValueOnce(undefined);
      const notifications = [makeNotification('n1', false)];
      const store = configureStore({
        reducer: { notifications: notificationsReducer } as any,
        preloadedState: { notifications: { ...initialState, notifications, unreadCount: 1 } } as any,
      });
      await store.dispatch(markAsRead('n1'));
      expect(store.getState().notifications.notifications[0].read).toBe(true);
      expect(store.getState().notifications.unreadCount).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Async thunks — markAllAsRead
  // ---------------------------------------------------------------------------
  describe('markAllAsRead thunk', () => {
    it('marks all notifications as read and sets unreadCount=0 on fulfilled', () => {
      const n1 = makeNotification('n1', false);
      const n2 = makeNotification('n2', false);
      const s = { ...initialState, notifications: [n1, n2], unreadCount: 2 };
      const action = markAllAsRead.fulfilled(undefined, '', 'u1');
      const state = notificationsReducer(s, action);
      expect(state.notifications.every(n => n.read)).toBe(true);
      expect(state.unreadCount).toBe(0);
    });

    it('sets error on rejected', () => {
      const action = markAllAsRead.rejected(new Error('Mark all failed'), '', 'u1');
      const state = notificationsReducer(initialState, action);
      expect(state.error).toBe('Mark all failed');
    });

    it('dispatches markAllAsRead and updates store via real store', async () => {
      (notificationService.markAllNotificationsAsRead as jest.Mock).mockResolvedValueOnce(undefined);
      const notifications = [makeNotification('n1', false), makeNotification('n2', false)];
      const store = configureStore({
        reducer: { notifications: notificationsReducer } as any,
        preloadedState: { notifications: { ...initialState, notifications, unreadCount: 2 } } as any,
      });
      await store.dispatch(markAllAsRead('u1'));
      const s = store.getState().notifications;
      expect(s.notifications.every((n: any) => n.read)).toBe(true);
      expect(s.unreadCount).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Async thunks — deleteNotification
  // ---------------------------------------------------------------------------
  describe('deleteNotification thunk', () => {
    it('removes the notification on fulfilled', () => {
      const n1 = makeNotification('n1', false);
      const n2 = makeNotification('n2', false);
      const s = { ...initialState, notifications: [n1, n2], unreadCount: 2 };
      const action = deleteNotification.fulfilled('n1', '', 'n1');
      const state = notificationsReducer(s, action);
      expect(state.notifications).toHaveLength(1);
      expect(state.notifications[0].id).toBe('n2');
      expect(state.unreadCount).toBe(1);
    });

    it('does not decrement unreadCount when deleting a read notification', () => {
      const n = makeNotification('n1', true);
      const s = { ...initialState, notifications: [n], unreadCount: 0 };
      const action = deleteNotification.fulfilled('n1', '', 'n1');
      const state = notificationsReducer(s, action);
      expect(state.notifications).toHaveLength(0);
      expect(state.unreadCount).toBe(0);
    });

    it('sets error on rejected', () => {
      const action = deleteNotification.rejected(new Error('Delete failed'), '', 'n1');
      const state = notificationsReducer(initialState, action);
      expect(state.error).toBe('Delete failed');
    });

    it('dispatches deleteNotification and removes from store via real store', async () => {
      (notificationService.deleteNotification as jest.Mock).mockResolvedValueOnce(undefined);
      const notifications = [makeNotification('n1', true)];
      const store = configureStore({
        reducer: { notifications: notificationsReducer } as any,
        preloadedState: { notifications: { ...initialState, notifications, unreadCount: 0 } } as any,
      });
      await store.dispatch(deleteNotification('n1'));
      expect(store.getState().notifications.notifications).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Selectors
  // ---------------------------------------------------------------------------
  describe('selectors', () => {
    const n1 = makeNotification('n1', false);
    const n2 = makeNotification('n2', true);
    const storeState = {
      notifications: {
        notifications: [n1, n2],
        unreadCount: 1,
        fcmToken: 'test-token',
        loading: true,
        error: 'err',
      } as NotificationsState,
    };

    it('selectAllNotifications returns all notifications', () => {
      expect(selectAllNotifications(storeState)).toHaveLength(2);
    });

    it('selectUnreadNotifications returns only unread notifications', () => {
      const unread = selectUnreadNotifications(storeState);
      expect(unread).toHaveLength(1);
      expect(unread[0].id).toBe('n1');
    });

    it('selectUnreadCount returns the unread count', () => {
      expect(selectUnreadCount(storeState)).toBe(1);
    });

    it('selectFcmToken returns the fcmToken', () => {
      expect(selectFcmToken(storeState)).toBe('test-token');
    });

    it('selectNotificationsLoading returns loading flag', () => {
      expect(selectNotificationsLoading(storeState)).toBe(true);
    });

    it('selectNotificationsError returns error', () => {
      expect(selectNotificationsError(storeState)).toBe('err');
    });
  });
});
