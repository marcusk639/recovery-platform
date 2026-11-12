// A deferred feature used from a button throws outside any render, where an error
// boundary can't see it, and the button would just look dead.
import { Alert } from './alert/alert-store';
import { NativeFeatureUnavailable } from './deferred';

function report(error: unknown): void {
  if (error instanceof NativeFeatureUnavailable) Alert.alert(error.message);
}

export function installUnhandledFeatureAlerts(): void {
  window.addEventListener('error', (event) => report(event.error));
  window.addEventListener('unhandledrejection', (event) => report(event.reason));
}
