import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { User } from '../../entities/User';
import { Invitation } from '../../entities/Invite';

/**
 * Auth Slice - Authentication state
 *
 * Manages the current authenticated user and auth-related state:
 * - Current user object
 * - Login status
 * - Anonymous user state
 * - Invitation (for deep linking)
 * - Auth token
 */

interface AuthState {
  loggedIn: boolean;
  user: User | null;
  anonymous: boolean;
  invitation: Invitation | null;
  token: any | null;
  loggingIn: boolean;
  loggingOut: boolean;
  loginFailed: boolean;
  error: any | null;
}

const initialState: AuthState = {
  loggedIn: false,
  user: null,
  anonymous: false,
  invitation: null,
  token: null,
  loggingIn: false,
  loggingOut: false,
  loginFailed: false,
  error: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    // Login actions
    loginStart: (state) => {
      state.loggingIn = true;
      state.loginFailed = false;
      state.error = null;
    },
    loginSuccess: (
      state,
      action: PayloadAction<{ user: User; token: any; anonymous?: boolean }>,
    ) => {
      state.loggedIn = true;
      state.user = action.payload.user;
      state.token = action.payload.token;
      state.anonymous = action.payload.anonymous || false;
      state.loggingIn = false;
      state.loginFailed = false;
      state.error = null;
    },
    loginFailure: (state, action: PayloadAction<any>) => {
      state.loggedIn = false;
      state.loggingIn = false;
      state.loginFailed = true;
      state.error = action.payload;
    },

    // Logout actions
    logoutStart: (state) => {
      state.loggingOut = true;
    },
    logoutSuccess: (state) => {
      state.loggedIn = false;
      state.user = null;
      state.token = null;
      state.anonymous = false;
      state.invitation = null;
      state.loggingOut = false;
      state.error = null;
    },

    // User update (for profile changes)
    updateUser: (state, action: PayloadAction<Partial<User>>) => {
      if (state.user) {
        state.user = { ...state.user, ...action.payload };
      }
    },

    // Invitation (for deep linking)
    setInvitation: (state, action: PayloadAction<Invitation | null>) => {
      state.invitation = action.payload;
    },

    // Token update
    setToken: (state, action: PayloadAction<any>) => {
      state.token = action.payload;
    },

    // Clear error
    clearAuthError: (state) => {
      state.error = null;
      state.loginFailed = false;
    },
  },
});

export const {
  loginStart,
  loginSuccess,
  loginFailure,
  logoutStart,
  logoutSuccess,
  updateUser,
  setInvitation,
  setToken,
  clearAuthError,
} = authSlice.actions;

export default authSlice.reducer;
