/**
 * createUser against the firebase-modular mocks, with a credential shaped like
 * RNFirebase's: `credential.user` is a User whose native fields also sit on
 * `user._user` (#182). users.test.ts mocks getFirebaseUserFromUserCredential as
 * the identity, so it never sees that shape. Assertions are on the returned
 * user and the Firestore op log, never on mock call chains.
 */
jest.mock('../../../firebase-setup', () => require('../../../__mocks__/firebase-modular/setup'));
jest.mock('@react-native-firebase/firestore', () =>
  require('../../../__mocks__/firebase-modular/firestore'),
);
jest.mock('@react-native-firebase/functions', () =>
  require('../../../__mocks__/firebase-modular/functions'),
);
jest.mock('@react-native-firebase/auth', () => require('../../../__mocks__/firebase-modular/auth'));
jest.mock('../../util/logging', () => ({ logException: jest.fn() }));

import { getOpLog, resetOpLog } from '../../../__mocks__/firebase-modular/log';
import { createUser } from '../users';

const { instance, setCurrentUser } = jest.requireMock<{
  instance: Record<string, unknown>;
  setCurrentUser: (user: unknown) => void;
}>('@react-native-firebase/auth');

const original = { ...instance };

/** What RNFirebase resolves createUserWithEmailAndPassword with. */
function rnFirebaseCredential(uid: string, email: string) {
  const native = { uid, email, phoneNumber: null, isAnonymous: false, emailVerified: false };
  return { user: { ...native, _user: native } };
}

const signUpForm = {
  email: 'ann@example.com',
  password: 'Passw0rd!',
  firstName: 'Ann',
  lastName: 'Lee',
  termsOfService: true,
  keepUpdated: false,
  potentialSuperAdmin: false,
  orgSetupCompleted: false,
};

beforeEach(() => {
  resetOpLog();
  setCurrentUser(null);
  instance.createUserWithEmailAndPassword = async (email: string) =>
    rnFirebaseCredential('u-182', email);
});

afterEach(() => {
  Object.assign(instance, original);
});

describe('createUser with an RNFirebase-shaped credential', () => {
  it('writes users/<uid> with the sign-up form fields', async () => {
    const created = await createUser({ ...signUpForm });

    expect(created.uid).toBe('u-182');
    const writes = getOpLog().filter((entry) => entry.path === 'users/u-182');
    expect(writes).toHaveLength(1);
    expect(writes[0].data).toMatchObject({
      uid: 'u-182',
      email: 'ann@example.com',
      firstName: 'Ann',
      lastName: 'Lee',
      termsOfService: true,
      keepUpdated: false,
      isAnonymous: false,
    });
  });

  it('never stores the password', async () => {
    await createUser({ ...signUpForm });

    const [write] = getOpLog().filter((entry) => entry.path === 'users/u-182');
    expect(write.data).not.toHaveProperty('password', 'Passw0rd!');
  });
});
