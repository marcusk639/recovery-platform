import FirebaseAuth from '@react-native-firebase/auth';
import { auth, functions } from '../../firebase-setup';
import { offlineQueue } from './offlineQueue';
import { logException } from '../util/logging';

/**
 * Re-auth failures that can mean the account is already gone: the server
 * deleted it but the callable's response was lost. `auth/invalid-credential`
 * is included because email-enumeration protection can report a deleted user
 * that way. Each one is only a hint; `checkAccount` decides.
 */
const MAYBE_GONE_REAUTH_CODES = [
  'auth/user-not-found',
  'auth/user-disabled',
  'auth/user-token-expired',
  'auth/invalid-credential',
];
/** Reload failures that leave it unknown whether the account still exists. */
const UNCONFIRMED_RELOAD_CODES = ['auth/user-token-expired', 'auth/user-disabled'];

export const DELETION_UNCONFIRMED_CODE = 'account/deletion-unconfirmed';
export const DELETION_UNCONFIRMED_MESSAGE =
  "We couldn't confirm your account was deleted. Sign in again to check.";

type CurrentUser = NonNullable<typeof auth.currentUser>;
type AccountState = 'exists' | 'gone' | 'unconfirmed';

/**
 * Asks Firebase whether the signed-in account still exists. Only
 * `auth/user-not-found` proves it is gone; an expired token or disabled user
 * cannot tell a deleted account from a live one.
 */
async function checkAccount(user: CurrentUser): Promise<AccountState> {
  try {
    await user.reload();
    return 'exists';
  } catch (err: any) {
    if (err?.code === 'auth/user-not-found') return 'gone';
    if (UNCONFIRMED_RELOAD_CODES.includes(err?.code)) return 'unconfirmed';
    return 'exists';
  }
}

/**
 * Clears the offline queue, then signs out, for a deletion that happened (or
 * can't be ruled out). Neither step may mask the outcome. The uid is the one
 * captured when deletion started: native SDKs null `auth.currentUser` on
 * user-not-found / token-expired before this runs.
 */
async function signOutQuietly(uid: string): Promise<void> {
  try {
    await offlineQueue.clearUser(uid);
  } catch (err) {
    logException(err, 'Offline queue clear failed after account deletion');
  }
  try {
    await auth.signOut();
  } catch (err) {
    logException(err, 'Sign-out failed after account deletion');
  }
}

/**
 * After a failure: resolves when the account is confirmed gone, signs out and
 * throws a "couldn't confirm" error when that can't be known, else rethrows.
 */
async function settleFailure(user: CurrentUser, uid: string, err: unknown): Promise<void> {
  const state = await checkAccount(user);
  if (state === 'exists') throw err;
  await signOutQuietly(uid);
  if (state === 'unconfirmed') {
    throw Object.assign(new Error(DELETION_UNCONFIRMED_MESSAGE), {
      code: DELETION_UNCONFIRMED_CODE,
    });
  }
}

/**
 * Permanently deletes the signed-in user's account.
 * The server requires a sign-in within the last 5 minutes, so we
 * re-authenticate with the password and force a token refresh first.
 * If a step fails, Firebase is asked whether the account still exists:
 * confirmed gone (an earlier attempt succeeded server-side) resolves as a
 * successful deletion; unknown signs out and rejects with
 * DELETION_UNCONFIRMED_CODE; otherwise the original error is rethrown
 * (e.g. auth/wrong-password, or the callable's error).
 */
export async function deleteMyAccount(password: string): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.email) {
    throw new Error('No signed-in user');
  }
  const uid = currentUser.uid;
  const credential = FirebaseAuth.EmailAuthProvider.credential(currentUser.email, password);
  try {
    await currentUser.reauthenticateWithCredential(credential);
  } catch (err: any) {
    if (!MAYBE_GONE_REAUTH_CODES.includes(err?.code)) throw err;
    await settleFailure(currentUser, uid, err);
    return;
  }
  try {
    await currentUser.getIdToken(true);
    await functions.httpsCallable('deleteAccount')();
  } catch (err) {
    await settleFailure(currentUser, uid, err);
    return;
  }
  await signOutQuietly(uid);
}
