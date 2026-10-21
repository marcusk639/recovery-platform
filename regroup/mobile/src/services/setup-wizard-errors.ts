// User-facing errors for initializeHouses (setup-wizard.ts).
//
// Only codes whose server messages are safe to show are surfaced verbatim
// (property limit, bad input, ...). The no-active-plan refusal becomes the
// distinct subscription-required kind so OrgSetup can offer the plan screen.
// Refusals that only an inconsistent account can hit (already-exists,
// permission-denied) get a contact-support message; the server logs them
// with the uid. Anything else (internal, network, unknown) gets a generic
// retry message. Failures AFTER the houses were created must not claim they
// were not.

export const CREATE_HOUSES_RETRY_MESSAGE =
  "We couldn't finish creating your houses. Please try again.";

export const CREATE_HOUSES_CONTACT_SUPPORT_MESSAGE =
  'Something went wrong creating your houses. Please contact support.';

export const HOUSES_CREATED_RESTART_MESSAGE =
  'Your houses were created. Tap Complete Setup again or restart the app to finish.';

export const SUBSCRIPTION_REQUIRED_MESSAGE =
  'An active subscription is required to create houses. Choose a plan to continue.';

/** Error `code` of the subscription-required kind; survives Redux serialization. */
export const SUBSCRIPTION_REQUIRED_CODE = 'setup/subscription-required';

// Callable error codes whose server messages are safe to show.
const USER_SAFE_CODES = new Set(['failed-precondition', 'invalid-argument']);
const CONTACT_SUPPORT_CODES = new Set(['already-exists', 'permission-denied']);

const withCause = (message: string, cause: unknown, code?: string): Error =>
  Object.assign(new Error(message), { cause }, code ? { code } : {});

/**
 * Maps a createHouses rejection to the Error shown to the operator. Codes may
 * arrive bare ("failed-precondition", @react-native-firebase) or prefixed
 * ("functions/failed-precondition", web SDK).
 */
export const toCreateHousesError = (error: unknown): Error => {
  const { code, message } = (error ?? {}) as { code?: unknown; message?: unknown };
  const normalized = typeof code === 'string' ? code.replace(/^functions\//, '') : '';
  const text = typeof message === 'string' ? message.trim() : '';
  if (
    normalized === 'failed-precondition' &&
    text.startsWith('An active subscription is required')
  ) {
    return withCause(SUBSCRIPTION_REQUIRED_MESSAGE, error, SUBSCRIPTION_REQUIRED_CODE);
  }
  if (normalized === 'internal' && text.startsWith('Houses were created')) {
    return housesCreatedError(error);
  }
  if (CONTACT_SUPPORT_CODES.has(normalized)) {
    return withCause(CREATE_HOUSES_CONTACT_SUPPORT_MESSAGE, error);
  }
  const serverMessage = USER_SAFE_CODES.has(normalized) ? text : '';
  return withCause(serverMessage || CREATE_HOUSES_RETRY_MESSAGE, error);
};

/** A failure after createHouses succeeded: the houses exist server-side. */
export const housesCreatedError = (cause: unknown): Error =>
  withCause(HOUSES_CREATED_RESTART_MESSAGE, cause);

/** True for an Error (or serialized Redux error) of the subscription-required kind. */
export const isSubscriptionRequiredError = (error: unknown): boolean =>
  (error as { code?: unknown } | null)?.code === SUBSCRIPTION_REQUIRED_CODE;
