import firestore, {
  FirebaseFirestoreTypes,
} from '@react-native-firebase/firestore';
import {refreshAuthToken} from '../services/firebase/auth';

/**
 * Fetches a Firestore document and throws with `notFoundMessage` if it
 * doesn't exist — collapses the "fetch → check .exists → throw" preamble
 * repeated across MemberModel's mutation methods into one call.
 */
export async function getRequiredDoc(
  collectionPath: string,
  docId: string,
  notFoundMessage: string,
): Promise<FirebaseFirestoreTypes.DocumentSnapshot> {
  const snap = await firestore().collection(collectionPath).doc(docId).get();
  if (!snap.exists) {
    throw new Error(notFoundMessage);
  }
  return snap;
}

/**
 * Wraps an async model operation in the standard log-and-rethrow pattern
 * used throughout the models layer, so each method doesn't hand-roll its
 * own try/catch with a slightly different log message.
 */
export async function withModelErrorHandling<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console.error(`${label}:`, error);
    throw error;
  }
}

/**
 * If the acting user is the same as the affected user, schedules a
 * delayed auth-token refresh so newly-synced custom claims (admin,
 * treasurer, etc.) take effect without requiring a manual re-login.
 * Fire-and-forget by design — failures are logged, never thrown, since
 * this is a best-effort UX nicety, not a critical path.
 */
export function scheduleTokenRefresh(
  userId: string,
  currentUserId: string | undefined,
  context: string,
): void {
  if (currentUserId && currentUserId === userId) {
    setTimeout(async () => {
      try {
        await refreshAuthToken();
      } catch (e) {
        console.warn(`${context}:`, e);
      }
    }, 2000);
  }
}
