import * as web from 'firebase/auth';

export * from 'firebase/auth';

// regroup/mobile/src/util/user.ts reads RN Firebase's private user._user field
// and falls back to the whole credential, which has no uid on the web.
function withInternalUser<T extends { user: object }>(credential: T): T {
  Object.defineProperty(credential.user, '_user', { value: credential.user, enumerable: false });
  return credential;
}

const exposingUser = <A extends unknown[], T extends { user: object }>(signIn: (...args: A) => Promise<T>) =>
  async (...args: A): Promise<T> => withInternalUser(await signIn(...args));

export const signInWithEmailAndPassword = exposingUser(web.signInWithEmailAndPassword);
export const createUserWithEmailAndPassword = exposingUser(web.createUserWithEmailAndPassword);
export const signInAnonymously = exposingUser(web.signInAnonymously);
export const signInWithCredential = exposingUser(web.signInWithCredential);
