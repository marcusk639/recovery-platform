// src/state/slices/__tests__/notificationsSlice.test.ts

import { configureStore } from "@reduxjs/toolkit";
import notificationsReducer, {
  setFcmToken,
  addNotification,
  updateNotification,
  removeNotification,
  clearAllNotifications,
  clearError,
  resetNotificationsState,
  selectAllNotifications,
  selectUnreadNotifications,
  selectUnreadCount,
  selectFcmToken,
  selectNotificationsLoading,
  selectNotificationsError,
  NotificationsState,
} from "../notificationsSlice";
import { Notification } from "../../../entities/Notification";

/**
 * Build a minimal plain-object Notification without triggering the class constructor.
 */
const makeNotification = (id = "n1", read = false): Notification =>
  ({
    id,
    userId: "u1",
    guestId: "",
    houseId: "h1",
    adminIds: [],
    superAdminId: "",
    message: "Test notification",
    subject: "Test",
    date: "2024-01-01",
    type: "dispute" as const,
    read,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  } as Notification);

const makeStore = () =>
  configureStore({ reducer: { notifications: notificationsReducer } });

describe("notificationsSlice", () => {
  const initialState = notificationsReducer(undefined, { type: "@@INIT" });

  // ---------------------------------------------------------------------------
  // Initial State
  // ---------------------------------------------------------------------------
  describe("Initial State", () => {
    it("returns the correct initial state shape", () => {
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
  describe("setFcmToken", () => {
    it("sets the fcmToken", () => {
      const state = notificationsReducer(initialState, setFcmToken("my-token"));
      expect(state.fcmToken).toBe("my-token");
    });

    it("replaces an existing fcmToken", () => {
      const s = { ...initialState, fcmToken: "old-token" };
      const state = notificationsReducer(s, setFcmToken("new-token"));
      expect(state.fcmToken).toBe("new-token");
    });
  });

  describe("addNotification", () => {
    it("prepends an unread notification and increments unreadCount", () => {
      const n = makeNotification("n1", false);
      const state = notificationsReducer(initialState, addNotification(n));
      expect(state.notifications).toHaveLength(1);
      expect(state.notifications[0].id).toBe("n1");
      expect(state.unreadCount).toBe(1);
    });

    it("prepends a read notification without changing unreadCount", () => {
      const n = makeNotification("n1", true);
      const state = notificationsReducer(initialState, addNotification(n));
      expect(state.notifications).toHaveLength(1);
      expect(state.unreadCount).toBe(0);
    });

    it("inserts new notifications at the front (unshift)", () => {
      const n1 = makeNotification("n1", false);
      const stateWithN1 = {
        ...initialState,
        notifications: [n1],
        unreadCount: 1,
      };
      const n2 = makeNotification("n2", false);
      const state = notificationsReducer(stateWithN1, addNotification(n2));
      expect(state.notifications[0].id).toBe("n2");
      expect(state.notifications[1].id).toBe("n1");
      expect(state.unreadCount).toBe(2);
    });
  });

  describe("updateNotification", () => {
    it("updates the matching notification by id", () => {
      const n = makeNotification("n1", false);
      const s = { ...initialState, notifications: [n], unreadCount: 1 };
      const state = notificationsReducer(
        s,
        updateNotification({ id: "n1", updates: { message: "Updated" } })
      );
      expect(state.notifications[0].message).toBe("Updated");
    });

    it("decrements unreadCount when marking notification as read", () => {
      const n = makeNotification("n1", false);
      const s = { ...initialState, notifications: [n], unreadCount: 1 };
      const state = notificationsReducer(
        s,
        updateNotification({ id: "n1", updates: { read: true } })
      );
      expect(state.notifications[0].read).toBe(true);
      expect(state.unreadCount).toBe(0);
    });

    it("increments unreadCount when marking a read notification as unread", () => {
      const n = makeNotification("n1", true);
      const s = { ...initialState, notifications: [n], unreadCount: 0 };
      const state = notificationsReducer(
        s,
        updateNotification({ id: "n1", updates: { read: false } })
      );
      expect(state.unreadCount).toBe(1);
    });

    it("does nothing when id is not found", () => {
      const n = makeNotification("n1", false);
      const s = { ...initialState, notifications: [n], unreadCount: 1 };
      const state = notificationsReducer(
        s,
        updateNotification({ id: "nonexistent", updates: { message: "x" } })
      );
      expect(state.notifications[0].message).toBe("Test notification");
      expect(state.unreadCount).toBe(1);
    });
  });

  describe("removeNotification", () => {
    it("removes the matching notification", () => {
      const n1 = makeNotification("n1", false);
      const n2 = makeNotification("n2", false);
      const s = { ...initialState, notifications: [n1, n2], unreadCount: 2 };
      const state = notificationsReducer(s, removeNotification("n1"));
      expect(state.notifications).toHaveLength(1);
      expect(state.notifications[0].id).toBe("n2");
    });

    it("decrements unreadCount when removing an unread notification", () => {
      const n = makeNotification("n1", false);
      const s = { ...initialState, notifications: [n], unreadCount: 1 };
      const state = notificationsReducer(s, removeNotification("n1"));
      expect(state.unreadCount).toBe(0);
    });

    it("does not change unreadCount when removing a read notification", () => {
      const n = makeNotification("n1", true);
      const s = { ...initialState, notifications: [n], unreadCount: 0 };
      const state = notificationsReducer(s, removeNotification("n1"));
      expect(state.unreadCount).toBe(0);
    });

    it("does nothing when id is not found", () => {
      const n = makeNotification("n1", false);
      const s = { ...initialState, notifications: [n], unreadCount: 1 };
      const state = notificationsReducer(s, removeNotification("nonexistent"));
      expect(state.notifications).toHaveLength(1);
      expect(state.unreadCount).toBe(1);
    });

    it("does not allow unreadCount to go below 0", () => {
      // Edge case: if state is somehow inconsistent (unreadCount=0, unread notification)
      const n = makeNotification("n1", false);
      const s = { ...initialState, notifications: [n], unreadCount: 0 };
      const state = notificationsReducer(s, removeNotification("n1"));
      expect(state.unreadCount).toBe(0);
    });
  });

  describe("clearAllNotifications", () => {
    it("clears all notifications and resets unreadCount", () => {
      const s = {
        ...initialState,
        notifications: [
          makeNotification("n1", false),
          makeNotification("n2", true),
        ],
        unreadCount: 1,
      };
      const state = notificationsReducer(s, clearAllNotifications());
      expect(state.notifications).toEqual([]);
      expect(state.unreadCount).toBe(0);
    });

    it("is a no-op when notifications is already empty", () => {
      const state = notificationsReducer(initialState, clearAllNotifications());
      expect(state.notifications).toEqual([]);
      expect(state.unreadCount).toBe(0);
    });
  });

  describe("clearError", () => {
    it("clears the error", () => {
      const s = { ...initialState, error: "oops" };
      const state = notificationsReducer(s, clearError());
      expect(state.error).toBeNull();
    });

    it("is a no-op when there is no error", () => {
      const state = notificationsReducer(initialState, clearError());
      expect(state.error).toBeNull();
    });
  });

  describe("resetNotificationsState", () => {
    it("resets the entire state to initial values", () => {
      const dirtyState: NotificationsState = {
        notifications: [makeNotification("n1", false)],
        unreadCount: 1,
        fcmToken: "some-token",
        loading: true,
        error: "some error",
      };
      const state = notificationsReducer(dirtyState, resetNotificationsState());
      expect(state).toEqual(initialState);
    });
  });

  describe("selectors", () => {
    const n1 = makeNotification("n1", false);
    const n2 = makeNotification("n2", true);
    const storeState = {
      notifications: {
        notifications: [n1, n2],
        unreadCount: 1,
        fcmToken: "test-token",
        loading: true,
        error: "err",
      } as NotificationsState,
    };

    it("selectAllNotifications returns all notifications", () => {
      expect(selectAllNotifications(storeState)).toHaveLength(2);
    });

    it("selectUnreadNotifications returns only unread notifications", () => {
      const unread = selectUnreadNotifications(storeState);
      expect(unread).toHaveLength(1);
      expect(unread[0].id).toBe("n1");
    });

    it("selectUnreadCount returns the unread count", () => {
      expect(selectUnreadCount(storeState)).toBe(1);
    });

    it("selectFcmToken returns the fcmToken", () => {
      expect(selectFcmToken(storeState)).toBe("test-token");
    });

    it("selectNotificationsLoading returns loading flag", () => {
      expect(selectNotificationsLoading(storeState)).toBe(true);
    });

    it("selectNotificationsError returns error", () => {
      expect(selectNotificationsError(storeState)).toBe("err");
    });
  });
});
