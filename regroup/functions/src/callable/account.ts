import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { STRIPE_SECRET_KEY } from '../config';
import { runAccountDeletion } from '../accountDeletion';

const MAX_AUTH_AGE_SECONDS = 300;
// Shared App Review demo login; mirrors isDemoAccount() in mobile/firebase/firestore.rules.
export const DEMO_ACCOUNT_EMAIL = 'demo_user@appdemo.net';

const RETRY_MESSAGE = "We couldn't finish deleting your account. Try again.";
export const PARTIAL_MESSAGE =
  'Part of your account was already removed. Please try again; contact support if this keeps happening.';

/**
 * In-app account deletion (App Store 5.1.1(v)). Takes no input: always deletes
 * the caller's own account, and only after a recent sign-in.
 * The `failed-precondition` (stale sign-in) and `permission-denied` (demo)
 * messages are written for the user and shown as-is by the app. A failed run
 * returns `internal` with a fixed message; when earlier steps already removed
 * data it says so and sets `details.partial`, so the app can show it.
 */
export const deleteAccount = onCall({ secrets: [STRIPE_SECRET_KEY] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required');
  }
  const { uid, token } = request.auth;

  const authTime = token.auth_time;
  if (
    typeof authTime !== 'number' ||
    !Number.isFinite(authTime) ||
    Date.now() / 1000 - authTime > MAX_AUTH_AGE_SECONDS
  ) {
    throw new HttpsError('failed-precondition', 'Please sign in again to delete your account');
  }

  const email = typeof token.email === 'string' ? token.email.toLowerCase() : undefined;
  if (email === DEMO_ACCOUNT_EMAIL) {
    throw new HttpsError('permission-denied', "The demo account can't be deleted.");
  }

  try {
    await runAccountDeletion(uid);
  } catch (err) {
    const e = err as { code?: unknown; step?: unknown; partial?: unknown };
    logger.error('deleteAccount failed', {
      uid,
      code: typeof e?.code === 'string' ? e.code : undefined,
      step: typeof e?.step === 'string' ? e.step : undefined,
    });
    if (e?.partial === true) {
      throw new HttpsError('internal', PARTIAL_MESSAGE, { partial: true });
    }
    throw new HttpsError('internal', RETRY_MESSAGE);
  }

  return { deleted: true };
});
