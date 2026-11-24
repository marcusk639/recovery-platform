/**
 * What a signed-in (non-anonymous) user can do with an invitation link
 * (screens/SignUp/SignedInInvitation.tsx):
 *
 * - Accept as this account (token invitations): first acceptRefusal checks the
 *   account can take the role (no invitation or slot is spent on a refusal).
 *   redeemInvitation then grants the house role server-side when the
 *   account's email matches. The ID token is force-refreshed so the new house
 *   claims apply, the membership records are written (invitationMembership,
 *   the same as sign-up), the user doc is reloaded (autoLogin), the
 *   invitation is cleared and the app resets to the user's start route.
 * - Continue to the app (any invitation): clear it and reset, nothing redeemed.
 */
import { getAuth } from '@react-native-firebase/auth';
import type { AppDispatch } from '../../state/store';
import type { User } from '../../entities/User';
import { autoLogin, clearInvitation } from '../../state/slices/userSlice';
import improvedNavigationService from '../../navigation/improved-navigation-service';
import type { Invitation } from '../../entities/Invite';
import { peekInvitation, redeemInvitation } from '../invitations';
import { getUser } from '../users';
import {
  buildInvitationMembership,
  MembershipInvitation,
  MembershipWriters,
  refreshInvitationClaims,
  writeInvitationMembership,
} from '../invitationMembership';
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

/** The account must be able to take this role; checked before any redeem. */
export function acceptRefusal(
  user: Partial<User> | null,
  invitation: MembershipInvitation,
): string | null {
  const { type, houseId } = invitation;
  if (type === 'admin') {
    // The rules let a client create an admins record for one house only.
    return user?.adminId
      ? "You're already a manager with this account, and one account can manage one house in the app. Ask the house admin to invite another email address."
      : null;
  }
  if (type === 'guest' || type === 'senior-peer') {
    // Moving houses is not something an invitation does.
    return user?.isGuest && user.houseId && user.houseId !== houseId
      ? "You're a resident of another house with this account, so this invitation can't be accepted with it. Ask the house admin to invite another email address."
      : null;
  }
  return "This invitation can't be accepted in the app.";
}

export interface AcceptContext {
  dispatch: AppDispatch;
  /** The signed-in user (state.user.user). */
  user: Partial<User> | null;
  writers: MembershipWriters;
  /** Wait before the token refresh (refreshInvitationClaims); tests pass 0. */
  claimsDelayMs?: number;
}

const SETUP_UNFINISHED =
  "Your invitation was accepted, but setting up your account didn't finish. Check your connection and tap Accept again. If it keeps failing, or after you restart the app, ask your house admin for help rather than accepting again.";

/** The role and house: SignUp has usually filled them in with peekInvitation. */
async function invitationRole(invitation: Invitation): Promise<MembershipInvitation> {
  if (invitation.houseId) return invitation;
  const meta = await peekInvitation(invitation.token!);
  return { type: meta.role, houseId: meta.houseId, initialPhase: meta.initialPhase };
}

export async function acceptInvitationAsCurrentUser(
  invitation: Invitation,
  { dispatch, user: cachedUser, writers, claimsDelayMs }: AcceptContext,
): Promise<AcceptResult> {
  // A fresh read, not the Redux user: a role gained on another device must
  // refuse here, and an accept never builds records from a stale profile.
  let user: Partial<User> | null;
  try {
    user = cachedUser?.uid ? await getUser(cachedUser.uid) : null;
  } catch (error) {
    logException(error, 'acceptInvitationAsCurrentUser: user reload failed');
    return { ok: false, message: GENERIC };
  }
  // No user doc (or no uid) means nothing to build a membership on: stop
  // before the redeem spends the invitation.
  if (!user?.uid) return { ok: false, message: GENERIC };
  let role: MembershipInvitation;
  try {
    role = await invitationRole(invitation);
  } catch (error) {
    logException(error, 'acceptInvitationAsCurrentUser: peek refused');
    return { ok: false, message: invitationErrorMessage(error) };
  }
  const refusal = acceptRefusal(user, role);
  if (refusal) return { ok: false, message: refusal };

  try {
    await redeemInvitation(invitation.token!);
  } catch (error) {
    logException(error, 'acceptInvitationAsCurrentUser: redeem refused');
    return { ok: false, message: invitationErrorMessage(error) };
  }

  // Granted. Refresh the token so the records' writes see the new role, then
  // write them. A second redeem by this account grants nothing and succeeds
  // (functions/src/callable/invitations.ts), and writeInvitationMembership
  // reuses a record a failed attempt already created (same app session).
  try {
    await refreshInvitationClaims(claimsDelayMs);
    const membership = buildInvitationMembership(user ?? {}, role);
    if (membership) await writeInvitationMembership(membership, user ?? {}, writers);
  } catch (error) {
    logException(error, 'acceptInvitationAsCurrentUser: membership write failed');
    return { ok: false, message: SETUP_UNFINISHED };
  }

  let reloaded: Partial<User> | null = null;
  const firebaseUser = getAuth().currentUser;
  try {
    if (firebaseUser) reloaded = (await dispatch(autoLogin(firebaseUser)).unwrap()).user;
  } catch (error) {
    logException(error, 'acceptInvitationAsCurrentUser: reload after accept failed');
  }
  leaveInvitation(dispatch, reloaded ?? user);
  return { ok: true };
}
