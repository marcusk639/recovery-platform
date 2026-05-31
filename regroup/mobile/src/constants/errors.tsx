export const HOUSE_CODE_INVALID = 'House code is invalid.';

export const getAuthenticationErrorMessage = (code: string): string => {
  if (code === 'auth/wrong-password') {
    return 'error.incorrect.password';
  }
  if (code === 'auth/invalid-email') {
    return 'error.invalid.email';
  }
  if (code === 'auth/user-not-found') {
    return 'error.user.not.found';
  }
  return 'error.generic';
};
