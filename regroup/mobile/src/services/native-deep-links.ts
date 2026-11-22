import { Linking } from 'react-native';
import { Invitation, InvitationType } from '../entities/Invite';
import { logException } from '../util/logging';
import { parseAppLink } from './appLinks/parseAppLink';
import { invitationFromAppLink } from './appLinks/invitationFromAppLink';

const customScheme = 'regroup-app://';

export type LinkType = 'invitation' | 'checkout-return'; // emailConfirmation removed

export interface NativeDeepLink {
  url: string;
}

/**
 * Creates a native deep link for invitations
 * @param houseId - house the guest is invited to join
 * @param inviterUserId - uid of the user sending the invite
 * @param email - email of the invitee
 * @param invitationType - type of invitation (admin, guest, senior-peer)
 * @param ownerId - owner of the house
 * @param initialPhase - initial phase name
 */
export const createNewInviteLink = (
  houseId: string,
  inviterUserId: string,
  email: string,
  invitationType: InvitationType,
  ownerId?: string,
  initialPhase?: string,
): string => {
  const link = `${customScheme}?type=invitation&invitationType=${invitationType}&house=${houseId}&inviter=${
    inviterUserId || ''
  }&email=${email}&owner=${ownerId || ''}&initialPhase=${initialPhase || ''}`;

  return encodeURI(link);
};

// Email confirmation link creation removed - no longer needed

/**
 * Gets the initial link when the app is opened from a deep link
 */
export const getInitialLink = async (): Promise<NativeDeepLink | null> => {
  try {
    const initialUrl = await Linking.getInitialURL();

    if (initialUrl) {
      const isValid = isValidDeepLink(initialUrl);

      if (isValid) {
        return { url: initialUrl };
      }
    }

    return null;
  } catch (error) {
    logException(error);
    return null;
  }
};

/**
 * Sets up a listener for deep links when the app is already running
 */
export const onLink = (
  listener: (link: NativeDeepLink) => void,
): (() => void) => {
  const handleUrl = (event: { url: string }) => {
    if (isValidDeepLink(event.url)) {
      listener({ url: event.url });
    }
  };

  const subscription = Linking.addEventListener('url', handleUrl);

  return () => {
    subscription?.remove();
  };
};

/**
 * Creates an invitation object from a deep link (token or legacy params form).
 * Throws when the link is not an invitation parseAppLink accepts.
 */
export const createInvitationFromLink = (link: NativeDeepLink): Invitation => {
  const parsed = parseAppLink(link.url);
  if (parsed?.kind === 'invitation' || parsed?.kind === 'invitation-legacy') {
    return invitationFromAppLink(parsed);
  }
  logException(new Error('createInvitationFromLink — not an invitation link'));
  throw new Error('Failed to parse invitation link');
};

/**
 * Determines the type of link from a deep link URL (a thin wrapper over
 * parseAppLink, so `type` is read wherever it sits in the query).
 */
export const getLinkType = (link: NativeDeepLink): LinkType | null => {
  const parsed = parseAppLink(link.url);
  if (!parsed) return null;
  return parsed.kind === 'checkout-return' ? 'checkout-return' : 'invitation';
};

/**
 * Checks if a URL is a link this app handles outside navigation (an
 * invitation or a checkout hand-back), on an accepted scheme or web origin.
 */
export const isValidDeepLink = (urlString: string): boolean =>
  parseAppLink(urlString) !== null;
