import { Injectable, NgZone, Optional, PLATFORM_ID, Provider } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { FirebaseApp } from '@angular/fire';
import {
  AngularFireAnalytics,
  AngularFireAnalyticsModule,
  APP_NAME,
  APP_VERSION,
  COLLECTION_ENABLED,
  CONFIG,
  DEBUG_MODE,
} from '@angular/fire/analytics';

/** The subset of an environment file this module reads. */
export interface AnalyticsAwareEnvironment {
  production: boolean;
  /** Only the e2e environments set this, to `false`. Absent means analytics on. */
  useAnalytics?: boolean;
}

/**
 * Stand-in for AngularFireAnalytics in the e2e builds. There is no Analytics
 * emulator, and the real service loads gtag, calls Firebase Installations and
 * fetches the web config from Google, so e2e builds never construct it.
 * Covers every method the app calls (logEvent) plus the other public
 * AngularFireAnalytics methods; each resolves and does nothing.
 */
@Injectable()
export class NoopAngularFireAnalytics {
  readonly app = Promise.resolve(undefined);
  logEvent(_name: string, _params?: object, _options?: object): Promise<void> {
    return Promise.resolve();
  }
  setUserId(_id: string, _options?: object): Promise<void> {
    return Promise.resolve();
  }
  setUserProperties(_properties: object, _options?: object): Promise<void> {
    return Promise.resolve();
  }
  setCurrentScreen(_screenName: string, _options?: object): Promise<void> {
    return Promise.resolve();
  }
  setAnalyticsCollectionEnabled(_enabled: boolean): Promise<void> {
    return Promise.resolve();
  }
}

/**
 * AngularFireAnalyticsModule unless analytics is off. The module's constructor
 * loads the Analytics SDK eagerly (before any APP_INITIALIZER), so the e2e
 * builds must not import it at all. Single return statement so the Angular
 * compiler can evaluate it statically in AppModule's `imports`.
 */
export function analyticsImports(
  env: AnalyticsAwareEnvironment,
): (typeof AngularFireAnalyticsModule)[] {
  return env.useAnalytics === false ? [] : [AngularFireAnalyticsModule];
}

// Pages whose URL can carry an invitation token: the landing page's paths
// (regroup/app-links.json `paths`) and /redirect, which older emails used.
const APP_LINK_PATH = /^\/(invite|checkout-return|app|redirect)(\/|$)/;

/**
 * Turns Google Analytics off for a page load that starts on an app-link page.
 * Its automatic page_view sends the full URL, and an invitation link's query
 * carries the token. gtag reads `ga-disable-<id>` when it sends, so this must
 * run before bootstrap: firebase's own setAnalyticsCollectionEnabled only lands
 * after the page_view is queued.
 */
export function disableAnalyticsOnAppLinkPages(
  win: Window,
  measurementId: string | undefined,
): boolean {
  if (!measurementId || !APP_LINK_PATH.test(win.location.pathname)) {
    return false;
  }
  (win as unknown as Record<string, boolean>)[`ga-disable-${measurementId}`] = true;
  return true;
}

/**
 * AngularFireAnalytics, or the no-op one on a page load that starts on an
 * app-link page, so the Analytics SDK never loads there. The ga-disable flag
 * alone isn't enough: it names the configured measurement id, and firebase
 * sends with the id it fetches. Arguments are AngularFireAnalytics' own deps.
 */
export function analyticsUnlessAppLinkPage(
  document: Document,
  app: FirebaseApp,
  collectionEnabled: boolean | null,
  appVersion: string | null,
  appName: string | null,
  debugMode: boolean | null,
  config: object | null,
  // tslint:disable-next-line:ban-types (PLATFORM_ID is typed Object)
  platformId: Object,
  zone: NgZone,
): AngularFireAnalytics | NoopAngularFireAnalytics {
  if (APP_LINK_PATH.test(document.location?.pathname ?? '')) {
    return new NoopAngularFireAnalytics();
  }
  return new AngularFireAnalytics(
    app,
    collectionEnabled,
    appVersion,
    appName,
    debugMode,
    config as any,
    platformId,
    zone,
  );
}

/**
 * The no-op AngularFireAnalytics when analytics is off; otherwise the real one
 * except on app-link pages (analyticsUnlessAppLinkPage). Provided from
 * AppModule, which takes precedence over AngularFireAnalytics' own
 * `providedIn: 'any'` and the module's provider (no lazy-loaded modules), so
 * AngularFireAnalyticsModule's eager constructor gets this one too.
 */
export function analyticsProviders(env: AnalyticsAwareEnvironment): Provider[] {
  return env.useAnalytics === false
    ? [{ provide: AngularFireAnalytics, useClass: NoopAngularFireAnalytics }]
    : [
        {
          provide: AngularFireAnalytics,
          useFactory: analyticsUnlessAppLinkPage,
          deps: [
            DOCUMENT,
            FirebaseApp,
            [new Optional(), COLLECTION_ENABLED],
            [new Optional(), APP_VERSION],
            [new Optional(), APP_NAME],
            [new Optional(), DEBUG_MODE],
            [new Optional(), CONFIG],
            PLATFORM_ID,
            NgZone,
          ],
        },
      ];
}
