import { randomUUID } from 'crypto';
import { App, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { assertEmulatorEnv, LOCAL_CONNECT_ACCOUNT_FILE, PROJECT, readConfigFile } from './guards';

export function adminApp(): App {
  assertEmulatorEnv();
  return getApps()[0] ?? initializeApp({ projectId: PROJECT });
}
export const adminDb = () => getFirestore(adminApp());

let counter = 0;
/** Ids unique to a test, so tests never need the emulators reset. */
export const uniqueId = (kind: string) => `pay-${kind}-${Date.now().toString(36)}-${(counter += 1)}`;
const emailOf = (id: string) => `${id}@rats-e2e.invalid`;

export type SeededOperator = { uid: string; adminId: string; email: string };
export type SeededHouse = { id: string; ownerUid: string };
export type SeededResident = { uid: string; guestId: string; houseId: string; email: string };

async function createAccount(uid: string, email: string, claims: object): Promise<void> {
  const auth = getAuth(adminApp());
  await auth.createUser({ uid, email, emailVerified: true });
  await auth.setCustomUserClaims(uid, claims);
}

/** An operator with a random admin id, as createHouses creates it. The uid is never an admin id. */
export async function seedOperator(
  opts: { uid?: string; status?: string; subscriptionMetadata?: object } = {},
): Promise<SeededOperator> {
  const uid = opts.uid ?? uniqueId('op');
  const adminId = randomUUID();
  const email = emailOf(uid);
  await createAccount(uid, email, {});
  await adminDb().doc(`users/${uid}`).set({
    id: uid,
    uid,
    email,
    firstName: 'Test',
    lastName: 'Operator',
    isAdmin: true,
    isSuperAdmin: true,
    isGuest: false,
    isAnonymous: false,
    adminId,
    orgSetupCompleted: true,
    infoEntered: true,
    housesOwned: [],
    subscriptionMetadata: { status: opts.status ?? 'active', houses: {}, oxfordEnabled: false, ...opts.subscriptionMetadata },
  });
  await adminDb().doc(`admins/${adminId}`).set({
    id: adminId,
    userId: uid,
    email,
    firstName: 'Test',
    lastName: 'Operator',
    houseIds: [],
    superAdmin: [],
  });
  return { uid, adminId, email };
}

/** A house written the way createHouses writes it: admin arrays hold the admin id, not the uid. */
export async function seedHouse(operator: SeededOperator, extra: object = {}): Promise<SeededHouse> {
  const id = uniqueId('house');
  const now = new Date().toISOString();
  const db = adminDb();
  await db.doc(`houses/${id}`).set({
    id,
    name: `House ${id}`,
    ownerId: operator.uid,
    superAdminId: operator.uid,
    adminIds: [operator.adminId],
    superAdminIds: [operator.adminId],
    subscriptionStatus: 'active',
    houseType: 'traditional',
    isDemoHouse: false,
    stripeStatus: 'not_connected',
    currentCapacity: 0,
    createdAt: now,
    ...extra,
  });
  await db.doc(`house-roles/${id}_${operator.uid}`).set({ tier: 'owner', primary: true, grantedBy: 'seed', grantedAt: now, via: 'seed' });
  await db.doc(`admins/${operator.adminId}`).update({ houseIds: [id], superAdmin: [id] });
  await getAuth(adminApp()).setCustomUserClaims(operator.uid, { admin: { [id]: true }, superAdmin: { [id]: true } });
  return { id, ownerUid: operator.uid };
}

export const seedConnectedHouse = (operator: SeededOperator, extra: object = {}) =>
  seedHouse(operator, { stripeAccountId: readConfigFile(LOCAL_CONNECT_ACCOUNT_FILE), stripeStatus: 'active', ...extra });

export async function seedResident(
  house: SeededHouse,
  opts: { rentOwed?: number; choreFees?: number; guest?: object } = {},
): Promise<SeededResident> {
  const uid = uniqueId('res');
  const guestId = uniqueId('guest');
  const email = emailOf(uid);
  await createAccount(uid, email, { guest: { [house.id]: true } });
  await adminDb().doc(`users/${uid}`).set({
    id: uid,
    uid,
    email,
    firstName: 'Test',
    lastName: 'Resident',
    isGuest: true,
    isAdmin: false,
    isSuperAdmin: false,
    isAnonymous: false,
    houseId: house.id,
    guestId,
    infoEntered: true,
    housesOwned: [],
    subscriptionMetadata: { status: '', houses: {}, oxfordEnabled: false },
  });
  await adminDb().doc(`guests/${guestId}`).set({
    id: guestId,
    userId: uid,
    houseId: house.id,
    firstName: 'Test',
    lastName: 'Resident',
    email,
    status: 'active',
    rentOwed: opts.rentOwed ?? 0,
    choreFees: opts.choreFees ?? 0,
    version: 0,
    ...opts.guest,
  });
  return { uid, guestId, houseId: house.id, email };
}
