/**
 * The only parser for incoming app links. Splash (initial URL and listener),
 * native-deep-links and the React Navigation guard (navigation/linking.ts) all
 * call it, so every caller agrees on which URLs are invitations or checkout
 * hand-backs.
 *
 * Accepted forms (launch P5 Task 3):
 *   regroup-app://?type=invitation&token=T     (also com.rats.dev://, one release)
 *   regroup-app://invite?token=T
 *   https://<web origin>/invite?token=T         (extra params such as utm_* ignored)
 *   regroup-app://?type=invitation&house=…&email=…   (legacy params)
 *   regroup-app://checkout-return?result=R
 *   regroup-app://app/checkout-return?result=R
 *   https://<web origin>/checkout-return?result=R    (R: success | canceled | portal)
 *   https://<web origin>/app/checkout-return?result=R
 *   https://<web origin>/redirect?url=<custom-scheme link above>   (older invitation
 *     emails; unwrapped one level, and only to a custom-scheme link)
 *
 * The https origin is the one appLinkPrefixes() accepts, and nothing else.
 *
 * URLs are split by a local regex rather than `new URL()`: React Native's URL
 * (Libraries/Blob/URL.js) is regex-based, only reads host and path for http(s)
 * and throws on malformed percent-encoding inside searchParams.
 */
import { appLinkPrefixes } from '../../navigation/appLinkPrefixes';

export type CheckoutResult = 'success' | 'canceled' | 'portal';

export type AppLink =
  | { kind: 'invitation'; token: string }
  | { kind: 'invitation-legacy'; params: Record<string, string> }
  | { kind: 'checkout-return'; result: CheckoutResult };

const CUSTOM_SCHEMES = ['regroup-app', 'com.rats.dev'];
const CHECKOUT_RESULTS: readonly string[] = ['success', 'canceled', 'portal'];
// Server tokens are base64url (functions/src/util/tokens.ts); allow the other
// unreserved URL characters too, nothing that needs encoding.
const TOKEN = /^[A-Za-z0-9._~-]{1,256}$/;
const URL_PARTS = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)([^?#]*)(?:\?([^#]*))?(?:#.*)?$/i;

type Query = Map<string, string[]>;

// The keys parseAppLink reads. Malformed percent-encoding in one of them
// makes the whole link invalid; in any other key (utm_* and the like) the pair
// is skipped.
const STRICT_KEYS = new Set([
  'token',
  'url',
  'type',
  'result',
  'invitationType',
  'house',
  'inviter',
  'email',
  'owner',
  'initialPhase',
]);

const decode = (raw: string): string | null => {
  try {
    return decodeURIComponent(raw.replace(/\+/g, ' '));
  } catch {
    return null;
  }
};

/**
 * Parses a query string (no leading `?`). Everything after the first `?` is
 * query, so a second `?` stays inside a value. Returns null when a key the
 * parser reads has malformed percent-encoding; other malformed pairs are
 * skipped.
 */
export const parseQuery = (query: string): Query | null => {
  const params: Query = new Map();
  for (const pair of query.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const rawKey = eq === -1 ? pair : pair.slice(0, eq);
    const rawValue = eq === -1 ? '' : pair.slice(eq + 1);
    const key = decode(rawKey);
    const value = decode(rawValue);
    if (key === null || value === null) {
      if (key !== null && STRICT_KEYS.has(key)) return null;
      if (key === null && STRICT_KEYS.has(rawKey)) return null;
      continue;
    }
    params.set(key, [...(params.get(key) ?? []), value]);
  }
  return params;
};

/** The one value of `key`, or null when it is missing or repeated with different values. */
const single = (query: Query, key: string): string | null => {
  const values = query.get(key);
  if (!values?.length || values.some((v) => v !== values[0])) return null;
  return values[0];
};

const webOrigin = (): string | null =>
  appLinkPrefixes().find((prefix) => /^https?:\/\//.test(prefix)) ?? null;

const tokenInvitation = (query: Query): AppLink | null => {
  const token = single(query, 'token');
  return token !== null && TOKEN.test(token) ? { kind: 'invitation', token } : null;
};

const typedInvitation = (query: Query): AppLink | null => {
  if (!(query.get('type') ?? []).includes('invitation')) return null;
  if (query.has('token')) return tokenInvitation(query);
  // Legacy params form: house and email are what createInvitationFromLink needs.
  const params: Record<string, string> = {};
  query.forEach((values, key) => {
    params[key] = values[values.length - 1];
  });
  return params.house && params.email ? { kind: 'invitation-legacy', params } : null;
};

const checkoutReturn = (query: Query): AppLink | null => {
  const result = single(query, 'result');
  return result !== null && CHECKOUT_RESULTS.includes(result)
    ? { kind: 'checkout-return', result: result as CheckoutResult }
    : null;
};

interface AppTarget {
  custom: boolean;
  route: string;
  rawQuery: string;
}

/** The route and raw query of a URL addressed to the app (a custom scheme or the web origin). */
const appTarget = (url: string): AppTarget | null => {
  if (typeof url !== 'string') return null;
  const parts = URL_PARTS.exec(url.trim());
  if (!parts) return null;
  const [, rawScheme, authority, path, rawQuery = ''] = parts;
  const scheme = rawScheme.toLowerCase();
  const custom = CUSTOM_SCHEMES.includes(scheme);

  let route: string;
  if (custom) {
    // regroup-app://invite?… puts the route in the authority position.
    route = `${authority}${path}`;
  } else {
    const origin = webOrigin();
    if (!origin || `${scheme}://${authority.toLowerCase()}` !== origin) return null;
    route = path;
  }
  return { custom, route: route.replace(/^\/+|\/+$/g, ''), rawQuery };
};

/**
 * Whether a URL is addressed to the app as an invitation (the invite route, or
 * the custom scheme's `type=invitation`), whether or not it parses. Splash
 * tells the user about one that doesn't (brokenInvitation.ts).
 */
export function claimsInvitation(url: string): boolean {
  const target = appTarget(url);
  if (!target) return false;
  if (target.route === 'invite') return true;
  return target.custom && target.route === '' && /(^|&)type=invitation(&|$)/.test(target.rawQuery);
}

export function parseAppLink(url: string): AppLink | null {
  return parse(url, true);
}

function parse(url: string, allowRedirect: boolean): AppLink | null {
  const target = appTarget(url);
  if (!target) return null;
  const { custom, route, rawQuery } = target;

  const query = parseQuery(rawQuery);
  if (!query) return null;

  switch (route) {
    case '':
      return custom ? typedInvitation(query) : null;
    case 'invite':
      return tokenInvitation(query);
    case 'checkout-return':
      return checkoutReturn(query);
    // Also on https: app-links.json claims /app/*, so the OS opens it here.
    case 'app/checkout-return':
      return checkoutReturn(query);
    case 'redirect': {
      const inner = custom || !allowRedirect ? null : single(query, 'url');
      const innerScheme = inner ? URL_PARTS.exec(inner.trim())?.[1]?.toLowerCase() : undefined;
      return inner && innerScheme && CUSTOM_SCHEMES.includes(innerScheme) ? parse(inner, false) : null;
    }
    default:
      return null;
  }
}
