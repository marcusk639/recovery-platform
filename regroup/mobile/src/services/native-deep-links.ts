import { Linking } from 'react-native';
import { Invitation, InvitationType } from '../entities/Invite';
import { logException } from '../util/logging';

const ratsDomain = 'regroup-app.com';
const rootLink = `https://${ratsDomain}`;
const customScheme = 'regroup-app://';
const iosPackageName = 'com.rats.dev';
const androidPackageName = 'com.regroup.app';

export type LinkType = 'invitation'; // emailConfirmation removed

export interface NativeDeepLink {
  url: string;
}

const APP_SCHEME_PREFIXES = [customScheme, `${iosPackageName}://`];
const REDIRECT_PAGE = /^https:\/\/regroup-app\.com\/redirect\/?(\?|#|$)/i;

const decodeParam = (raw: string): string => {
  try {
    return decodeURIComponent(raw.replace(/\+/g, ' '));
  } catch {
    return raw;
  }
};

/**
 * Query parameters of a deep link, decoded the way URLSearchParams decodes
 * them. Hand-rolled because React Native's built-in URL does not reliably
 * parse custom-scheme URLs or their searchParams.
 */
export const parseLinkQuery = (url: string): Record<string, string> => {
  const start = url.indexOf('?');
  if (start === -1) return {};
  const end = url.indexOf('#', start);
  const query: Record<string, string> = {};
  for (const pair of url.slice(start + 1, end === -1 ? undefined : end).split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const key = decodeParam(eq === -1 ? pair : pair.slice(0, eq));
    query[key] = eq === -1 ? '' : decodeParam(pair.slice(eq + 1));
  }
  return query;
};

/**
 * The invitation email links to https://regroup-app.com/redirect?url=<app link>.
 * Where that https link opens the app directly (iOS associated domains,
 * Android App Links), the app receives the wrapper, so unwrap it, one level,
 * and only to an app-scheme link.
 */
export const resolveDeepLinkUrl = (url: string): string => {
  if (!REDIRECT_PAGE.test(url)) return url;
  const inner = parseLinkQuery(url).url;
  const isAppLink = !!inner && APP_SCHEME_PREFIXES.some((p) => inner.toLowerCase().startsWith(p));
  return isAppLink ? inner : url;
};

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
        return { url: resolveDeepLinkUrl(initialUrl) };
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
export const onLink = (listener: (link: NativeDeepLink) => void): (() => void) => {
  const handleUrl = (event: { url: string }) => {
    if (isValidDeepLink(event.url)) {
      listener({ url: resolveDeepLinkUrl(event.url) });
    }
  };

  const subscription = Linking.addEventListener('url', handleUrl);

  return () => {
    subscription?.remove();
  };
};

/**
 * Creates an invitation object from a deep link
 */
export const createInvitationFromLink = (link: NativeDeepLink): Invitation => {
  try {
    const query = parseLinkQuery(resolveDeepLinkUrl(link.url));

    if (query.type !== 'invitation') {
      throw new Error('Invalid deep link: not an invitation link');
    }

    // New format: opaque token only. SignUpForm calls peekInvitation +
    // redeemInvitation to fill in metadata + grant claims.
    if (query.token) {
      return {
        id: '',
        type: 'guest', // placeholder — overwritten by peekInvitation
        houseId: '',
        inviterId: '',
        ownerId: '',
        email: '',
        initialPhase: '',
        expirationDate: new Date(new Date().getTime() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        token: query.token,
      };
    }

    // Legacy format — kept until Phase F removes it.
    if (!query.house || !query.email) {
      logException(new Error('createInvitationFromLink — missing required parameters'));
      throw new Error('Invalid deep link: missing required parameters');
    }

    const invitation: Invitation = {
      id: '',
      type: query.invitationType as InvitationType,
      houseId: query.house as string,
      inviterId: (query.inviter as string) || '',
      ownerId: (query.owner as string) || '',
      email: query.email as string,
      initialPhase: query.initialPhase ? (query.initialPhase as string).replace(/\+/g, ' ') : '',
      expirationDate: new Date(new Date().getTime() + 7 * 24 * 60 * 60 * 1000),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return invitation;
  } catch (error) {
    logException(error);
    throw new Error('Failed to parse invitation link');
  }
};

// Email confirmation parsing removed - no longer needed

/**
 * Determines the type of link from a deep link URL
 */
export const getLinkType = (link: NativeDeepLink): LinkType | null =>
  parseLinkQuery(resolveDeepLinkUrl(link.url)).type === 'invitation' ? 'invitation' : null;

/**
 * Checks if a URL is a valid deep link for this app
 */
export const isValidDeepLink = (urlString: string): boolean => {
  try {
    const parsedUrl = new URL(urlString);

    // Check for custom scheme
    if (parsedUrl.protocol === 'regroup-app:') {
      return true;
    }

    // Check for bundle ID scheme (for debug builds)
    if (parsedUrl.protocol === 'com.rats.dev:') {
      return true;
    }

    // Check for HTTPS with exact domain match (for fallback/universal links)
    if (parsedUrl.protocol === 'https:' && parsedUrl.host === ratsDomain) {
      return true;
    }

    return false;
  } catch (error) {
    logException(error);
    return false;
  }
};
