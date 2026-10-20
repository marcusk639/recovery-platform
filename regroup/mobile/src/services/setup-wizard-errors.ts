// User-facing errors for initializeHouses (setup-wizard.ts).
//
// The createHouses callable returns user-safe messages for the outcomes an
// operator can act on (no active plan, property limit, bad input, ...); those
// are surfaced verbatim. Anything else (internal, network, unknown) gets a
// generic retry message. Failures AFTER the callable succeeded must not claim
// the houses were not created.

export const CREATE_HOUSES_RETRY_MESSAGE =
  "We couldn't finish creating your houses. Please try again.";

export const HOUSES_CREATED_RESTART_MESSAGE =
  'Your houses were created. Please restart the app to finish setup.';

// Callable error codes whose server message is written for the operator.
const USER_SAFE_CODES = new Set([
  'failed-precondition',
  'already-exists',
  'permission-denied',
  'invalid-argument',
]);

const withCause = (message: string, cause: unknown): Error =>
  Object.assign(new Error(message), { cause });

/**
 * Maps a createHouses rejection to the Error shown to the operator. Codes may
 * arrive bare ("failed-precondition", @react-native-firebase) or prefixed
 * ("functions/failed-precondition", web SDK).
 */
export const toCreateHousesError = (error: unknown): Error => {
  const { code, message } = (error ?? {}) as { code?: unknown; message?: unknown };
  const normalized = typeof code === 'string' ? code.replace(/^functions\//, '') : '';
  const serverMessage =
    USER_SAFE_CODES.has(normalized) && typeof message === 'string' ? message.trim() : '';
  return withCause(serverMessage || CREATE_HOUSES_RETRY_MESSAGE, error);
};

/** A failure after createHouses succeeded: the houses exist server-side. */
export const housesCreatedError = (cause: unknown): Error =>
  withCause(HOUSES_CREATED_RESTART_MESSAGE, cause);
