import { configureStore } from "@reduxjs/toolkit";
import { useDispatch, useSelector, TypedUseSelectorHook } from "react-redux";

// New RTK slices
import authReducer from "./slices/authSlice";
import themeReducer from "./slices/themeSlice";
import userReducer from "./slices/userSlice";
import housesReducer from "./slices/housesSlice";
import guestsReducer from "./slices/guestsSlice";
import meetingsReducer from "./slices/meetingsSlice";
import adminReducer from "./slices/adminSlice";
import chatReducer from "./slices/chatSlice";
import setupReducer from "./slices/setupSlice";
import notificationsReducer from "./slices/notificationsSlice";

/**
 * Redux Toolkit Store Configuration
 *
 * ✅ Phase 2 Complete: Full Redux Toolkit Migration
 *
 * State Management Architecture:
 * - UI state → RTK slices (auth, theme)
 * - Entity state → RTK slices with async thunks (user, houses, guests, meetings, admin)
 * - Feature state → RTK slices (chat, setup, cache, notifications, reports)
 * - Server data fetching → React Query hooks (activities, disputes)
 *
 * All 45 active screens migrated to RTK ✅
 * Old Redux infrastructure removed ✅
 * Type-safe with no 'as any' casts ✅
 */
export const store = configureStore({
  reducer: {
    // --- NEW RTK SLICES (Primary State Management) ---

    // UI & App State
    auth: authReducer,
    theme: themeReducer,

    // Entity Management (with async thunks)
    user: userReducer,
    houses: housesReducer,
    guests: guestsReducer,
    meetings: meetingsReducer,
    admin: adminReducer,

    // Feature State
    chat: chatReducer,
    setup: setupReducer,
    notifications: notificationsReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore Firebase timestamps and other non-serializable values
        ignoredActions: [
          "auth/loginSuccess",
          "auth/setToken",
          "user/login/fulfilled",
          "houses/getHouses/fulfilled",
          "guests/getGuests/fulfilled",
        ],
        ignoredPaths: [
          "auth.token",
          "auth.user.createdAt",
          "auth.user.updatedAt",
          "user.user.createdAt",
          "user.user.updatedAt",
          "guests.guests",
          "houses.houses",
        ],
      },
    }),
  devTools: __DEV__, // Enable Redux DevTools in development
});

// Export types for TypeScript
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Export typed hooks
export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

export default store;
