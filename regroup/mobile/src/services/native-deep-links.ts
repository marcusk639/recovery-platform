import { Linking } from 'react-native';
import { Invitation, InvitationType } from '../entities/Invite';
import { logException } from '../util/logging';
import { parseAppLink } from './appLinks/parseAppLink';
import { invitationFromAppLink } from './appLinks/invitationFromAppLink';

const customScheme = 'regroup-app://';
const iosPackageName = 'com.rats.dev';

export type LinkType = 'invitation' | 'checkout-return'; // emailConfirmation removed

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
 * Creates an invitation object from a deep link (token or legacy params form).
 * Throws when the link is not an invitation parseAppLink accepts.
 */
export const createInvitationFromLink = (link: NativeDeepLink): Invitation => {
  const parsed = parseAppLink(resolveDeepLinkUrl(link.url));
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
  const url = resolveDeepLinkUrl(link.url);
  const parsed = parseAppLink(url);
  if (parsed) return parsed.kind === 'checkout-return' ? 'checkout-return' : 'invitation';
  // An invitation whose params parseAppLink refuses is still an invitation, so
  // the caller reports it as a broken invite rather than ignoring it.
  return parseLinkQuery(url).type === 'invitation' ? 'invitation' : null;
};

/**
 * Checks if a URL is a link this app handles outside navigation (an
 * invitation or a checkout hand-back), on an accepted scheme or web origin.
 */
export const isValidDeepLink = (urlString: string): boolean =>
  parseAppLink(resolveDeepLinkUrl(urlString)) !== null;
