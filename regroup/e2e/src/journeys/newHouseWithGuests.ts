import { randomUUID } from 'crypto';
import { getAuth } from 'firebase-admin/auth';
import { callAs, signIn } from '../payments/harness/callables';
import { adminApp, seedOperator } from '../payments/harness/fixtures';
import {
  commitAs,
  DocWrite,
  encodeFields,
  getFieldsAs,
  setDoc,
  updateFields,
} from '../payments/harness/firestoreRest';
import { assertEmulatorEnv, MANUAL_PROJECT, PAYMENTS_PROJECT } from '../payments/harness/guards';

// Makes a house with residents the way the app does: createHouses, an invitation per
// resident, redeemInvitation, then the writes SignUpForm and NewAccountForm make, as
// the resident and through the security rules. A broken step fails here as it would
// for a real invitee. The operator is seeded instead (account, user and admin docs, and
// an active subscription), so there is no Stripe checkout.

export const PHASE = 'Default';
const EMAIL_DOMAIN = 'rats-e2e.invalid';

export type Person = { firstName: string; lastName: string };
export type JoinedResident = Person & { uid: string; guestId: string; email: string };
export type NewHouse = {
  house: { id: string; name: string };
  operator: { uid: string; email: string };
  residents: JoinedResident[];
};

const RESIDENTS: Person[] = [
  { firstName: 'Avery', lastName: 'Cole' },
  { firstName: 'Blake', lastName: 'Reed' },
  { firstName: 'Casey', lastName: 'Diaz' },
];

const houseInput = (name: string, suffix: string) => ({
  requestKey: `journey-${suffix}`.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 64),
  name,
  lat: 30.2672,
  lng: -97.7431,
  street: '100 Test Way',
  city: 'Austin',
  state: 'TX',
  zip: '78701',
  country: 'US',
  timezone: 'America/Chicago',
  phoneNumber: '512-555-0100',
  monthlyRent: 0,
  weeklyRent: 0,
  maximumCapacity: 10,
  rentFrequency: 'both',
  managerSetupType: 'operator-only',
  houseType: 'traditional',
  phases: {
    [PHASE]: {
      name: PHASE,
      order: 1,
      rules: {
        meetings: 0,
        nightsOutAllowed: 0,
        supporter: true,
        work: 0,
        chore: true,
        medications: false,
      },
    },
  },
  chores: {
    Kitchen: { name: 'Kitchen', description: 'Clean the kitchen' },
    Bathroom: { name: 'Bathroom', description: 'Clean the bathroom' },
  },
  rooms: {},
});

async function mustCall(uid: string, name: string, data: unknown): Promise<unknown> {
  const res = await callAs(uid, name, data);
  if (res.errorCode) throw new Error(`${name} failed: ${res.errorCode}: ${res.errorMessage}`);
  return res.data;
}

async function mustCommit(step: string, uid: string, writes: DocWrite[]): Promise<void> {
  const res = await commitAs(uid, writes);
  if (res.status !== 200) throw new Error(`${step} was refused (${res.status}): ${res.body}`);
}

export async function inviteResident(
  operatorUid: string,
  houseId: string,
  email: string,
): Promise<string> {
  const data = await mustCall(operatorUid, 'createInvitation', {
    email,
    houseId,
    role: 'guest',
    initialPhase: PHASE,
  });
  const token = (data as { token?: unknown } | null)?.token;
  if (typeof token !== 'string' || !token) throw new Error(`createInvitation returned no token for ${email}`);
  return token;
}

/** The Guest entity's defaults, as buildSelfCreateGuest sends them. */
export const guestDoc = (opts: {
  id: string;
  uid: string;
  houseId: string;
  email: string;
  person: Person;
}) => ({
  id: opts.id,
  userId: opts.uid,
  houseId: opts.houseId,
  displayName: '',
  firstName: opts.person.firstName,
  lastName: opts.person.lastName,
  email: opts.email,
  phoneNumber: '',
  sobrietyDate: '',
  drugOfChoice: '',
  phase: PHASE,
  step: 1,
  status: 'active',
  isAdmin: false,
  infoEntered: false,
  hasJob: false,
  rentOwed: 0,
  choreFees: 0,
  dailyHabit: 0,
  supporters: [],
  jobs: [],
  version: 0,
  createdBy: opts.uid,
  updatedBy: opts.uid,
});

async function joinHouse(opts: {
  operatorUid: string;
  houseId: string;
  person: Person;
  email: string;
  password: string;
  phoneNumber: string;
}): Promise<JoinedResident> {
  const { houseId, person, email, password, phoneNumber } = opts;
  const token = await inviteResident(opts.operatorUid, houseId, email);

  // SignUpForm: createUser.
  const { uid } = await getAuth(adminApp()).createUser({ email, password });
  await signIn(email, password);
  const userPath = `users/${uid}`;
  await mustCommit('writing the user', uid, [
    setDoc(userPath, {
      id: uid,
      uid,
      email,
      ...person,
      houseId,
      phoneNumber: '',
      isGuest: true,
      isAdmin: false,
      isSuperAdmin: false,
      isAnonymous: false,
      emailVerified: true,
      infoEntered: false,
      housesOwned: [],
      subscriptionMetadata: { status: '', houses: {}, oxfordEnabled: false },
    }),
  ]);

  // SignUpForm: redeem, then refresh the token so the guest claim applies.
  await mustCall(uid, 'redeemInvitation', { token });
  await signIn(email, password);

  // SignUpForm: createGuest writes the whole house back with currentCapacity + 1.
  const guestId = randomUUID();
  const guestPath = `guests/${guestId}`;
  const house = await getFieldsAs(uid, `houses/${houseId}`);
  // The app writes currentCapacity + 1, so a missing or non-integer value is a bug to report,
  // not something to default: the app would write NaN.
  const stored = (house.currentCapacity as { integerValue?: string } | undefined)?.integerValue;
  if (stored === undefined) throw new Error(`houses/${houseId} has no integer currentCapacity`);
  const capacity = Number(stored);
  await mustCommit('creating the guest', uid, [
    updateFields(`houses/${houseId}`, {
      ...house,
      ...encodeFields({ currentCapacity: capacity + 1 }),
    }),
    setDoc(guestPath, guestDoc({ id: guestId, uid, houseId, email, person })),
  ]);
  await mustCommit('linking the user', uid, [
    updateFields(userPath, encodeFields({ isGuest: true, guestId, email })),
  ]);

  // NewAccountForm (About You).
  await mustCommit('finishing About You', uid, [
    updateFields(userPath, encodeFields({ infoEntered: true, phoneNumber })),
    updateFields(guestPath, encodeFields({ phoneNumber, version: 1 })),
  ]);
  return { ...person, uid, guestId, email };
}

export async function newHouseWithGuests(opts: {
  password: string;
  suffix: string;
  residents?: Person[];
}): Promise<NewHouse> {
  assertEmulatorEnv(process.env, [PAYMENTS_PROJECT, MANUAL_PROJECT]);
  const { password, suffix, residents = RESIDENTS } = opts;
  const email = (name: string) => `${name.toLowerCase()}-${suffix}@${EMAIL_DOMAIN}`.toLowerCase();

  const operatorEmail = email('operator');
  const operator = await seedOperator({
    email: operatorEmail,
    password,
    subscriptionMetadata: { tier: 'professional', maxResidents: 20, maxProperties: 3 },
  });
  await signIn(operatorEmail, password);

  const name = `Test House ${suffix}`;
  const created = (await mustCall(operator.uid, 'createHouses', {
    houses: [houseInput(name, suffix)],
  })) as {
    houseIds: string[];
  };
  const houseId = created?.houseIds?.[0];
  if (typeof houseId !== 'string' || !houseId) throw new Error('createHouses returned no house id');
  await signIn(operatorEmail, password);

  const joined: JoinedResident[] = [];
  for (const [index, person] of residents.entries()) {
    joined.push(
      await joinHouse({
        operatorUid: operator.uid,
        houseId,
        person,
        email: email(person.firstName),
        password,
        phoneNumber: `512-555-01${String(index + 1).padStart(2, '0')}`,
      }),
    );
  }
  return {
    house: { id: houseId, name },
    operator: { uid: operator.uid, email: operatorEmail },
    residents: joined,
  };
}
