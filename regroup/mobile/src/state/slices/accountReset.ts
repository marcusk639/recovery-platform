/**
 * Slices that hold one account's state (houses, guests, admin) reset when
 * userSlice's logout thunk succeeds. They match its action type here instead
 * of importing userSlice, which would pull its services into every importer.
 * logoutResetsAccountState.test.ts dispatches the real thunk, so a renamed
 * thunk fails there.
 */
export const LOGOUT_FULFILLED = 'user/logout/fulfilled';

export const isLogoutFulfilled = (action: { type: string }): boolean =>
  action.type === LOGOUT_FULFILLED;
