import { HttpsError } from 'firebase-functions/v2/https';
import type { Transaction } from 'firebase-admin/firestore';
import {
  adminCollection,
  createAdminId,
  houseCollection,
  houseTombstoneCollection,
  userCollection,
} from '../api/firestore';
import type Admin from '../entities/Admin';
import type OperatorSubscription from '../entities/OperatorSubscription';
import type { User } from '../entities/User';
import { operatorStatusToHouseStatus } from '../util/entitlement';
import { addHousesToSubscription } from '../util/subscriptionHouses';
import { deriveHouseId } from './houseId';
import { buildHouseDoc, CreateHouseInput } from './houseInput';

export type AdminDoc = Pick<
  Admin,
  'id' | 'email' | 'firstName' | 'lastName' | 'userId' | 'houseIds' | 'superAdmin'
>;

export interface CreateHousesResult {
  houseIds: string[];
  /** requestKey → server-derived house id, for every requested house. */
  idMap: Record<string, string>;
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
 * (firebase-admin requirement). House ids are derived on the server from
 * (uid, requestKey) — the client never chooses one — so a caller can only ever
 * address ids in its own derived namespace. Idempotent per requestKey: a retry
 * with the same key derives the same id, and a house that already exists with
 * ownerId === uid AND is already in the caller's server-owned subscription map
 * is treated as created, so the retry rewrites nothing and only re-applies the
 * set-unions. A deleted id (houseTombstones) can never be created again
 * (defence in depth: the caller would have to re-derive its own deleted id).
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

  const ids = inputs.map((h) => deriveHouseId(uid, h.requestKey));
  const houseRefs = ids.map((id) => houseCollection.doc(id));
  const houseSnaps = await Promise.all(houseRefs.map((ref) => tx.get(ref)));
  // A deleted house leaves a tombstone (triggers/firestore/houseTombstone.ts).
  // Without this check, deleting a house and calling createHouses with its id
  // would see no doc and mint superAdmin on it for the caller.
  const tombstoneSnaps = await Promise.all(
    ids.map((id) => tx.get(houseTombstoneCollection.doc(id))),
  );
  if (tombstoneSnaps.some((snap) => snap.exists)) {
    throw new HttpsError('already-exists', 'A house with this id already exists');
  }
  const newIndexes: number[] = [];
  houseSnaps.forEach((snap, i) => {
    if (!snap.exists) {
      newIndexes.push(i);
      return;
    }
    // Ids are server-derived from (uid, requestKey), so a caller can never
    // name another operator's id — live or deleted — and an existing doc here
    // is normally this caller's own earlier create (a retry with the same key).
    // It still counts as "already created by this caller" only if ownerId ===
    // uid AND the id is already in the caller's subscription map (defence in
    // depth, e.g. against a legacy client-created house). Together they prove
    // ownership: firestore.rules deny client house creates, and only a
    // superAdmin of the house may change ownerId (plain admins and guests
    // cannot). subscriptionMetadata is written only by the server — here, in
    // the same transaction as the house, and by updateSubscriptionHouses "add",
    // which itself requires ownerId === uid. So a caller whose ownerId and map
    // both match is the creator or already superAdmin of the house. Another
    // user (e.g. a plain admin) cannot re-create a deleted house either: its
    // uid derives a different id, and the deleted id is tombstoned (above).
    const ownerId = (snap.data() as { ownerId?: string } | undefined)?.ownerId;
    const inSubscription = Object.prototype.hasOwnProperty.call(meta.houses ?? {}, ids[i]);
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
  const allIds = ids;
  const newIds = newIndexes.map((i) => ids[i]);
  const idMap = Object.fromEntries(inputs.map((h, i) => [h.requestKey, ids[i]]));
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
  newIndexes.forEach((i) => {
    tx.create(
      houseRefs[i],
      buildHouseDoc(inputs[i], {
        houseId: ids[i],
        ownerUid: uid,
        adminId,
        subscriptionStatus: status,
        now: nowIso,
      }),
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

  return { houseIds: allIds, idMap, admin, subscriptionMetadata, status };
};
