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
    expect(
      get('auth/signup?type=invitation&house=h1', linkingConfig.config)?.routes[0].state
        ?.routes[0].name,
    ).toBe(Routes.Signup);
    expect(get('app/checkout-return?type=checkout-return', linkingConfig.config)).toBeUndefined();
    expect(get('app/checkout-return?result=success', linkingConfig.config)).toBeUndefined();
    expect(get('app/house', linkingConfig.config)?.routes[0].name).toBe(Routes.Main);
  });
});

describe('isHandledElsewhere (parseAppLink is the guard)', () => {
  it.each([
    '?type=invitation&token=t1',
    '?token=t1&type=invitation',
    '?type=other&type=invitation&token=t1',
    '?type=invitation&house=h1&email=a@rats-e2e.com',
    'invite?token=t1',
    '/invite?token=t1&utm_source=email',
    'checkout-return?result=success',
    '/checkout-return?result=portal',
    'app/checkout-return?result=canceled',
  ])('declines %s', (p) => {
    expect(isHandledElsewhere(p)).toBe(true);
  });

  it('reads the whole query after the first ?, so a second ? hides nothing', () => {
    expect(isHandledElsewhere('?utm=a?b&type=invitation&token=t1')).toBe(true);
  });

  it.each(['app/house', 'auth/login', 'app/house?type=invitation', 'pricing'])(
    'leaves %s to navigation',
    (p) => {
      expect(isHandledElsewhere(p)).toBe(false);
    },
  );
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
