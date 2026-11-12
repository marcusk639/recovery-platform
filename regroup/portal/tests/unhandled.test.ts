import { beforeEach } from 'vitest';
import { currentAlert, resetAlerts } from '../src/adapter/alert/alert-store';
import { NativeFeatureUnavailable } from '../src/adapter/deferred';
import { installUnhandledFeatureAlerts } from '../src/adapter/unhandled';

installUnhandledFeatureAlerts();
beforeEach(() => resetAlerts());

test('a deferred feature thrown from an event handler becomes an alert', () => {
  window.dispatchEvent(new ErrorEvent('error', { error: new NativeFeatureUnavailable('react-native-image-picker') }));
  expect(currentAlert()?.title).toMatch(/not available on the web yet/i);
});
test('a deferred feature rejected from an async handler becomes an alert', () => {
  const event = Object.assign(new Event('unhandledrejection'), { reason: new NativeFeatureUnavailable('x') });
  window.dispatchEvent(event);
  expect(currentAlert()?.title).toMatch(/not available on the web yet/i);
});
test('other errors are left alone', () => {
  window.dispatchEvent(new ErrorEvent('error', { error: new Error('something else') }));
  expect(currentAlert()).toBeUndefined();
});
