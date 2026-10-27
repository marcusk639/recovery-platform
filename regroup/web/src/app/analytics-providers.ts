import { Injectable, Provider } from '@angular/core';
import { AngularFireAnalytics, AngularFireAnalyticsModule } from '@angular/fire/analytics';

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

/**
 * The no-op AngularFireAnalytics when analytics is off; nothing otherwise.
 * Provided from AppModule, which takes precedence over AngularFireAnalytics'
 * own `providedIn: 'any'` (the app has no lazy-loaded modules).
 */
export function analyticsProviders(env: AnalyticsAwareEnvironment): Provider[] {
  return env.useAnalytics === false
    ? [{ provide: AngularFireAnalytics, useClass: NoopAngularFireAnalytics }]
    : [];
}
