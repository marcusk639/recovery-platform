import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { Notification } from '../../entities/Notification';
import * as notificationService from '../../services/notifications';

/**
 * Notifications State Interface
 */
export interface NotificationsState {
  notifications: Notification[];
  unreadCount: number;
  fcmToken: string | null; // Firebase Cloud Messaging token
  loading: boolean;
  error: string | null;
}

/**
 * Initial State
 */
const initialState: NotificationsState = {
  notifications: [],
  unreadCount: 0,
  fcmToken: null,
  loading: false,
  error: null,
};

/**
 * Async Thunks
 */

/**
 * Register device for push notifications
 */
export const registerDevice = createAsyncThunk(
  'notifications/registerDevice',
  async ({ userId, token }: { userId: string; token: string }) => {
    await notificationService.registerDeviceToken(userId, token);
    return token;
  }
);

/**
 * Fetch user notifications
 */
export const fetchNotifications = createAsyncThunk(
  'notifications/fetchNotifications',
  async (userId: string) => {
    const notifications = await notificationService.getUserNotifications(userId);
    return notifications;
  }
);

/**
 * Mark notification as read
 */
export const markAsRead = createAsyncThunk(
  'notifications/markAsRead',
  async (notificationId: string) => {
    await notificationService.markNotificationAsRead(notificationId);
    return notificationId;
  }
);

/**
 * Mark all notifications as read
 */
export const markAllAsRead = createAsyncThunk(
  'notifications/markAllAsRead',
  async (userId: string) => {
    await notificationService.markAllNotificationsAsRead(userId);
  }
);

/**
 * Delete notification
 */
export const deleteNotification = createAsyncThunk(
  'notifications/deleteNotification',
  async (notificationId: string) => {
    await notificationService.deleteNotification(notificationId);
    return notificationId;
  }
);

/**
 * Notifications Slice
 */
const notificationsSlice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    // Set FCM token
    setFcmToken: (state, action: PayloadAction<string>) => {
      state.fcmToken = action.payload;
    },

    // Add notification (e.g., from real-time listener)
    addNotification: (state, action: PayloadAction<Notification>) => {
      state.notifications.unshift(action.payload);
      if (!action.payload.read) {
        state.unreadCount += 1;
      }
    },

    // Update notification
    updateNotification: (
      state,
      action: PayloadAction<{ id: string; updates: Partial<Notification> }>
    ) => {
      const { id, updates } = action.payload;
      const index = state.notifications.findIndex((n) => n.id === id);

      if (index !== -1) {
        const wasUnread = !state.notifications[index].read;
        state.notifications[index] = { ...state.notifications[index], ...updates };

        // Update unread count if read status changed
        if (wasUnread && updates.read) {
          state.unreadCount = Math.max(0, state.unreadCount - 1);
        } else if (!wasUnread && updates.read === false) {
          state.unreadCount += 1;
        }
      }
    },

    // Remove notification
    removeNotification: (state, action: PayloadAction<string>) => {
      const index = state.notifications.findIndex((n) => n.id === action.payload);
      if (index !== -1) {
        if (!state.notifications[index].read) {
          state.unreadCount = Math.max(0, state.unreadCount - 1);
        }
        state.notifications.splice(index, 1);
      }
    },

    // Clear all notifications
    clearAllNotifications: (state) => {
      state.notifications = [];
      state.unreadCount = 0;
    },

    // Clear error
    clearError: (state) => {
      state.error = null;
    },

    // Reset notifications state
    resetNotificationsState: () => initialState,
  },
  extraReducers: (builder) => {
    // Register Device
    builder
      .addCase(registerDevice.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(registerDevice.fulfilled, (state, action) => {
        state.loading = false;
        state.fcmToken = action.payload;
      })
      .addCase(registerDevice.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to register device';
      });

    // Fetch Notifications
    builder
      .addCase(fetchNotifications.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchNotifications.fulfilled, (state, action) => {
        state.loading = false;
        state.notifications = action.payload;
        state.unreadCount = action.payload.filter((n) => !n.read).length;
      })
      .addCase(fetchNotifications.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch notifications';
      });

    // Mark As Read
    builder
      .addCase(markAsRead.fulfilled, (state, action) => {
        const notificationId = action.payload;
        const notification = state.notifications.find((n) => n.id === notificationId);

        if (notification && !notification.read) {
          notification.read = true;
          state.unreadCount = Math.max(0, state.unreadCount - 1);
        }
      })
      .addCase(markAsRead.rejected, (state, action) => {
        state.error = action.error.message || 'Failed to mark notification as read';
      });

    // Mark All As Read
    builder
      .addCase(markAllAsRead.fulfilled, (state) => {
        state.notifications.forEach((n) => {
          n.read = true;
        });
        state.unreadCount = 0;
      })
      .addCase(markAllAsRead.rejected, (state, action) => {
        state.error = action.error.message || 'Failed to mark all notifications as read';
      });

    // Delete Notification
    builder
      .addCase(deleteNotification.fulfilled, (state, action) => {
        const notificationId = action.payload;
        const index = state.notifications.findIndex((n) => n.id === notificationId);

        if (index !== -1) {
          if (!state.notifications[index].read) {
            state.unreadCount = Math.max(0, state.unreadCount - 1);
          }
          state.notifications.splice(index, 1);
        }
      })
      .addCase(deleteNotification.rejected, (state, action) => {
        state.error = action.error.message || 'Failed to delete notification';
      });
  },
});

/**
 * Actions
 */
export const {
  setFcmToken,
  addNotification,
  updateNotification,
  removeNotification,
  clearAllNotifications,
  clearError,
  resetNotificationsState,
} = notificationsSlice.actions;

/**
 * Selectors
 */
export const selectAllNotifications = (state: { notifications: NotificationsState }) =>
  state.notifications.notifications;
export const selectUnreadNotifications = (state: { notifications: NotificationsState }) =>
  state.notifications.notifications.filter((n) => !n.read);
export const selectUnreadCount = (state: { notifications: NotificationsState }) =>
  state.notifications.unreadCount;
export const selectFcmToken = (state: { notifications: NotificationsState }) =>
  state.notifications.fcmToken;
export const selectNotificationsLoading = (state: { notifications: NotificationsState }) =>
  state.notifications.loading;
export const selectNotificationsError = (state: { notifications: NotificationsState }) =>
  state.notifications.error;

/**
 * Reducer
 */
export default notificationsSlice.reducer;
