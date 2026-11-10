// Run with: npm run test:payments -- newHouseWithGuests
import { getAuth } from 'firebase-admin/auth';
import { callAs, readDocAs, signIn } from '../../payments/harness/callables';
import { adminApp, adminDb, uniqueId } from '../../payments/harness/fixtures';
import { commitAs, setDoc } from '../../payments/harness/firestoreRest';
import { assertEmulatorEnv, MANUAL_PROJECT, PAYMENTS_PROJECT } from '../../payments/harness/guards';
import { waitFor } from '../../payments/harness/waitFor';
import {
  guestDoc,
  inviteResident,
  newHouseWithGuests,
  NewHouse,
  PHASE,
} from '../newHouseWithGuests';

const PASSWORD = 'journey-test-only-pw';

const accountFor = async (email: string): Promise<string> => {
  await getAuth(adminApp()).createUser({ email, password: PASSWORD });
  return signIn(email, PASSWORD);
};

describe('a new house with three residents, through the real signup path', () => {
  let made: NewHouse;

  beforeAll(async () => {
    assertEmulatorEnv(process.env, [PAYMENTS_PROJECT, MANUAL_PROJECT]);
    made = await newHouseWithGuests({ password: PASSWORD, suffix: uniqueId('j') });
  });

  it('creates a usable house owned by the operator', async () => {
    const house = (await adminDb().doc(`houses/${made.house.id}`).get()).data() ?? {};
    expect(house.ownerId).toBe(made.operator.uid);
    expect(house.subscriptionStatus).toBe('active');
    expect(house.city).toBe('Austin');
    expect(house.maximumCapacity).toBe(10);
    expect(house.phases[PHASE].name).toBe(PHASE);
    expect(Object.keys(house.chores)).toEqual(expect.arrayContaining(['Kitchen', 'Bathroom']));
  });

  it('counts three residents in the house', async () => {
    const house = (await adminDb().doc(`houses/${made.house.id}`).get()).data() ?? {};
    expect(house.currentCapacity).toBe(3);
    const guests = await adminDb().collection('guests').where('houseId', '==', made.house.id).get();
    expect(guests.size).toBe(3);
  });

  it('links each resident account to its guest record', async () => {
    expect(made.residents).toHaveLength(3);
    for (const resident of made.residents) {
      const guest = (await adminDb().doc(`guests/${resident.guestId}`).get()).data() ?? {};
      const user = (await adminDb().doc(`users/${resident.uid}`).get()).data() ?? {};
      expect(guest).toMatchObject({
        userId: resident.uid,
        houseId: made.house.id,
        status: 'active',
        phase: PHASE,
        rentOwed: 0,
      });
      expect(user).toMatchObject({
        guestId: resident.guestId,
        houseId: made.house.id,
        isGuest: true,
        infoEntered: true,
      });
    }
  });

  it('gives each resident a working password and access to the house', async () => {
    for (const resident of made.residents) {
      await expect(signIn(resident.email, PASSWORD)).resolves.toBe(resident.uid);
      await expect(readDocAs(resident.uid, `houses/${made.house.id}`)).resolves.toBe(200);
      const { customClaims } = await getAuth(adminApp()).getUser(resident.uid);
      expect(customClaims?.guest?.[made.house.id]).toBe(true);
    }
  });

  it('lets the operator sign in and read the house and every resident', async () => {
    await expect(signIn(made.operator.email, PASSWORD)).resolves.toBe(made.operator.uid);
    await expect(readDocAs(made.operator.uid, `houses/${made.house.id}`)).resolves.toBe(200);
    for (const resident of made.residents) {
      await expect(readDocAs(made.operator.uid, `guests/${resident.guestId}`)).resolves.toBe(200);
    }
  });

  it('marks each admission ticket used', async () => {
    for (const resident of made.residents) {
      const ticket = await waitFor(
        async () =>
          (
            await adminDb().doc(`admission-tickets/${resident.uid}_${made.house.id}`).get()
          ).data() ?? {},
        (data) => data.used === true,
        30000,
      );
      expect(ticket.used).toBe(true);
    }
  });

  it('refuses a guest record from someone with no invitation', async () => {
    const email = `${uniqueId('uninvited')}@rats-e2e.invalid`;
    const uid = await accountFor(email);
    const id = uniqueId('guest');
    const person = { firstName: 'Uninvited', lastName: 'Person' };
    const res = await commitAs(uid, [
      setDoc(`guests/${id}`, guestDoc({ id, uid, houseId: made.house.id, email, person })),
    ]);
    expect(res.status).toBe(403);
    expect((await adminDb().doc(`guests/${id}`).get()).exists).toBe(false);
  });

  it('refuses an invitation redeemed by a different email', async () => {
    const token = await inviteResident(
      made.operator.uid,
      made.house.id,
      `${uniqueId('invited')}@rats-e2e.invalid`,
    );
    const uid = await accountFor(`${uniqueId('other')}@rats-e2e.invalid`);
    const res = await callAs(uid, 'redeemInvitation', { token });
    expect(res.errorCode).toBe('permission-denied');
  });
});
