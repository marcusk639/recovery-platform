/**
 * Routes a parsed app link now, or holds it until a user signs in.
 *
 * - Invitation (token or legacy params): stored in state.user.invitation.
 *   Signed out, that is the hold: the initial route decision opens signup with
 *   the invitation, and signup consumes it. Signed in, the invitation screen
 *   opens now (improvedNavigationService.navigateToInvitation).
 * - Checkout return: signed out, held in state.user.pendingAppLink (with the
 *   time it arrived); Splash hands it to deliverPendingAppLink once a user
 *   signs in, which delivers it if it is under 15 minutes old. Logout clears
 *   it. Signed in, it is delivered now: onCheckoutReturn refreshes the plan
 *   state (services/planState.ts) and SubscriptionGate decides what shows,
 *   whatever the result (a canceled checkout simply leaves the plan screen).
 *
 * "Signed in" means a user who is not anonymous (isSignedInUser).
 */
import type { AppDispatch } from '../../state/store';
import type { User } from '../../entities/User';
import {
  clearPendingAppLink,
  initializeInvitation,
  setPendingAppLink,
} from '../../state/slices/userSlice';
import improvedNavigationService from '../../navigation/improved-navigation-service';
import { AppLink, CheckoutResult } from './parseAppLink';
import { invitationFromAppLink } from './invitationFromAppLink';

export interface DeliveryContext {
  signedIn: boolean;
  dispatch: AppDispatch;
  /** Called once per delivered checkout hand-back (Splash refreshes the plan state). */
  onCheckoutReturn?: (result: CheckoutResult) => void;
}

export const isSignedInUser = (user?: Partial<User> | null): boolean => !!user && !user.isAnonymous;

export function deliverAppLink(
  link: AppLink,
  { signedIn, dispatch, onCheckoutReturn }: DeliveryContext,
): void {
  switch (link.kind) {
    case 'invitation':
    case 'invitation-legacy':
      dispatch(initializeInvitation(invitationFromAppLink(link)));
      if (signedIn) improvedNavigationService.navigateToInvitation();
      return;
    case 'checkout-return':
      if (!signedIn) {
        dispatch(setPendingAppLink(link));
        return;
      }
      onCheckoutReturn?.(link.result);
      return;
  }
}

/** A held link older than this is dropped at sign-in instead of delivered. */
export const PENDING_APP_LINK_TTL_MS = 15 * 60 * 1000;

export interface HeldAppLink {
  pendingAppLink: AppLink | null;
  pendingAppLinkReceivedAt: number | null;
}

/**
 * Delivers the held link once a user is signed in, clearing it first so it is
 * delivered once. A link held for more than 15 minutes (or with no receive
 * time) is cleared and not delivered. Returns whether a link was delivered.
 */
export function deliverPendingAppLink(
  held: HeldAppLink,
  ctx: DeliveryContext,
  now: number = Date.now(),
): boolean {
  const { pendingAppLink, pendingAppLinkReceivedAt } = held;
  if (!pendingAppLink || !ctx.signedIn) return false;
  ctx.dispatch(clearPendingAppLink());
  if (
    pendingAppLinkReceivedAt === null ||
    now - pendingAppLinkReceivedAt > PENDING_APP_LINK_TTL_MS
  ) {
    return false;
  }
  deliverAppLink(pendingAppLink, ctx);
  return true;
}
