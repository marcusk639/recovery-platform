import { arrayUnion, doc, updateDoc } from '@react-native-firebase/firestore';
import { userCollection } from './users';

/**
 * Adds a device's FCM token to users/{id}.messagingToken. Each of a user's
 * devices adds its own and the server pushes to all of them, so this adds to
 * the stored array rather than writing the app's copy of it, which would drop
 * a token another device added since that copy was read.
 */
export async function addMessagingToken(userId: string, token: string): Promise<void> {
  await updateDoc(doc(userCollection, userId), { messagingToken: arrayUnion(token) });
}
