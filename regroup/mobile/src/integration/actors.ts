/**
 * Acting users for the integration suite. Each suite signs the client SDK in
 * as the user its service call names (loggedBy, disputedBy, resolvedBy, ...),
 * with that user's house-role claims, so the security rules judge every write
 * exactly as they would in the app.
 */
import { signInWithCustomToken } from 'firebase/auth';
import { adminAuth } from './firebase-admin-setup';
import { auth } from './rnfb-to-web';

/** Custom claims in the shape the server grants: role → { houseId: true }. */
export type HouseClaims = Partial<Record<'admin' | 'superAdmin' | 'guest', Record<string, true>>>;

export const adminOf = (houseId: string): HouseClaims => ({ admin: { [houseId]: true } });
export const guestOf = (houseId: string): HouseClaims => ({ guest: { [houseId]: true } });

/** Signs in as `uid` with `claims`, through the Auth emulator. */
export async function signInAs(uid: string, claims: HouseClaims): Promise<void> {
  const token = await adminAuth.createCustomToken(uid, claims);
  await signInWithCustomToken(auth, token);
}
