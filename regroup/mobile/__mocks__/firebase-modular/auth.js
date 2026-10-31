/**
 * Dual-shape @react-native-firebase/auth mock. Auth calls are not part of the
 * operation log; tests set the signed-in user with setCurrentUser(user).
 */
const listeners = new Set();

const instance = {
  currentUser: null,
  onAuthStateChanged: (cb) => {
    listeners.add(cb);
    Promise.resolve().then(() => listeners.has(cb) && cb(instance.currentUser));
    return () => listeners.delete(cb);
  },
  onIdTokenChanged: (cb) => instance.onAuthStateChanged(cb),
  signInWithEmailAndPassword: async (email) => ({ user: { uid: 'test-uid', email } }),
  createUserWithEmailAndPassword: async (email) => ({ user: { uid: 'test-uid', email } }),
  signInAnonymously: async () => ({ user: { uid: 'anon-uid', isAnonymous: true } }),
  sendPasswordResetEmail: async () => {},
  signOut: async () => {
    setCurrentUser(null);
  },
  useEmulator: () => {},
};

/** Sets auth.currentUser and notifies onAuthStateChanged listeners. */
function setCurrentUser(user) {
  instance.currentUser = user;
  listeners.forEach((cb) => cb(user));
}

function auth() {
  return instance;
}

module.exports = {
  __esModule: true,
  default: auth,
  instance,
  setCurrentUser,
  getAuth: () => instance,
  connectAuthEmulator: jest.fn(),
  onAuthStateChanged: (_auth, cb) => instance.onAuthStateChanged(cb),
  onIdTokenChanged: (_auth, cb) => instance.onIdTokenChanged(cb),
  signInWithEmailAndPassword: (_auth, email, password) =>
    instance.signInWithEmailAndPassword(email, password),
  createUserWithEmailAndPassword: (_auth, email, password) =>
    instance.createUserWithEmailAndPassword(email, password),
  signInAnonymously: () => instance.signInAnonymously(),
  sendPasswordResetEmail: (_auth, email) => instance.sendPasswordResetEmail(email),
  signOut: () => instance.signOut(),
  // User-scoped calls delegate to the user object a test set as currentUser.
  getIdToken: (user, ...args) => user.getIdToken(...args),
  getIdTokenResult: (user, ...args) => user.getIdTokenResult(...args),
  linkWithCredential: (user, ...args) => user.linkWithCredential(...args),
  FirebaseAuthTypes: {},
};
