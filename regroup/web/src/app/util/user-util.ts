import { auth } from 'firebase/app';

export const getFirebaseUserFromUserCredential = (firebaseUser: auth.UserCredential) => {
  return (firebaseUser.user as any)._user;
};

export function hasLowerCase(str) {
  return (/[a-z]/.test(str));
}

export function hasUpperCase(str) {
  return (/[A-Z]/.test(str));
}

export function hasNumber(myString) {
  return /\d/.test(myString);
}

export function checkPasswordReqs(password: string, errors: any) {
  if (!password) {
    errors.passLength = true;
  }
  if (password.length < 8) errors.characters = 'Password must have 8 characters.';
  if (!hasUpperCase(password)) errors.uppercase = 'Password must contain at least one uppercase letter.';
  if (!hasLowerCase(password)) errors.lowercase = 'Password must contain at least one lowercase letter.';
  if (!hasNumber(password)) errors.number = 'Password must contain at least one number.';
}

