import { FirebaseAuthTypes } from "@react-native-firebase/auth";
import { cloneDeep } from "lodash";
import { firestore, functions } from "../../firebase-setup";
import firebase from "@react-native-firebase/app";
import auth from "@react-native-firebase/auth";
import storage from "@react-native-firebase/storage";
import * as houseService from "./house";
import { User } from "../entities/User";
import * as crud from "./crud";
import { getFirebaseUserFromUserCredential } from "../util/user";
import { Guest } from "../entities/Guest";
import Admin from "../entities/Admin";
import { guestCollection } from "./guest";
import { adminCollection } from "./admin";
import { uploadUserAvatar } from "./storage";
import { logException } from "../util/logging";
import { SimpleValidationService } from "./SimpleValidationService";
// import { EmailConfirmationPayload } from '../entities/Email'; // Email verification removed

export const userCollection = firestore.collection("users");

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
    code: "auth/too-many-requests",
  });
}

/**
 * Throws an error shaped like Firebase's own `auth/invalid-email`, reusing
 * the existing mapped message rather than introducing a new one.
 */
function invalidEmailError(message: string): Error {
  return Object.assign(new Error(message), { code: "auth/invalid-email" });
}

/**
 * Creates a new user with email and password
 * @param {*} email
 * @param {*} password
 */
export async function createUserWithEmail(
  email: string,
  password: string
): Promise<FirebaseAuthTypes.UserCredential> {
  return auth().createUserWithEmailAndPassword(email, password);
}

export async function anonymouslyLogin(): Promise<FirebaseAuthTypes.UserCredential> {
  return auth().signInAnonymously();
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
  password: string
): Promise<FirebaseAuthTypes.UserCredential> {
  if (!SimpleValidationService.checkRateLimit(`signin_${email}`, 5, 60000)) {
    throw rateLimitError("Too many sign-in attempts. Please try again later.");
  }

  const emailValidation = SimpleValidationService.validateEmail(email);
  if (!emailValidation.isValid) {
    throw invalidEmailError(emailValidation.error || "Invalid email address.");
  }

  if (!password) {
    throw new Error("Password is required.");
  }

  const sanitizedEmail = SimpleValidationService.sanitizeString(email);
  return auth().signInWithEmailAndPassword(sanitizedEmail, password);
}

export async function convertAnonymousUser(
  email: string,
  password: string
): Promise<FirebaseAuthTypes.UserCredential> {
  const credential = firebase.auth.EmailAuthProvider.credential(
    email,
    password
  );
  await auth().currentUser?.linkWithCredential(credential);
  return signInWithEmail(email, password);
}

export async function signOut() {
  return auth().signOut();
}

/**
 * Hardened 2026-07-04: added rate limiting (3 attempts / 5min per email) and
 * email-format validation, matching signInWithEmail above.
 */
export async function sendForgotPasswordEmail(email: string): Promise<void> {
  if (!SimpleValidationService.checkRateLimit(`reset_${email}`, 3, 300000)) {
    throw rateLimitError(
      "Too many password reset attempts. Please try again later."
    );
  }

  const emailValidation = SimpleValidationService.validateEmail(email);
  if (!emailValidation.isValid) {
    throw invalidEmailError(emailValidation.error || "Invalid email address.");
  }

  const sanitizedEmail = SimpleValidationService.sanitizeString(email);
  return auth().sendPasswordResetEmail(sanitizedEmail);
}

// Email verification functions removed - no longer needed

export async function getUser(userId: string): Promise<User> {
  return crud.get<User>(userCollection, userId);
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
  await userCollection.doc(newUser.uid).set(newUser);
  return newUser;
}

export async function updateUser(
  _user: Partial<User>,
  values: Partial<User>
): Promise<User> {
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
  forceRefresh: boolean = false
): Promise<FirebaseAuthTypes.IdTokenResult | undefined> {
  return auth().currentUser?.getIdTokenResult(forceRefresh);
}

export async function refreshClaims(): Promise<string | undefined> {
  return auth().currentUser?.getIdToken(true);
  // auth.currentUser.reload();
}

export async function requestAccountVerification(
  houseCode: string,
  firstName: string,
  lastName: string,
  userId: string
): Promise<void> {
  return houseService.updateHouseAwaitingVerification(houseCode, {
    firstName,
    lastName,
    userId,
  });
}

export function convertFirebaseUserToRatsUser(
  user: Partial<User>,
  userCredential: FirebaseAuthTypes.UserCredential
): User {
  if (user) {
    user.password = undefined;
  }
  const firebaseUser = userCredential.user;
  const newUser: User = {
    ...user,
    uid: firebaseUser.uid,
    email: firebaseUser.email || user.email || "",
    emailVerified: true, // Email verification disabled
    phoneNumber: firebaseUser.phoneNumber || user.phoneNumber || "",
    isAdmin: false,
    isManager: false,
    houseAccountVerified: false,
    houseCode: "",
    isAnonymous: firebaseUser.isAnonymous,
  } as User;
  return newUser;
}

export const updateOptionalInfo = async (
  user: User,
  guest: Guest,
  admin: Admin
): Promise<void> => {
  const batch = firestore.batch();
  if (user.avatar) {
    try {
      const avatar = await uploadUserAvatar(user.avatar, user.uid);
      user.avatar = await storage()
        .ref(avatar.metadata.fullPath)
        .getDownloadURL();
    } catch (error) {
      logException(error);
    }
  }
  batch.update(userCollection.doc(user.uid), user);
  if (guest) {
    guest.avatar = user.avatar || guest.avatar;
    batch.update(guestCollection.doc(guest.id), guest);
  }
  if (admin) {
    admin.avatar = user.avatar || admin.avatar;
    batch.update(adminCollection.doc(admin.id), admin);
  }
  return batch.commit();
};

export const getHouseOwner = async (
  houseId: string
): Promise<User | undefined> => {
  const res = await userCollection
    .where("housesOwned", "array-contains", houseId)
    .get();
  return res.docs[0].data() as User;
};
