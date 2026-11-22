import { webBaseUrl } from '../config/env';

/**
 * URL prefixes the app accepts as links: the canonical custom scheme, the
 * legacy `com.rats.dev://` scheme (kept for one release so invitations already
 * sent keep working), and the origin of the web app (universal links).
 */
export const appLinkPrefixes = (): string[] => [
  'regroup-app://',
  'com.rats.dev://',
  new URL(webBaseUrl()).origin,
];
