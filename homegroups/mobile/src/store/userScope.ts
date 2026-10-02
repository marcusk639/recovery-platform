import type {ActionReducerMapBuilder, AnyAction} from '@reduxjs/toolkit';

/**
 * `authSlice.setUser`, matched by type rather than imported.
 *
 * Importing the action creator would pull authSlice — and through it the
 * Firebase config, models and everything they touch — into every user-scoped
 * slice, which broke unrelated slice tests that had no reason to stub Firebase.
 * Matching the string keeps these slices independent of authSlice.
 *
 * The string could drift if the action is renamed, so userScope.test.ts asserts
 * it still equals `setUser.type`. That test is the reason this is safe.
 */
export const USER_CHANGED_ACTION = 'auth/setUser';

interface UserChangedAction extends AnyAction {
  payload?: {uid?: string} | null;
}

const isUserChanged = (action: AnyAction): action is UserChangedAction =>
  action.type === USER_CHANGED_ACTION;

/**
 * Shape every user-scoped slice carries so it can tell whose data it holds.
 *
 * `loadedForUserId` is maintained by `addUserScopeReset` alone — slices do not
 * set it themselves. It is the uid that was signed in when the slice was last
 * reset, which is therefore the only user whose data can have been loaded into
 * it since.
 */
export interface UserScopedState {
  loadedForUserId: string | null;
}

/**
 * Clear a slice whenever the authenticated user changes.
 *
 * Several slices hold data belonging to exactly one person — direct messages,
 * step work, gratitude and streaks, sponsorships. None of it may survive into
 * the next session: this app is used on shared devices, and the data implies
 * recovery status. Each slice used to need its own answer to that, and most
 * simply did not have one.
 *
 * Resetting is deliberately blunt. It cannot leak: the worst case is discarding
 * something that was safe to keep and refetching it. A per-field rule would be
 * cheaper and would be wrong the first time someone adds a field and forgets.
 *
 * CALL THIS LAST in `extraReducers`. It registers a matcher, and RTK requires
 * every `addCase` to come before any `addMatcher` — calling it first throws
 * "builder.addCase should only be called before calling builder.addMatcher".
 *
 * Only for slices whose state is wholly user-scoped. `groupsSlice` keeps its
 * own narrower logic because its entity cache is shared with search and nearby
 * results, which are not the signed-in user's data and must survive.
 *
 * Keys off `setUser` rather than a dedicated action on purpose: `setUser` is
 * already the one signal for "the authenticated user changed", dispatched from
 * `onAuthStateChanged`. A second action would be one more thing to forget to
 * dispatch, and forgetting it would fail open — silently, and in the direction
 * that leaks.
 */
export function addUserScopeReset<S extends UserScopedState>(
  builder: ActionReducerMapBuilder<S>,
  initialState: S,
): void {
  // Returns void deliberately: addMatcher narrows the builder so no further
  // addCase is possible, and this is meant to be the final call anyway.
  builder.addMatcher(isUserChanged, (state, action) => {
    const uid = action.payload?.uid ?? null;
    if (uid !== state.loadedForUserId) {
      return {...initialState, loadedForUserId: uid};
    }
    return state;
  });
}
