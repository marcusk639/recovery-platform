/**
 * The integration harness itself: the client is the JS SDK under the
 * RNFirebase module names, on the emulators, judged by the security rules as
 * the signed-in user, with RNFirebase-shaped errors. Every other integration
 * suite relies on this.
 */
import { doc, getDoc, getFirestore, setDoc } from '@react-native-firebase/firestore';
import { firestore } from '../../firebase-setup';
import { adminOf, signInAs } from './actors';
import { emulatorPort, integrationProjectId } from './emulator-env';
import { adminDb } from './firebase-admin-setup';

const HOUSE = 'harness-house-1';
const GUEST_ID = 'harness-guest-1';
const MEETING_ID = 'harness-meeting-1';

describe('integration harness', () => {
  beforeAll(async () => {
    await adminDb.doc(`guests/${GUEST_ID}`).set({ id: GUEST_ID, houseId: HOUSE, userId: 'u1' });
  });

  afterAll(async () => {
    await adminDb.doc(`guests/${GUEST_ID}`).delete();
    await adminDb.doc(`meetings/${MEETING_ID}`).delete();
  });

  describe('connection guards', () => {
    const saved = { ...process.env };
    afterEach(() => {
      process.env = { ...saved };
    });

    it('refuses a project that is not a demo- project', () => {
      process.env.GCLOUD_PROJECT = 'phoenix-cleanhouse';
      expect(() => integrationProjectId()).toThrow('demo- project');
    });

    it('refuses an emulator host other than 127.0.0.1', () => {
      process.env.FIRESTORE_EMULATOR_HOST = 'firestore.googleapis.com:443';
      expect(() => emulatorPort('FIRESTORE_EMULATOR_HOST')).toThrow('127.0.0.1');
    });

    it('requires the Firestore emulator to be running', () => {
      delete process.env.FIRESTORE_EMULATOR_HOST;
      expect(() => emulatorPort('FIRESTORE_EMULATOR_HOST')).toThrow('is not set');
    });
  });

  it('firebase-setup and the RNFirebase package share one Firestore instance', () => {
    expect(getFirestore()).toBe(firestore);
  });

  it('a house admin reads a guest of that house through the rules', async () => {
    await signInAs('harness-admin-1', adminOf(HOUSE));

    const snapshot = await getDoc(doc(firestore, 'guests', GUEST_ID));

    expect(snapshot.exists()).toBe(true);
    expect(snapshot.data()?.houseId).toBe(HOUSE);
  });

  it('a user without a role in the house is denied, with the RNFirebase error code', async () => {
    await signInAs('harness-stranger-1', adminOf('another-house'));

    await expect(getDoc(doc(firestore, 'guests', GUEST_ID))).rejects.toMatchObject({
      code: 'firestore/permission-denied',
    });
  });

  it('writes drop undefined fields (ignoreUndefinedProperties)', async () => {
    await signInAs('harness-admin-1', adminOf(HOUSE));

    await setDoc(doc(firestore, 'meetings', MEETING_ID), {
      houseId: HOUSE,
      name: 'Harness meeting',
      notes: undefined,
    });

    const saved = (await adminDb.doc(`meetings/${MEETING_ID}`).get()).data();
    expect(saved).toEqual({ houseId: HOUSE, name: 'Harness meeting' });
  });
});
