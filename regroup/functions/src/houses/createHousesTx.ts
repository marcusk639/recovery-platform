import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import type { Transaction } from 'firebase-admin/firestore';
import {
  adminCollection,
  createAdminId,
  houseCollection,
  houseRolesCollection,
  houseTombstoneCollection,
  userCollection,
} from '../api/firestore';
import { primaryOwnerRecord } from '../util/houseRoles';
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
 * ownerId === uid AND is already in the caller's subscription houses map is
 * treated as created: no house doc is rewritten; the admin doc and the user's
 * housesOwned/subscriptionMetadata are re-applied (lastUpdatedAt is bumped).
 * `subscriptionMetadata.houses` is server-written (rules let a client create it
 * only empty); ownership is still verified by `house.ownerId === uid`. A
 * tombstoned (deleted) id is refused.
 *
 * The onboarding flags (orgSetupCompleted/isAdmin/isSuperAdmin) are NOT
 * written here: the callable sets them only after the claims are granted, so
 * a failed grant never leaves the operator past onboarding without claims.
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
  // Defence in depth: ids are already caller-scoped, but a deleted id must
  // never be re-created. The tombstone is written by the onHouseDeleted
  // trigger (eventually, after the delete), so this is not the primary guard.
  const tombstoneSnaps = await Promise.all(
    ids.map((id) => tx.get(houseTombstoneCollection.doc(id))),
  );
  const tombstoned = ids.filter((_id, i) => tombstoneSnaps[i].exists);
  if (tombstoned.length > 0) {
    logger.warn('createHouses: refused', { uid, houseIds: tombstoned, reason: 'tombstoned' });
    throw new HttpsError('already-exists', 'A house with this id already exists');
  }
  const newIndexes: number[] = [];
  houseSnaps.forEach((snap, i) => {
    if (!snap.exists) {
      newIndexes.push(i);
      return;
    }
    // An existing doc at a caller-derived id is normally this caller's own
    // earlier create (a retry). It counts as ours only if ownerId === uid AND
    // the id is already in the subscription houses map; anything else (e.g. a
    // legacy client-created house) is refused. `subscriptionMetadata.houses`
    // is server-written (rules let a client create it only empty); ownerId is
    // still verified.
    const ownerId = (snap.data() as { ownerId?: string } | undefined)?.ownerId;
    const inSubscription = Object.prototype.hasOwnProperty.call(meta.houses ?? {}, ids[i]);
    if (ownerId !== uid || !inSubscription) {
      logger.warn('createHouses: refused', {
        uid,
        houseIds: [ids[i]],
        reason: 'existing-house-not-owned',
      });
      throw new HttpsError('already-exists', 'A house with this id already exists');
    }
  });

  let existingAdmin: Partial<AdminDoc> | undefined;
  let adminId = user?.adminId || '';
  if (adminId) {
    const adminSnap = await tx.get(adminCollection.doc(adminId));
    existingAdmin = adminSnap.exists ? (adminSnap.data() as Partial<AdminDoc>) : undefined;
    if (existingAdmin?.userId !== uid) {
      logger.warn('createHouses: refused', { uid, adminId, reason: 'admin-not-owned' });
      throw new HttpsError('permission-denied', 'Admin profile does not belong to this user');
    }
  } else {
    adminId = createAdminId();
  }

  // ── Pure computation (may throw on the property cap; nothing written yet) ──
  const newIds = newIndexes.map((i) => ids[i]);
  const idMap = Object.fromEntries(inputs.map((h, i) => [h.requestKey, ids[i]]));
  const subscriptionMetadata = addHousesToSubscription(meta, newIds, now);

  const admin: AdminDoc = {
    id: adminId,
    email: existingAdmin?.email ?? (user?.email ?? '').toLowerCase(),
    firstName: existingAdmin?.firstName ?? user?.firstName ?? '',
    lastName: existingAdmin?.lastName ?? user?.lastName ?? '',
    userId: uid,
    houseIds: union(existingAdmin?.houseIds, ids),
    superAdmin: union(existingAdmin?.superAdmin, ids),
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
  // The server-only primary owner record (util/houseRoles): who owns the
  // house for every authority check, independent of houses.ownerId. Written
  // with the house, so it can never be missing for a house createHouses made.
  // A retry re-writes the same record.
  ids.forEach((id) => {
    tx.set(houseRolesCollection.doc(`${id}_${uid}`), primaryOwnerRecord(uid, 'createHouses'));
  });
  tx.update(userRef, {
    adminId,
    housesOwned: union(user?.housesOwned, ids),
    subscriptionMetadata,
  });

  return { houseIds: ids, idMap, admin, subscriptionMetadata, status };
};
