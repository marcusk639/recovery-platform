import FirebaseAuth from '@react-native-firebase/auth';
import { auth, functions } from '../../firebase-setup';
import { logException } from '../util/logging';

/**
 * Re-auth failures that can mean the account is already gone: the server
 * deleted it but the callable's response was lost. `auth/invalid-credential`
 * is included because email-enumeration protection reports a deleted user
 * that way; a genuine wrong password still rethrows because the user exists.
 */
const MAYBE_GONE_REAUTH_CODES = [
  'auth/user-not-found',
  'auth/user-disabled',
  'auth/user-token-expired',
  'auth/invalid-credential',
];
const GONE_RELOAD_CODES = ['auth/user-not-found', 'auth/user-token-expired'];

type CurrentUser = NonNullable<typeof auth.currentUser>;

/** True only when Firebase confirms the signed-in account no longer exists. */
async function accountIsGone(user: CurrentUser): Promise<boolean> {
  try {
    await user.reload();
    return false;
  } catch (err: any) {
    return GONE_RELOAD_CODES.includes(err?.code);
  }
}

/** Sign-out after a completed deletion must not turn success into failure. */
async function signOutAfterDeletion(): Promise<void> {
  try {
    await auth.signOut();
  } catch (err) {
    logException(err, 'Sign-out failed after account deletion');
  }
}

/**
 * Permanently deletes the signed-in user's account.
 * The server requires a sign-in within the last 5 minutes, so we
 * re-authenticate with the password and force a token refresh first.
 * If a step fails but the account turns out to be gone already (an earlier
 * attempt succeeded server-side), resolves as a successful deletion.
 * Otherwise rejects with the original Firebase error (e.g. auth/wrong-password).
 */
export async function deleteMyAccount(password: string): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.email) {
    throw new Error('No signed-in user');
  }
  const credential = FirebaseAuth.EmailAuthProvider.credential(currentUser.email, password);
  try {
    await currentUser.reauthenticateWithCredential(credential);
  } catch (err: any) {
    if (MAYBE_GONE_REAUTH_CODES.includes(err?.code) && (await accountIsGone(currentUser))) {
      await signOutAfterDeletion();
      return;
    }
    throw err;
  }
  try {
    await currentUser.getIdToken(true);
    await functions.httpsCallable('deleteAccount')();
  } catch (err) {
    if (await accountIsGone(currentUser)) {
      await signOutAfterDeletion();
      return;
    }
    throw err;
  }
  await signOutAfterDeletion();
}
