import { webBaseUrl } from '../config/env';

/**
 * The origin (`https://host[:port]`) of a web base URL, or null when it is not
 * one. `http:` is accepted only in development builds, so an empty or invalid
 * RATS_WEB_URL can never add an empty or plain-http prefix to the links the
 * app accepts.
 */
export const webOrigin = (raw: string, allowHttp: boolean = __DEV__): string | null => {
  const match = /^(https?):\/\/([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::\d{1,5})?)(?:[/?#]|$)/i.exec(
    (raw ?? '').trim(),
  );
  if (!match) return null;
  const scheme = match[1].toLowerCase();
  if (scheme === 'http' && !allowHttp) return null;
  return `${scheme}://${match[2].toLowerCase()}`;
};

/**
 * URL prefixes the app accepts as links: the canonical custom scheme, the
 * legacy `com.rats.dev://` scheme (kept for one release so invitations already
 * sent keep working), and the origin of the web app (universal links) when
 * RATS_WEB_URL names a valid one.
 */
export const appLinkPrefixes = (): string[] => {
  const origin = webOrigin(webBaseUrl());
  return ['regroup-app://', 'com.rats.dev://', ...(origin ? [origin] : [])];
};
