import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { Notification } from "../../entities/Notification";

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
 * Notifications Slice
 */
const notificationsSlice = createSlice({
  name: "notifications",
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
      action: PayloadAction<{ id: string; updates: Partial<Notification> }>,
    ) => {
      const { id, updates } = action.payload;
      const index = state.notifications.findIndex((n) => n.id === id);

      if (index !== -1) {
        const wasUnread = !state.notifications[index].read;
        state.notifications[index] = {
          ...state.notifications[index],
          ...updates,
        };

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
      const index = state.notifications.findIndex(
        (n) => n.id === action.payload,
      );
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
export const selectAllNotifications = (state: {
  notifications: NotificationsState;
}) => state.notifications.notifications;
export const selectUnreadNotifications = (state: {
  notifications: NotificationsState;
}) => state.notifications.notifications.filter((n) => !n.read);
export const selectUnreadCount = (state: {
  notifications: NotificationsState;
}) => state.notifications.unreadCount;
export const selectFcmToken = (state: { notifications: NotificationsState }) =>
  state.notifications.fcmToken;
export const selectNotificationsLoading = (state: {
  notifications: NotificationsState;
}) => state.notifications.loading;
export const selectNotificationsError = (state: {
  notifications: NotificationsState;
}) => state.notifications.error;

/**
 * Reducer
 */
export default notificationsSlice.reducer;
