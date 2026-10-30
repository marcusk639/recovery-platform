// Shared across Task 10 migration groups: typed for both APIs until RNFirebase 26 (Task 10f).
import {
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  where,
  writeBatch,
  type CollectionReference,
  type DocumentData,
  type FirebaseFirestoreTypes as SharedRefTypes,
} from '@react-native-firebase/firestore';
import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  getAuth,
  getIdToken,
  getIdTokenResult,
  linkWithCredential,
  sendPasswordResetEmail,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type IdTokenResult,
  type UserCredential,
} from '@react-native-firebase/auth';
import { getDownloadURL, getStorage, ref } from '@react-native-firebase/storage';
import { cloneDeep } from 'lodash';
import { firestore, functions } from '../../firebase-setup';
import * as houseService from './house';
import { User } from '../entities/User';
import * as crud from './crud';
import { getFirebaseUserFromUserCredential } from '../util/user';
import { Guest } from '../entities/Guest';
import Admin from '../entities/Admin';
import { guestCollection } from './guest';
import { adminCollection } from './admin';
import { uploadUserAvatar } from './storage';
import { logException } from '../util/logging';
import {
  finishOperatorSetupIfNeeded,
  loadRecoveredUser,
  type HouseRoleClaims,
} from './operator-setup';
import { SimpleValidationService } from './SimpleValidationService';
// import { EmailConfirmationPayload } from '../entities/Email'; // Email verification removed

export const userCollection = collection(firestore, 'users') as CollectionReference &
  SharedRefTypes.CollectionReference;

/**
 * Throws a client-side rate-limit error shaped like a Firebase auth error
 * (`.code = 'auth/too-many-requests'`) so it flows through the existing
 * getAuthenticationErrorMessage() mapping already used by Login.tsx for both
 * sign-in and forgot-password errors, without adding a second error-handling
 * path. The rate limit itself is in-memory only (resets on app restart) —
 * it raises the bar against rapid automated attempts within a session, it is
 * not a substitute for server-side throttling.
 */
function rateLimitError(message: string): Error {
  return Object.assign(new Error(message), {
    code: 'auth/too-many-requests',
  });
}

/**
 * Throws an error shaped like Firebase's own `auth/invalid-email`, reusing
 * the existing mapped message rather than introducing a new one.
 */
function invalidEmailError(message: string): Error {
  return Object.assign(new Error(message), { code: 'auth/invalid-email' });
}

/**
 * Creates a new user with email and password
 * @param {*} email
 * @param {*} password
 */
export async function createUserWithEmail(
  email: string,
  password: string,
): Promise<UserCredential> {
  return createUserWithEmailAndPassword(getAuth(), email, password);
}

export async function anonymouslyLogin(): Promise<UserCredential> {
  return signInAnonymously(getAuth());
}

/**
 * Logs in an existing user with email and password.
 *
 * Hardened 2026-07-04: added client-side rate limiting (5 attempts / 60s per
 * email) and email-format validation/sanitization, using the same
 * SimpleValidationService primitives EnhancedAuthService.ts already relies
 * on for this — that class exists in the codebase, fully tested, but was
 * never actually wired into the live login path. Deliberately NOT routed
 * through EnhancedAuthService.signInWithEmail() directly: that method
 * returns an AuthResult wrapper (not a FirebaseAuthTypes.UserCredential) and
 * also gates on `user.emailVerified`, which is incompatible with this app —
 * email verification is intentionally disabled here (see
 * convertFirebaseUserToRatsUser's hardcoded `emailVerified: true` below), so
 * real users' actual Firebase emailVerified flag is not a reliable signal
 * and gating sign-in on it would lock out real accounts. Reusing the
 * validation primitives directly here avoids both of those risks while still
 * giving real users the same protection.
 * @param {*} email
 * @param {*} password
 */
export async function signInWithEmail(
  email: string,
  password: string,
): Promise<UserCredential> {
  if (!SimpleValidationService.checkRateLimit(`signin_${email}`, 5, 60000)) {
    throw rateLimitError('Too many sign-in attempts. Please try again later.');
  }

  const emailValidation = SimpleValidationService.validateEmail(email);
  if (!emailValidation.isValid) {
    throw invalidEmailError(emailValidation.error || 'Invalid email address.');
  }

  if (!password) {
    throw new Error('Password is required.');
  }

  const sanitizedEmail = SimpleValidationService.sanitizeString(email);
  return signInWithEmailAndPassword(getAuth(), sanitizedEmail, password);
}

export async function convertAnonymousUser(
  email: string,
  password: string,
): Promise<UserCredential> {
  const credential = EmailAuthProvider.credential(email, password);
  const currentUser = getAuth().currentUser;
  if (currentUser) {
    await linkWithCredential(currentUser, credential);
  }
  return signInWithEmail(email, password);
}

export async function signOut() {
  return firebaseSignOut(getAuth());
}

/**
 * Hardened 2026-07-04: added rate limiting (3 attempts / 5min per email) and
 * email-format validation, matching signInWithEmail above.
 */
export async function sendForgotPasswordEmail(email: string): Promise<void> {
  if (!SimpleValidationService.checkRateLimit(`reset_${email}`, 3, 300000)) {
    throw rateLimitError('Too many password reset attempts. Please try again later.');
  }

  const emailValidation = SimpleValidationService.validateEmail(email);
  if (!emailValidation.isValid) {
    throw invalidEmailError(emailValidation.error || 'Invalid email address.');
  }

  const sanitizedEmail = SimpleValidationService.sanitizeString(email);
  return sendPasswordResetEmail(getAuth(), sanitizedEmail);
}

// Email verification functions removed - no longer needed

export async function getUser(userId: string): Promise<User> {
  return crud.get<User>(userCollection, userId);
}

/**
 * getUser for the login paths: an operator whose houses exist but whose setup
 * never finished is completed server-side first, then the token is refreshed
 * (new house claims) and the user reloaded, so routing sees a completed
 * operator instead of sending them to an empty setup wizard. A completed
 * operator holding a house without claims (a later add-house grant failed)
 * gets the missing roles granted the same way. If recovery of an incomplete
 * setup failed, `setupRecoveryFailed` tells OrgSetup to block the wizard.
 */
export async function getUserFinishingSetup(
  userId: string,
): Promise<{ user: User; setupRecoveryFailed: boolean }> {
  const user = await getUser(userId);
  // A completed operator is checked for a house whose claim grant failed. A
  // failed token read (logged) or no signed-in user skips the check; neither
  // may fail the login.
  const claims = user.orgSetupCompleted
    ? ((
        await getAuthUser().catch((error) => {
          logException(error, 'operator claims check: token read failed');
          return undefined;
        })
      )?.claims as HouseRoleClaims | undefined)
    : undefined;
  const outcome = await finishOperatorSetupIfNeeded(user, claims);
  if (outcome !== 'completed') {
    // Only an incomplete setup has a wizard to block.
    const setupRecoveryFailed = outcome === 'failed' && !user.orgSetupCompleted;
    return { user, setupRecoveryFailed };
  }
  const recovered = await loadRecoveredUser(user, {
    refreshToken: () => getAuthUser(true),
    reloadUser: () => getUser(userId),
  });
  return { user: recovered, setupRecoveryFailed: false };
}

export async function createAnonUser(anonUser: User) {
  return crud.create<User>(userCollection, anonUser, anonUser.uid);
}

export async function createUser(_user: Partial<User>): Promise<User> {
  const user = cloneDeep(_user);
  let userCredential = user.isAnonymous
    ? await convertAnonymousUser(user.email!, user.password!)
    : await createUserWithEmail(user.email!, user.password!);
  userCredential = getFirebaseUserFromUserCredential(userCredential);
  const newUser = convertFirebaseUserToRatsUser(user, userCredential);
  await setDoc(doc(userCollection, newUser.uid), newUser);
  return newUser;
}

export async function updateUser(_user: Partial<User>, values: Partial<User>): Promise<User> {
  // Hardened 2026-07-06: lodash's extend() MUTATES its first argument.
  // Callers regularly pass the current Redux-state user straight through
  // (e.g. Notifications.tsx's togglePref), and Redux Toolkit/Immer deep-
  // freezes state in non-production builds — mutating a frozen object
  // silently no-ops (no throw), so the returned "updated" user was missing
  // every field from `values`. The Firestore write below still succeeded
  // (it's built from `values` directly), so this was pure client-side
  // staleness: the reducer's `state.user = action.payload` committed a
  // user object that looked unchanged.
  const user = { ..._user, ...values };
  await crud.update<User>(userCollection, { id: user.id, ...values });
  return user as User;
}

export async function getAuthUser(
  forceRefresh: boolean = false,
): Promise<IdTokenResult | undefined> {
  const currentUser = getAuth().currentUser;
  return currentUser ? getIdTokenResult(currentUser, forceRefresh) : undefined;
}

export async function refreshClaims(): Promise<string | undefined> {
  const currentUser = getAuth().currentUser;
  return currentUser ? getIdToken(currentUser, true) : undefined;
  // auth.currentUser.reload();
}

export async function requestAccountVerification(
  houseCode: string,
  firstName: string,
  lastName: string,
  userId: string,
): Promise<void> {
  return houseService.updateHouseAwaitingVerification(houseCode, {
    firstName,
    lastName,
    userId,
  });
}

export function convertFirebaseUserToRatsUser(
  user: Partial<User>,
  userCredential: UserCredential,
): User {
  if (user) {
    user.password = undefined;
  }
  const firebaseUser = userCredential.user;
  const newUser: User = {
    ...user,
    uid: firebaseUser.uid,
    email: firebaseUser.email || user.email || '',
    emailVerified: true, // Email verification disabled
    phoneNumber: firebaseUser.phoneNumber || user.phoneNumber || '',
    isAdmin: false,
    isManager: false,
    houseAccountVerified: false,
    houseCode: '',
    isAnonymous: firebaseUser.isAnonymous,
  } as User;
  return newUser;
}

export const updateOptionalInfo = async (user: User, guest: Guest, admin: Admin): Promise<void> => {
  const batch = writeBatch(firestore);
  if (user.avatar) {
    try {
      const avatar = await uploadUserAvatar(user.avatar, user.uid);
      user.avatar = await getDownloadURL(ref(getStorage(), avatar.metadata.fullPath));
    } catch (error) {
      logException(error);
    }
  }
  // subscriptionMetadata is server-owned — firestore.rules denies client writes
  // to it, because the entitlement gate derives access from it. Strip it so a
  // profile save is never rejected for echoing a field this function does not
  // mean to change.
  const { subscriptionMetadata: _serverOwned, ...userWritableFields } = user;
  batch.update(doc(userCollection, user.uid), userWritableFields as DocumentData);
  if (guest) {
    guest.avatar = user.avatar || guest.avatar;
    batch.update(doc(guestCollection, guest.id), guest as DocumentData);
  }
  if (admin) {
    admin.avatar = user.avatar || admin.avatar;
    batch.update(doc(adminCollection, admin.id), admin as DocumentData);
  }
  return batch.commit();
};

export const getHouseOwner = async (houseId: string): Promise<User | undefined> => {
  const res = await getDocs(query(userCollection, where('housesOwned', 'array-contains', houseId)));
  return res.docs[0].data() as User;
};
