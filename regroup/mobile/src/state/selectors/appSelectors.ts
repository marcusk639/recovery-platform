import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '../store';

// Memoized selector for all auth-related user state needed by App.tsx
export const selectAppUserState = createSelector(
  (state: RootState) => state.user.loggedIn,
  (state: RootState) => state.user.user,
  (state: RootState) => state.user.anonymous,
  (state: RootState) => state.user.invitation,
  (loggedIn, user, anonymous, invitation) => ({
    loggedIn,
    user,
    anonymous,
    invitation,
  }),
);

// Memoized selector for navigation-critical state
export const selectAppNavigationState = createSelector(
  (state: RootState) => state.theme.theme,
  theme => ({ theme }),
);
