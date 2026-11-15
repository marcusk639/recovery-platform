import { beforeEach, vi } from 'vitest';

const webFirestore = vi.hoisted(() => ({
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  getDocFromServer: vi.fn(),
  getDocsFromServer: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  addDoc: vi.fn(),
  runTransaction: vi.fn(),
  writeBatch: vi.fn(),
  onSnapshot: vi.fn(),
  // plain-data keeps instances of these as they are.
  FieldValue: class {},
  Timestamp: class {},
  GeoPoint: class {},
  Bytes: class {},
  DocumentReference: class {},
}));
const webAuth = vi.hoisted(() => ({
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  signInAnonymously: vi.fn(),
  signInWithCredential: vi.fn(),
}));
const webStorage = vi.hoisted(() => ({ uploadBytes: vi.fn() }));

vi.mock('firebase/firestore', () => webFirestore);
vi.mock('firebase/auth', () => webAuth);
vi.mock('firebase/storage', () => webStorage);

import { getDoc, onSnapshot, setDoc, writeBatch } from '../src/adapter/firebase/firestore';
import { signInWithEmailAndPassword } from '../src/adapter/firebase/auth';
import { putFile } from '../src/adapter/firebase/storage';
import { assertEmulatorProject } from '../src/adapter/firebase/emulator-config';

const denied = () => Object.assign(new Error('no'), { code: 'permission-denied' });

beforeEach(() => vi.clearAllMocks());

// activity.ts retries on 'firestore/permission-denied', so a bare code breaks it.
test('Firestore errors carry RN Firebase codes', async () => {
  webFirestore.getDoc.mockRejectedValue(denied());
  await expect(getDoc({} as never)).rejects.toMatchObject({ code: 'firestore/permission-denied' });
});

test('a batch commit rejects with the RN Firebase code', async () => {
  webFirestore.writeBatch.mockReturnValue({ commit: vi.fn().mockRejectedValue(denied()) });
  await expect(writeBatch({} as never).commit()).rejects.toMatchObject({ code: 'firestore/permission-denied' });
});

test('onSnapshot errors carry the RN Firebase code', () => {
  const onError = vi.fn();
  onSnapshot({} as never, vi.fn(), onError);
  webFirestore.onSnapshot.mock.calls[0][2](denied());
  expect(onError.mock.calls[0][0].code).toBe('firestore/permission-denied');
});

test('an already prefixed error code is left alone', async () => {
  webFirestore.getDoc.mockRejectedValue(Object.assign(new Error('x'), { code: 'auth/expired' }));
  await expect(getDoc({} as never)).rejects.toMatchObject({ code: 'auth/expired' });
});

// util/user.ts reads the private user._user field of RN Firebase's credential.
test('sign-in exposes user._user', async () => {
  const user = { uid: 'uid-1' };
  webAuth.signInWithEmailAndPassword.mockResolvedValue({ user });
  const cred = await signInWithEmailAndPassword({} as never, 'a@example.test', 'pw');
  expect((cred.user as never as { _user: unknown })._user).toBe(user);
  expect(Object.keys(cred.user)).toEqual(['uid']);
});

test('putFile uploads the blob at a blob URL through the web SDK', async () => {
  const blob = new Blob(['x']);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: async () => blob }));
  const reference = {} as never;
  const metadata = { contentType: 'application/pdf' };
  await putFile(reference, 'blob:http://localhost/abc', metadata);
  expect(fetch).toHaveBeenCalledWith('blob:http://localhost/abc');
  expect(webStorage.uploadBytes).toHaveBeenCalledWith(reference, blob, metadata);
});

test('putFile fails when the local file cannot be read', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
  await expect(putFile({} as never, 'blob:gone', {})).rejects.toThrow(/404/);
  expect(webStorage.uploadBytes).not.toHaveBeenCalled();
});

test('setup refuses any project but demo-regroup-e2e', () => {
  expect(() => assertEmulatorProject('phoenix-cleanhouse')).toThrow(/phoenix-cleanhouse/);
  expect(() => assertEmulatorProject('regroup-e2e')).toThrow();
  expect(() => assertEmulatorProject('demo-regroup-e2e')).not.toThrow();
});

class Guest {
  id = 'g1';
}
test('setDoc and a batch write a class instance as a plain object, as RN Firebase does', async () => {
  const set = vi.fn();
  webFirestore.writeBatch.mockReturnValue({ set, update: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) });
  webFirestore.setDoc.mockResolvedValue(undefined);
  writeBatch({} as never).set({} as never, new Guest() as never);
  await setDoc({} as never, new Guest() as never);
  for (const written of [set.mock.calls[0][1], webFirestore.setDoc.mock.calls[0][1]]) {
    expect(Object.getPrototypeOf(written)).toBe(Object.prototype);
    expect(written).toEqual({ id: 'g1' });
  }
});
