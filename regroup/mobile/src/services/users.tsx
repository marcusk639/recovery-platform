import { FirebaseAuthTypes } from '@react-native-firebase/auth';
import { cloneDeep, extend } from 'lodash';
import { firestore, functions } from '../../firebase-setup';
import firebase from '@react-native-firebase/app';
import auth from '@react-native-firebase/auth';
import storage from '@react-native-firebase/storage';
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
// import { EmailConfirmationPayload } from '../entities/Email'; // Email verification removed

export const userCollection = firestore.collection('users');

/**
 * Creates a new user with email and password
 * @param {*} email
 * @param {*} password
 */
export async function createUserWithEmail(
  email: string,
  password: string,
): Promise<FirebaseAuthTypes.UserCredential> {
  return auth().createUserWithEmailAndPassword(email, password);
}

export async function anonymouslyLogin(): Promise<FirebaseAuthTypes.UserCredential> {
  return auth().signInAnonymously();
}

/**
 * Logs in an existing user with email and password
 * @param {*} email
 * @param {*} password
 */
export async function signInWithEmail(
  email: string,
  password: string,
): Promise<FirebaseAuthTypes.UserCredential> {
  return auth().signInWithEmailAndPassword(email, password);
}

export async function convertAnonymousUser(
  email: string,
  password: string,
): Promise<FirebaseAuthTypes.UserCredential> {
  const credential = firebase.auth.EmailAuthProvider.credential(
    email,
    password,
  );
  await auth().currentUser?.linkWithCredential(credential);
  return signInWithEmail(email, password);
}

export async function signOut() {
  return auth().signOut();
}

export async function sendForgotPasswordEmail(email: string): Promise<void> {
  return auth().sendPasswordResetEmail(email);
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
  values: Partial<User>,
): Promise<User> {
  const user = extend(_user, values);
  await crud.update<User>(userCollection, { id: user.id, ...values });
  return user as User;
}

export async function getAuthUser(
  forceRefresh: boolean = false,
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
  userCredential: FirebaseAuthTypes.UserCredential,
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

export const updateOptionalInfo = async (
  user: User,
  guest: Guest,
  admin: Admin,
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
  houseId: string,
): Promise<User | undefined> => {
  const res = await userCollection
    .where('housesOwned', 'array-contains', houseId)
    .get();
  return res.docs[0].data() as User;
};
