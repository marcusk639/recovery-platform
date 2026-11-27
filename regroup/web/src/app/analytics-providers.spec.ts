import { NgZone } from '@angular/core';
import { AngularFireAnalytics } from '@angular/fire/analytics';
import {
  analyticsProviders,
  analyticsUnlessAppLinkPage,
  disableAnalyticsOnAppLinkPages,
  NoopAngularFireAnalytics,
} from './analytics-providers';

// Google Analytics' automatic page_view sends the full URL, and an invitation
// link carries its token (/invite#token=…; older links /invite?token=… and
// /redirect?url=…token…).
const APP_LINK_PAGES = [
  '/invite',
  '/invite/',
  '/checkout-return',
  '/app',
  '/app/house',
  '/redirect',
];
const OTHER_PAGES = ['/', '/pricing', '/invites', '/apple', '/my-account', '/redirects'];

describe('disableAnalyticsOnAppLinkPages', () => {
  const ID = 'G-TEST000000';
  const pageAt = (pathname: string) => ({ location: { pathname } }) as unknown as Window;

  for (const pathname of APP_LINK_PAGES) {
    it(`turns Google Analytics off on ${pathname}`, () => {
      const win = pageAt(pathname);
      expect(disableAnalyticsOnAppLinkPages(win, ID)).toBe(true);
      expect((win as any)[`ga-disable-${ID}`]).toBe(true);
    });
  }

  for (const pathname of OTHER_PAGES) {
    it(`leaves Google Analytics on for ${pathname}`, () => {
      const win = pageAt(pathname);
      expect(disableAnalyticsOnAppLinkPages(win, ID)).toBe(false);
      expect((win as any)[`ga-disable-${ID}`]).toBeUndefined();
    });
  }

  it('does nothing without a measurement id', () => {
    const win = pageAt('/invite');
    expect(disableAnalyticsOnAppLinkPages(win, undefined)).toBe(false);
    expect(Object.keys(win)).toEqual(['location']);
  });
});

// The ga-disable flag names the configured measurement id, but firebase sends
// with the id it fetches; on these pages the SDK must not load at all.
describe('analyticsUnlessAppLinkPage', () => {
  const docAt = (pathname: string) => ({ location: { pathname } }) as unknown as Document;
  const build = (pathname: string) =>
    analyticsUnlessAppLinkPage(
      docAt(pathname),
      {} as any,
      null,
      null,
      null,
      null,
      null,
      'server',
      new NgZone({}),
    );

  for (const pathname of APP_LINK_PAGES) {
    it(`gives the no-op service on ${pathname}`, () => {
      expect(build(pathname) instanceof NoopAngularFireAnalytics).toBe(true);
    });
  }

  for (const pathname of OTHER_PAGES) {
    it(`gives the real service on ${pathname}`, () => {
      expect(build(pathname) instanceof AngularFireAnalytics).toBe(true);
    });
  }
});

describe('analyticsProviders', () => {
  it('provides AngularFireAnalytics through the app-link-page factory when analytics is on', () => {
    const [provider] = analyticsProviders({ production: true }) as any[];
    expect(provider.provide).toBe(AngularFireAnalytics);
    expect(provider.useFactory).toBe(analyticsUnlessAppLinkPage);
  });

  it('provides the no-op service when analytics is off', () => {
    expect(analyticsProviders({ production: true, useAnalytics: false })).toEqual([
      { provide: AngularFireAnalytics, useClass: NoopAngularFireAnalytics },
    ]);
  });
});
