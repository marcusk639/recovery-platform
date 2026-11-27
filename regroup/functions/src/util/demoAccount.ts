/**
 * The shared App Review demo login (`InitialLandingForm.tsx` signs in with
 * it, so its password is public). The Firestore rules scope it to houses with
 * `isDemoHouse: true` (`isDemoAccount()` / `isDemoScopedHouses()`), the
 * Storage rules refuse every upload and delete by it, and the callables that
 * change state or cost money (Stripe, email, invitations, claims, deletes)
 * refuse it here. Reads stay open so the demo can still be shown.
 *
 * Identified by the server-set custom claim `demo: true` (DEMO_CLAIM), which
 * its holder cannot change: anyone signed in as the demo user can change its
 * email through Firebase Auth, which would escape an email check. The email
 * (lower-cased, as the rules and the app's `isDemo` compare it) still counts
 * until the claim is set in production with `npm run demo:mark-account`. The
 * claims writers keep the claim (`util/claims.ts` parseCurrentClaims), and
 * `scheduled/demoAccountRestore.ts` puts back the email and password if
 * someone changes them.
 */
import { HttpsError } from 'firebase-functions/v2/https';

export const DEMO_ACCOUNT_EMAIL = 'demo_user@appdemo.net';

/** The same words the app's demo popovers show. */
export const DEMO_REFUSED_MESSAGE = 'This functionality is disabled in demo mode.';

/** The custom claim that marks the demo account. */
export const DEMO_CLAIM = 'demo';

type CallerAuth = { token?: { email?: unknown; demo?: unknown } } | null | undefined;

export function isDemoAccount(auth: CallerAuth): boolean {
  if (auth?.token?.[DEMO_CLAIM] === true) return true;
  const email = auth?.token?.email;
  return typeof email === 'string' && email.toLowerCase() === DEMO_ACCOUNT_EMAIL;
}

/** Throws `permission-denied` for the demo account; call it before any side effect. */
export function refuseDemoAccount(auth: CallerAuth): void {
  if (isDemoAccount(auth)) {
    throw new HttpsError('permission-denied', DEMO_REFUSED_MESSAGE);
  }
}
