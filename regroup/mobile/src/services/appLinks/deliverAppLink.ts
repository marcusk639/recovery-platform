/**
 * Routes a parsed app link now, or holds it until a user signs in.
 *
 * - Invitation (token or legacy params): stored in state.user.invitation.
 *   Signed out, that is the hold: the initial route decision opens signup with
 *   the invitation, and signup consumes it. Signed in, the invitation screen
 *   opens now (improvedNavigationService.navigateToInvitation).
 * - Checkout return: signed out, held in state.user.pendingAppLink; Splash
 *   hands it to deliverPendingAppLink once a user signs in. Signed in, it is
 *   delivered now (Task 10 refreshes the plan state here).
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
import { AppLink } from './parseAppLink';
import { invitationFromAppLink } from './invitationFromAppLink';

export interface DeliveryContext {
  signedIn: boolean;
  dispatch: AppDispatch;
}

export const isSignedInUser = (user?: Partial<User> | null): boolean => !!user && !user.isAnonymous;

export function deliverAppLink(link: AppLink, { signedIn, dispatch }: DeliveryContext): void {
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
      // Task 10: refresh the plan state (SubscriptionGate's query keys).
      return;
  }
}

/**
 * Delivers the held link once a user is signed in, clearing it first so it is
 * delivered once. Returns whether a link was delivered.
 */
export function deliverPendingAppLink(pending: AppLink | null, ctx: DeliveryContext): boolean {
  if (!pending || !ctx.signedIn) return false;
  ctx.dispatch(clearPendingAppLink());
  deliverAppLink(pending, ctx);
  return true;
}
