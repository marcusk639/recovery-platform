/**
 * Network-error detection shared by the offline queue and activity logging.
 */

/**
 * Firestore error codes that indicate the client is offline. React Native
 * Firebase reports them namespaced ('firestore/unavailable'); the JS SDK uses
 * the bare form, so both are matched.
 * See https://firebase.google.com/docs/reference/js/firestore_.firestoreerrorcode
 */
const OFFLINE_ERROR_CODES = new Set([
  'unavailable', // service is currently unavailable
  'deadline-exceeded', // request deadline exceeded: likely a network issue
  'firestore/unavailable',
  'firestore/deadline-exceeded',
]);

const OFFLINE_ERROR_MESSAGES = [
  'network error',
  'failed to get',
  'client is offline',
  'could not reach cloud firestore',
  "backend didn't respond",
  'transport errored',
];

/**
 * Returns true when the caught error looks like a transient network outage
 * rather than a permanent logical error (permission denied, not found, etc.).
 */
export function isNetworkError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const err = error as Record<string, unknown>;

  if (typeof err.code === 'string' && OFFLINE_ERROR_CODES.has(err.code)) {
    return true;
  }

  const message = typeof err.message === 'string' ? err.message.toLowerCase() : '';
  if (OFFLINE_ERROR_MESSAGES.some((fragment) => message.includes(fragment))) {
    return true;
  }

  // A wrapper that kept the original as `cause` is as offline as its cause.
  return err.cause !== undefined && err.cause !== error && isNetworkError(err.cause);
}

/** True for Firestore's permission-denied, bare or `firestore/`-namespaced. */
export function isPermissionDenied(error: unknown): boolean {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  return code === 'permission-denied' || code === 'firestore/permission-denied';
}
