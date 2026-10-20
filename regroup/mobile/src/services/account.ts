import FirebaseAuth from "@react-native-firebase/auth";
import { auth, functions } from "../../firebase-setup";

/**
 * Permanently deletes the signed-in user's account.
 * The server requires a sign-in within the last 5 minutes, so we
 * re-authenticate with the password and force a token refresh first.
 * Rejects with the original Firebase error (e.g. auth/wrong-password).
 */
export async function deleteMyAccount(password: string): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.email) {
    throw new Error("No signed-in user");
  }
  const credential = FirebaseAuth.EmailAuthProvider.credential(
    currentUser.email,
    password
  );
  await currentUser.reauthenticateWithCredential(credential);
  await currentUser.getIdToken(true);
  await functions.httpsCallable("deleteAccount")();
  await auth.signOut();
}
