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

export const isDemo = (username: string) => {
  return username === 'demo_user@appdemo.net';
};
