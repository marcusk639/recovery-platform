import { HttpsError } from 'firebase-functions/v2/https';
import type { Transaction } from 'firebase-admin/firestore';
import { adminCollection, createAdminId, houseCollection, userCollection } from '../api/firestore';
import type Admin from '../entities/Admin';
import type OperatorSubscription from '../entities/OperatorSubscription';
import type { User } from '../entities/User';
import { operatorStatusToHouseStatus } from '../util/entitlement';
import { addHousesToSubscription } from '../util/subscriptionHouses';
import { buildHouseDoc, CreateHouseInput } from './houseInput';

export type AdminDoc = Pick<
  Admin,
  'id' | 'email' | 'firstName' | 'lastName' | 'userId' | 'houseIds' | 'superAdmin'
>;

export interface CreateHousesResult {
  houseIds: string[];
  admin: AdminDoc;
  subscriptionMetadata: OperatorSubscription;
  status: 'active' | 'trialing';
}

const union = (existing: unknown, add: string[]): string[] => {
  const base = Array.isArray(existing) ? existing.filter((x) => typeof x === 'string') : [];
  return Array.from(new Set([...base, ...add]));
};

/**
 * Entitlement gate: the operator must hold a tier subscription whose status
 * maps to an active or trialing house status. Anything else (past_due,
 * canceled, unknown, no tier, no metadata) is denied, so a house never exists
 * for an unentitled operator.
 */
export const assertCanCreateHouses = (
  user: Partial<User> | undefined,
): { meta: OperatorSubscription; status: 'active' | 'trialing' } => {
  const meta = user?.subscriptionMetadata;
  const status = operatorStatusToHouseStatus(meta?.status);
  if (!meta || !meta.tier || (status !== 'active' && status !== 'trialing')) {
    throw new HttpsError(
      'failed-precondition',
      'An active subscription is required to create a house',
    );
  }
  return { meta, status };
};

/**
 * Transaction body for createHouses. All reads happen before any write
 * (firebase-admin requirement). Idempotent per house id: a house that already
 * exists with ownerId === uid is treated as created, so a retry after a failed
 * claim grant rewrites nothing and only re-applies the set-unions.
 */
export const createHousesTx = async (
  tx: Transaction,
  uid: string,
  inputs: CreateHouseInput[],
  now: Date,
): Promise<CreateHousesResult> => {
  // ── Reads ──
  // The user doc is re-read inside the transaction so concurrent calls cannot
  // both pass the property cap against the same stale subscription snapshot.
  const userRef = userCollection.doc(uid);
  const userSnap = await tx.get(userRef);
  const user = userSnap.exists ? (userSnap.data() as Partial<User>) : undefined;
  const { meta, status } = assertCanCreateHouses(user);

  const houseRefs = inputs.map((h) => houseCollection.doc(h.id));
  const houseSnaps = await Promise.all(houseRefs.map((ref) => tx.get(ref)));
  const newInputs: CreateHouseInput[] = [];
  houseSnaps.forEach((snap, i) => {
    if (!snap.exists) {
      newInputs.push(inputs[i]);
      return;
    }
    // An existing house counts as "already created by this caller" only if
    // ownerId === uid AND the id is already in the caller's subscription map.
    // ownerId alone is not proof: it is client-forgeable (the house delete and
    // create rules accept a plain `admin` claim with no field restrictions), so
    // an admin of another operator's house could delete and recreate it with
    // ownerId = self, then retry here to be granted superAdmin on it without it
    // ever counting against their property cap. subscriptionMetadata.houses is
    // server-owned and is written in the same transaction as the house, so it
    // can only hold the id if a previous createHouses call really created it.
    const ownerId = (snap.data() as { ownerId?: string } | undefined)?.ownerId;
    const inSubscription = Object.prototype.hasOwnProperty.call(meta.houses ?? {}, inputs[i].id);
    if (ownerId !== uid || !inSubscription) {
      throw new HttpsError('already-exists', 'A house with this id already exists');
    }
  });

  let existingAdmin: Partial<AdminDoc> | undefined;
  let adminId = user?.adminId || '';
  if (adminId) {
    const adminSnap = await tx.get(adminCollection.doc(adminId));
    existingAdmin = adminSnap.exists ? (adminSnap.data() as Partial<AdminDoc>) : undefined;
    if (existingAdmin?.userId !== uid) {
      throw new HttpsError('permission-denied', 'Admin profile does not belong to this user');
    }
  } else {
    adminId = createAdminId();
  }

  // ── Pure computation (may throw on the property cap; nothing written yet) ──
  const allIds = inputs.map((h) => h.id);
  const newIds = newInputs.map((h) => h.id);
  const subscriptionMetadata = addHousesToSubscription(meta, newIds, now);

  const admin: AdminDoc = {
    id: adminId,
    email: existingAdmin?.email ?? (user?.email ?? '').toLowerCase(),
    firstName: existingAdmin?.firstName ?? user?.firstName ?? '',
    lastName: existingAdmin?.lastName ?? user?.lastName ?? '',
    userId: uid,
    houseIds: union(existingAdmin?.houseIds, allIds),
    superAdmin: union(existingAdmin?.superAdmin, allIds),
  };

  // ── Writes ──
  const nowIso = now.toISOString();
  newInputs.forEach((input) => {
    tx.create(
      houseCollection.doc(input.id),
      buildHouseDoc(input, { ownerUid: uid, adminId, subscriptionStatus: status, now: nowIso }),
    );
  });
  tx.set(adminCollection.doc(adminId), admin, { merge: true });
  tx.update(userRef, {
    orgSetupCompleted: true,
    isAdmin: true,
    isSuperAdmin: true,
    adminId,
    housesOwned: union(user?.housesOwned, allIds),
    subscriptionMetadata,
  });

  return { houseIds: allIds, admin, subscriptionMetadata, status };
};
