import { randomUUID } from 'crypto';
import { App, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import {
  assertEmulatorEnv,
  LOCAL_CONNECT_ACCOUNT_FILE,
  MANUAL_PROJECT,
  PAYMENTS_PROJECT,
  PROJECT,
  readConfigFile,
} from './guards';
import { forgetIdToken } from './idTokens';
import { waitFor } from './waitFor';

export function adminApp(): App {
  // Either emulator project: Stripe suites are held to the payment suite's by assertSafeTarget.
  assertEmulatorEnv(process.env, [PAYMENTS_PROJECT, MANUAL_PROJECT]);
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

async function createAccount(uid: string, email: string, claims: object, password?: string): Promise<void> {
  const auth = getAuth(adminApp());
  await auth.createUser({ uid, email, emailVerified: true, ...(password && { password }) });
  await auth.setCustomUserClaims(uid, claims);
}

/** An operator with a random admin id, as createHouses creates it. The uid is never an admin id. */
export async function seedOperator(
  opts: { uid?: string; status?: string; subscriptionMetadata?: object; email?: string; password?: string } = {},
): Promise<SeededOperator> {
  const uid = opts.uid ?? uniqueId('op');
  const adminId = randomUUID();
  const email = opts.email ?? emailOf(uid);
  await createAccount(uid, email, {}, opts.password);
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

// setHouseSubscriptionStatusOnCreate stamps every new house with a status derived from its
// operator's, some time after the write. operatorStatusToHouseStatus never returns this, so
// seedHouse waits for it to go, then sets the status the test asked for. Otherwise a late
// stamp can undo a status a test sets right after seeding, and the test passes vacuously.
const AWAITING_STAMP = 'awaiting-stamp';

/**
 * A house written the way createHouses writes it: admin arrays hold the admin id, not the uid.
 * A second house is added to the operator's admin doc and claims, as createHouses adds it.
 */
export async function seedHouse(operator: SeededOperator, extra: object = {}): Promise<SeededHouse> {
  const id = uniqueId('house');
  const now = new Date().toISOString();
  const db = adminDb();
  const { subscriptionStatus = 'active', ...rest } = extra as { subscriptionStatus?: string };
  await db.doc(`houses/${id}`).set({
    id,
    name: `House ${id}`,
    ownerId: operator.uid,
    superAdminId: operator.uid,
    adminIds: [operator.adminId],
    superAdminIds: [operator.adminId],
    houseType: 'traditional',
    isDemoHouse: false,
    stripeStatus: 'not_connected',
    currentCapacity: 0,
    createdAt: now,
    ...rest,
    subscriptionStatus: AWAITING_STAMP,
  });
  await waitFor(
    async () => (await db.doc(`houses/${id}`).get()).get('subscriptionStatus'),
    (status) => status !== AWAITING_STAMP,
    30000,
  );
  await db.doc(`houses/${id}`).update({ subscriptionStatus });
  await db.doc(`house-roles/${id}_${operator.uid}`).set({ houseId: id, uid: operator.uid, tier: 'owner', primary: true, grantedBy: 'seed', grantedAt: now, via: 'seed' });
  await db
    .doc(`admins/${operator.adminId}`)
    .update({ houseIds: FieldValue.arrayUnion(id), superAdmin: FieldValue.arrayUnion(id) });
  const auth = getAuth(adminApp());
  const claims = (await auth.getUser(operator.uid)).customClaims ?? {};
  await auth.setCustomUserClaims(operator.uid, {
    ...claims,
    admin: { ...(claims.admin as object | undefined), [id]: true },
    superAdmin: { ...(claims.superAdmin as object | undefined), [id]: true },
  });
  forgetIdToken(operator.uid);
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
