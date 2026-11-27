/**
 * The shared App Review demo login (`InitialLandingForm.tsx` signs in with
 * it, so its password is public). The Firestore rules scope it to houses with
 * `isDemoHouse: true` (`isDemoAccount()` / `isDemoScopedHouses()`), the
 * Storage rules refuse every upload and delete by it, and the callables that
 * change state or cost money (Stripe, email, invitations, claims, deletes)
 * refuse it here. Reads stay open so the demo can still be shown.
 *
 * Identified by the token's email, compared lower-cased, as the rules and the
 * app (`mobile/src/util/user.ts` `isDemo`) do.
 */
import { HttpsError } from 'firebase-functions/v2/https';

export const DEMO_ACCOUNT_EMAIL = 'demo_user@appdemo.net';

/** The same words the app's demo popovers show. */
export const DEMO_REFUSED_MESSAGE = 'This functionality is disabled in demo mode.';

type CallerAuth = { token?: { email?: unknown } } | null | undefined;

export function isDemoAccount(auth: CallerAuth): boolean {
  const email = auth?.token?.email;
  return typeof email === 'string' && email.toLowerCase() === DEMO_ACCOUNT_EMAIL;
}

/** Throws `permission-denied` for the demo account; call it before any side effect. */
export function refuseDemoAccount(auth: CallerAuth): void {
  if (isDemoAccount(auth)) {
    throw new HttpsError('permission-denied', DEMO_REFUSED_MESSAGE);
  }
}
