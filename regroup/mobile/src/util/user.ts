import { User } from '../entities/User';
import { Role } from '../entities/Roles';
import { FirebaseAuthTypes } from '@react-native-firebase/auth';

export const userIsAnonymous = (user: User | FirebaseAuthTypes.User) =>
  user.email === null || user.email === undefined;

export const getFirebaseUserFromUserCredential = (
  firebaseUser: FirebaseAuthTypes.UserCredential,
): FirebaseAuthTypes.UserCredential => {
  // Access internal _user property if available, otherwise return the credential
  const internalUser = (firebaseUser.user as any)?._user;
  return internalUser || firebaseUser;
};

export const mapValuesToUser = (
  values: Partial<User>,
  newUser: Partial<User>,
  signUpRole?: Role,
) => {
  newUser.email = values.email;
  newUser.password = values.password;
  newUser.termsOfService = values.termsOfService;
  newUser.keepUpdated = values.keepUpdated;
  newUser.potentialSuperAdmin = signUpRole && signUpRole === 'superAdmin';
  newUser.orgSetupCompleted = false;
  newUser.firstName = values.firstName;
  newUser.lastName = values.lastName;
};

// Shared App Review demo login. Compared lower-cased, like the deleteAccount
// callable (functions/src/callable/account.ts), so both sides agree.
export const DEMO_ACCOUNT_EMAIL = 'demo_user@appdemo.net';

export const isDemo = (username: string) => {
  return (username ?? '').toLowerCase() === DEMO_ACCOUNT_EMAIL;
};
