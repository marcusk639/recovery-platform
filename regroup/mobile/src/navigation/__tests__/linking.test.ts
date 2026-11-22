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
import { linkingConfig } from '../linking';
import { appLinkPrefixes } from '../appLinkPrefixes';
import { Routes } from '../types';

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
    const get = linkingConfig.getStateFromPath!;
    expect(get('?type=invitation&house=h1', linkingConfig.config)).toBeUndefined();
    expect(get('auth/signup?type=invitation&house=h1', linkingConfig.config)).toBeUndefined();
    expect(get('app/checkout-return?type=checkout-return', linkingConfig.config)).toBeUndefined();
    expect(get('app/house', linkingConfig.config)?.routes[0].name).toBe(Routes.Main);
  });
});
