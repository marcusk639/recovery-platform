/**
 * linking.ts prefixes vs the URL schemes the native apps register (#183 item
 * 18). linking.ts accepted `regroup://`, which neither platform registers, and
 * not `regroup-app://`, the canonical scheme (launch spec §4.2) that iOS and
 * Android register and invitations are minted with.
 */
// jest.setup.js mocks @react-navigation/native without the link parser; use the
// real one so the allowlist is tested against React Navigation's own matching.
jest.mock('@react-navigation/native', () => ({
  getStateFromPath: jest.requireActual('@react-navigation/core').getStateFromPath,
}));

import * as fs from 'fs';
import * as path from 'path';
import { getStateFromPath } from '@react-navigation/native';
import { getAuth } from '@react-native-firebase/auth';
import { isHandledElsewhere, linkingConfig } from '../linking';
import { appLinkPrefixes, webOrigin } from '../appLinkPrefixes';
import { Routes } from '../types';

// jest.setup.js's auth mock: one shared instance, currentUser null by default.
const auth = getAuth() as unknown as { currentUser: unknown };
const signInAs = (user: unknown) => {
  auth.currentUser = user;
};
afterEach(() => signInAs(null));

const root = path.resolve(__dirname, '../../..');
const infoPlist = fs.readFileSync(path.join(root, 'ios/rats/Info.plist'), 'utf8');
const manifest = fs.readFileSync(
  path.join(root, 'android/app/src/main/AndroidManifest.xml'),
  'utf8',
);

const customSchemes = linkingConfig.prefixes
  .filter((prefix) => !prefix.startsWith('https://'))
  .map((prefix) => prefix.replace('://', ''));

describe('linkingConfig prefixes', () => {
  it('accepts the canonical regroup-app:// scheme', () => {
    expect(linkingConfig.prefixes).toContain('regroup-app://');
  });

  it('no longer accepts the unregistered regroup:// scheme', () => {
    expect(linkingConfig.prefixes).not.toContain('regroup://');
  });

  it.each(customSchemes)('%s is registered by iOS and Android', (scheme) => {
    expect(infoPlist).toContain(`<string>${scheme}</string>`);
    expect(manifest).toContain(`android:scheme="${scheme}"`);
  });
});

const TABS: [string, Routes][] = [
  ['app/house', Routes.House],
  ['app/guest', Routes.Guest],
  ['app/activities', Routes.Activities],
  ['app/contacts', Routes.Contacts],
  ['app/chat', Routes.HouseChat],
  ['app/personal', Routes.Personal],
];

type Cfg = { screens?: Record<string, unknown> };
const flattenScreens = (cfg: Cfg | undefined): string[] =>
  Object.entries(cfg?.screens ?? {}).flatMap(([name, v]) => [
    name,
    ...(typeof v === 'object' && v ? flattenScreens(v as Cfg) : []),
  ]);
const flattenPaths = (cfg: Cfg | undefined): string[] =>
  Object.values(cfg?.screens ?? {}).flatMap((v) =>
    typeof v === 'string'
      ? [v]
      : v && typeof v === 'object'
      ? [
          ...((v as { path?: string }).path ? [(v as { path: string }).path] : []),
          ...flattenPaths(v as Cfg),
        ]
      : [],
  );

describe('linkingConfig allowlist', () => {
  it('accepts the canonical scheme, the legacy scheme for one release, and the web origin', () => {
    expect(linkingConfig.prefixes).toEqual([
      'regroup-app://',
      'com.rats.dev://',
      'https://regroup-app.com',
    ]);
    expect(appLinkPrefixes()).toEqual(linkingConfig.prefixes);
  });

  it.each(TABS)('resolves %s to the %s tab inside Main', (path, route) => {
    const state = getStateFromPath(path, linkingConfig.config);
    expect(state?.routes[0].name).toBe(Routes.Main);
    expect(state?.routes[0].state?.routes[0].name).toBe(route);
  });

  it('resolves auth/login and auth/signup/:invitation? inside PriorAuth', () => {
    const login = getStateFromPath('auth/login', linkingConfig.config);
    expect(login?.routes[0].name).toBe(Routes.PriorAuth);
    expect(login?.routes[0].state?.routes[0].name).toBe(Routes.Login);
    const signup = getStateFromPath('auth/signup/tok123', linkingConfig.config);
    expect(signup?.routes[0].state?.routes[0]).toMatchObject({
      name: Routes.Signup,
      params: { invitation: 'tok123' },
    });
  });

  it('exposes no operator-only or paywalled screen', () => {
    const screens = flattenScreens(linkingConfig.config);
    for (const r of [
      Routes.HouseSettings,
      Routes.PaymentDashboard,
      Routes.SubscriptionHandler,
      Routes.PhaseCustomization,
      Routes.GuestInfo,
      Routes.SendInvites,
    ]) {
      expect(screens).not.toContain(r);
    }
  });

  it('does not resolve checkout-return or a screen outside the allowlist', () => {
    expect(getStateFromPath('app/checkout-return', linkingConfig.config)).toBeUndefined();
    expect(getStateFromPath('settings/house', linkingConfig.config)).toBeUndefined();
    expect(getStateFromPath('subscription', linkingConfig.config)).toBeUndefined();
  });

  it('defines each path once', () => {
    const paths = flattenPaths(linkingConfig.config);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('returns undefined for invitation and checkout-return URLs, and defers otherwise', () => {
    signInAs({ uid: 'u1', isAnonymous: false });
    const get = linkingConfig.getStateFromPath!;
    expect(get('?type=invitation&house=h1', linkingConfig.config)).toBeUndefined();
    expect(get('?type=invitation&token=t1', linkingConfig.config)).toBeUndefined();
    // parseAppLink is the one parser: an invitation query on the signup route
    // is not an invitation link, so the route opens and no invitation is made.
    // (Signed out: auth/* links open only for a signed-out or anonymous user.)
    signInAs(null);
    expect(
      get('auth/signup?type=invitation&house=h1', linkingConfig.config)?.routes[0].state
        ?.routes[0].name,
    ).toBe(Routes.Signup);
    signInAs({ uid: 'u1', isAnonymous: false });
    expect(get('app/checkout-return?type=checkout-return', linkingConfig.config)).toBeUndefined();
    expect(get('app/checkout-return?result=success', linkingConfig.config)).toBeUndefined();
    expect(get('app/house', linkingConfig.config)?.routes[0].name).toBe(Routes.Main);
  });
});

describe('isHandledElsewhere (parseAppLink decides, per prefix, on the full URL)', () => {
  it.each([
    'regroup-app://?type=invitation&token=t1',
    'regroup-app://?token=t1&type=invitation',
    'regroup-app://?type=other&type=invitation&token=t1',
    'com.rats.dev://?type=invitation&house=h1&email=a@rats-e2e.com',
    'regroup-app://invite?token=t1',
    'https://regroup-app.com/invite?token=t1&utm_source=email',
    'regroup-app://checkout-return?result=success',
    'https://regroup-app.com/checkout-return?result=portal',
    'regroup-app://app/checkout-return?result=canceled',
    // app-links.json claims /app/*, so the OS opens this one in the app too.
    'https://regroup-app.com/app/checkout-return?result=success',
  ])('declines %s', (url) => {
    expect(isHandledElsewhere(url)).toBe(true);
  });

  it('reads the whole query after the first ?, so a second ? hides nothing', () => {
    expect(isHandledElsewhere('regroup-app://?utm=a?b&type=invitation&token=t1')).toBe(true);
  });

  it.each([
    'regroup-app://app/house',
    'regroup-app://auth/login',
    'regroup-app://app/house?type=invitation',
    'https://regroup-app.com/pricing',
    // The parser accepts these only on the custom schemes, so the guard
    // does not claim them on the web origin either (no silent drop).
    'https://regroup-app.com/?type=invitation&token=t1',
  ])('leaves %s to navigation', (url) => {
    expect(isHandledElsewhere(url)).toBe(false);
  });
});

describe('linking getInitialURL and subscribe filter with the same parser', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Linking } = require('react-native');
  let listeners: Array<(e: { url: string }) => void>;
  const remove = jest.fn();
  beforeEach(() => {
    listeners = [];
    jest.spyOn(Linking, 'addEventListener').mockImplementation((...args: unknown[]) => {
      listeners.push(args[1] as (e: { url: string }) => void);
      return { remove };
    });
  });
  afterEach(() => jest.restoreAllMocks());

  it.each([
    ['an invitation (Splash delivers it)', 'regroup-app://?type=invitation&token=t1', null],
    ['a checkout return', 'https://regroup-app.com/checkout-return?result=success', null],
    ['a tab route', 'regroup-app://app/house', 'regroup-app://app/house'],
    [
      'an https root invitation the parser rejects',
      'https://regroup-app.com/?type=invitation&token=t1',
      'https://regroup-app.com/?type=invitation&token=t1',
    ],
  ])('initial URL: %s', async (_label, url, expected) => {
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(url);
    await expect(linkingConfig.getInitialURL!()).resolves.toBe(expected);
  });

  it('initial URL: none', async () => {
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
    await expect(linkingConfig.getInitialURL!()).resolves.toBeNull();
  });

  it('forwards only URLs the parser does not claim, and unsubscribes', () => {
    const seen: string[] = [];
    const unsubscribe = linkingConfig.subscribe!((url) => seen.push(url)) as () => void;
    for (const url of [
      'regroup-app://?type=invitation&token=t1',
      'regroup-app://app/activities',
      'regroup-app://app/checkout-return?result=portal',
      'https://regroup-app.com/app/checkout-return?result=success',
    ]) {
      listeners.forEach((l) => l({ url }));
    }
    expect(seen).toEqual(['regroup-app://app/activities']);
    unsubscribe();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('navigation itself never resolves the checkout-return path', () => {
    signInAs({ uid: 'u1', isAnonymous: false });
    expect(
      linkingConfig.getStateFromPath!('/app/checkout-return?result=success', linkingConfig.config),
    ).toBeUndefined();
  });
});

describe('app/* links need a signed-in user', () => {
  const get = (p: string) => linkingConfig.getStateFromPath!(p, linkingConfig.config);

  it.each(TABS)('declines %s when nobody is signed in', (p) => {
    signInAs(null);
    expect(get(p)).toBeUndefined();
  });

  it.each(TABS)('declines %s for an anonymous user', (p) => {
    signInAs({ uid: 'anon', isAnonymous: true });
    expect(get(p)).toBeUndefined();
  });

  it.each(TABS)('opens %s for a signed-in user', (p, route) => {
    signInAs({ uid: 'u1', isAnonymous: false });
    expect(get(p)?.routes[0].state?.routes[0].name).toBe(route);
    expect(get(`/${p}`)?.routes[0].name).toBe(Routes.Main);
  });

  it('declines the bare app route signed out', () => {
    expect(get('app')).toBeUndefined();
    expect(get('app?x=1')).toBeUndefined();
  });

  it('still opens the auth routes signed out', () => {
    expect(get('auth/login')?.routes[0].state?.routes[0].name).toBe(Routes.Login);
    expect(get('auth/signup')?.routes[0].state?.routes[0].name).toBe(Routes.Signup);
  });
});

// Sign-up and login are for a signed-out (or anonymous) user. Signed in, the
// sign-up form would create a second account from the current user's doc.
describe('auth/* links need a signed-out or anonymous user', () => {
  const get = (p: string) => linkingConfig.getStateFromPath!(p, linkingConfig.config);

  it.each(['auth', 'auth/login', 'auth/signup', 'auth/signup/tok123', '/auth/signup', 'auth?x=1'])(
    'declines %s for a signed-in user',
    (p) => {
      signInAs({ uid: 'u1', isAnonymous: false });
      expect(get(p)).toBeUndefined();
    },
  );

  it('opens them for an anonymous user', () => {
    signInAs({ uid: 'anon', isAnonymous: true });
    expect(get('auth/signup')?.routes[0].state?.routes[0].name).toBe(Routes.Signup);
    expect(get('auth/login')?.routes[0].state?.routes[0].name).toBe(Routes.Login);
  });

  it('does not decline a path that only starts with auth', () => {
    signInAs({ uid: 'u1', isAnonymous: false });
    expect(get('authors')).toBeUndefined();
    expect(linkingConfig.getStateFromPath!('app/house', linkingConfig.config)?.routes[0].name).toBe(
      Routes.Main,
    );
  });
});

describe('webOrigin (the https prefix)', () => {
  it.each([
    ['https://regroup-app.com', 'https://regroup-app.com'],
    ['https://regroup-app.com/', 'https://regroup-app.com'],
    ['https://Staging.Example.com/path?x=1', 'https://staging.example.com'],
    ['https://localhost:8443', 'https://localhost:8443'],
  ])('%s -> %s', (raw, origin) => {
    expect(webOrigin(raw, false)).toBe(origin);
  });

  it.each([
    ['empty', ''],
    ['blank', '   '],
    ['no scheme', 'regroup-app.com'],
    ['no host', 'https://'],
    ['a custom scheme', 'regroup-app://x'],
    ['userinfo', 'https://a@evil.example'],
  ])('rejects %s', (_label, raw) => {
    expect(webOrigin(raw, true)).toBeNull();
  });

  it('accepts http only in development', () => {
    expect(webOrigin('http://localhost:5000', false)).toBeNull();
    expect(webOrigin('http://localhost:5000', true)).toBe('http://localhost:5000');
  });

  it('defaults to allowing http only when __DEV__', () => {
    expect(webOrigin('http://localhost:5000')).toBe(__DEV__ ? 'http://localhost:5000' : null);
  });
});

describe('appLinkPrefixes with RATS_WEB_URL', () => {
  const original = process.env.RATS_WEB_URL;
  afterEach(() => {
    if (original === undefined) delete process.env.RATS_WEB_URL;
    else process.env.RATS_WEB_URL = original;
  });
  const prefixesWith = (url: string): string[] => {
    process.env.RATS_WEB_URL = url;
    let prefixes: string[] = [];
    jest.isolateModules(() => {
      prefixes = require('../appLinkPrefixes').appLinkPrefixes();
    });
    return prefixes;
  };

  it('drops an empty web URL instead of adding an empty prefix', () => {
    expect(prefixesWith('')).toEqual(['regroup-app://', 'com.rats.dev://']);
  });

  it('drops an invalid web URL', () => {
    expect(prefixesWith('not a url')).toEqual(['regroup-app://', 'com.rats.dev://']);
  });

  it('uses a valid https staging URL', () => {
    expect(prefixesWith('https://regroup-e2e.web.app/')).toEqual([
      'regroup-app://',
      'com.rats.dev://',
      'https://regroup-e2e.web.app',
    ]);
  });
});
