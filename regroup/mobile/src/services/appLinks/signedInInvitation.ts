/**
 * What a signed-in (non-anonymous) user can do with an invitation link
 * (screens/SignUp/SignedInInvitation.tsx):
 *
 * - Accept as this account (token invitations): redeemInvitation grants the
 *   house role server-side when the account's email matches the invitation.
 *   Then the ID token is force-refreshed so the new house claims apply, the
 *   user doc is reloaded (autoLogin), the invitation is cleared and the app
 *   resets to the user's start route.
 * - Continue to the app (any invitation): clear it and reset, nothing redeemed.
 */
import { getAuth } from '@react-native-firebase/auth';
import type { AppDispatch } from '../../state/store';
import type { User } from '../../entities/User';
import { autoLogin, clearInvitation } from '../../state/slices/userSlice';
import improvedNavigationService from '../../navigation/improved-navigation-service';
import { redeemInvitation } from '../invitations';
import { getAuthUser } from '../users';
import { logException } from '../../util/logging';

export type AcceptResult = { ok: true } | { ok: false; message: string };

const GENERIC = "Couldn't accept the invitation. Check your connection and try again.";

/** A message for the user from a redeemInvitation refusal (an HttpsError). */
export const invitationErrorMessage = (error: unknown): string => {
  const err = (error ?? {}) as { code?: unknown; message?: unknown };
  const code = String(err.code ?? '').replace(/^functions\//, '');
  const message = String(err.message ?? '').replace(/^\[[^\]]+\]\s*/, '');
  switch (code) {
    case 'permission-denied':
      return 'This invitation was sent to a different email address. Sign in with that address to accept it.';
    case 'not-found':
      return 'This invitation link is no longer valid. Ask your house admin to resend it.';
    case 'unauthenticated':
      return 'Sign in again to accept this invitation.';
    case 'failed-precondition':
      if (/already redeemed/i.test(message)) return 'This invitation has already been used.';
      if (/expired/i.test(message)) {
        return 'This invitation has expired. Ask your house admin to resend it.';
      }
      // The server writes these for the user (util/invitationChecks).
      return message || GENERIC;
    default:
      return GENERIC;
  }
};

/** Clears the invitation and resets to the user's start route. */
export function leaveInvitation(dispatch: AppDispatch, user: Partial<User> | null): void {
  dispatch(clearInvitation());
  improvedNavigationService.resetToStartRoute(user);
}

export async function acceptInvitationAsCurrentUser(
  token: string,
  dispatch: AppDispatch,
): Promise<AcceptResult> {
  try {
    await redeemInvitation(token);
  } catch (error) {
    logException(error, 'acceptInvitationAsCurrentUser: redeem refused');
    return { ok: false, message: invitationErrorMessage(error) };
  }

  // The grant succeeded; from here a failure must not report it as refused.
  const firebaseUser = getAuth().currentUser;
  let user: Partial<User> | null = null;
  try {
    await getAuthUser(true);
    if (firebaseUser) {
      user = (await dispatch(autoLogin(firebaseUser)).unwrap()).user;
    }
  } catch (error) {
    logException(error, 'acceptInvitationAsCurrentUser: reload after redeem failed');
  }
  leaveInvitation(dispatch, user ?? currentUserOf(dispatch));
  return { ok: true };
}

// The user in the store when the reload failed (thunk-style getState).
const currentUserOf = (dispatch: AppDispatch): Partial<User> | null =>
  (dispatch as unknown as (thunk: (d: unknown, getState: () => any) => any) => any)(
    (_d, getState) => getState().user.user ?? null,
  );
