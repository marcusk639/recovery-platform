/**
 * Who may bring whom into a house (NARR tiers; Oxford houses too, until the
 * Oxford admission PR). Owner rule: a resident never adds themselves; each
 * tier hands out only the tiers below it.
 *
 *   owner (house.ownerId, or a superAdmin claim) -> owner, manager, peer leader, resident
 *   manager                                      -> peer leader, resident
 *   peer leader                                  -> resident
 *
 * The tier comes ONLY from a server-only role record,
 *   house-roles/{houseId}_{uid}  { tier, grantedBy, grantedAt, via }
 * (no client rule matches the path), plus ownerId / the superAdmin claim for
 * the owner. Never from guest docs, admins docs, houseType or claims other
 * admins can edit, so a client write cannot change anyone's tier. Every
 * grant path writes the record; revocations update it. An admin-claim holder
 * with no record yet (before scripts/backfillHouseRoles) is a peer leader,
 * the least privilege; the owner can always act.
 */
import * as admin from 'firebase-admin';
import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { InvitationRole } from '../entities/Invitation';

export type RoleTier = 'owner' | 'manager' | 'peerLeader' | 'resident';
export type HouseTier = RoleTier | 'none';
export type RoleVia =
  | 'createHouses'
  | 'finishOperatorSetup'
  | 'invitation'
  | 'addAdminAuthorization'
  | 'promoteGuestsToAdmin'
  | 'addGuestAuthorization'
  | 'backfill';

export interface HouseRoleRecord {
  tier: RoleTier;
  grantedBy: string;
  grantedAt: string;
  via: RoleVia;
  invitationId?: string;
}

const RANK: Record<RoleTier, number> = { resident: 0, peerLeader: 1, manager: 2, owner: 3 };
const TIERS = Object.keys(RANK) as RoleTier[];

const MAY_GRANT: Record<HouseTier, readonly RoleTier[]> = {
  owner: ['owner', 'manager', 'peerLeader', 'resident'],
  manager: ['peerLeader', 'resident'],
  peerLeader: ['resident'],
  resident: [],
  none: [],
};

const TIER_LABEL: Record<RoleTier, string> = {
  owner: 'an owner',
  manager: 'a manager',
  peerLeader: 'a peer leader',
  resident: 'a resident',
};

export const INVITATION_TIER: Record<InvitationRole, RoleTier> = {
  admin: 'manager',
  'senior-peer': 'peerLeader',
  guest: 'resident',
};

interface HouseFields {
  ownerId?: string;
}
/** Caller's token claims (only the admin/superAdmin house maps are read). */
type Claims = Record<string, unknown> | undefined;
const holds = (claims: Claims, role: 'admin' | 'superAdmin', houseId: string) =>
  ((claims?.[role] ?? {}) as Record<string, unknown>)[houseId] === true;

export const roleRef = (houseId: string, uid: string) =>
  admin.firestore().collection('house-roles').doc(`${houseId}_${uid}`);

const parseTier = (v: unknown): RoleTier | null =>
  TIERS.includes(v as RoleTier) ? (v as RoleTier) : null;

/** The stored tier, or null when there is no (valid) record. */
export async function readRoleTier(houseId: string, uid: string): Promise<RoleTier | null> {
  const snap = await roleRef(houseId, uid).get();
  return snap.exists ? parseTier((snap.data() ?? {}).tier) : null;
}

/**
 * The caller's tier in the house. Owner: ownerId or a superAdmin claim. Staff
 * otherwise needs the admin claim AND reads its tier from the role record
 * (a stale owner record counts as manager); no record means peer leader.
 */
export async function houseTierOf(
  uid: string,
  claims: Claims,
  houseId: string,
  house: HouseFields,
): Promise<HouseTier> {
  if (house.ownerId === uid || holds(claims, 'superAdmin', houseId)) return 'owner';
  if (!holds(claims, 'admin', houseId)) return 'none';
  const stored = await readRoleTier(houseId, uid);
  return stored === 'owner' || stored === 'manager' ? 'manager' : 'peerLeader';
}

/** Throws permission-denied unless the tier may hand out this tier. */
export function assertTierMayGrant(
  tier: HouseTier,
  grant: RoleTier,
  ctx: { callableName: string; houseId: string },
): void {
  if (MAY_GRANT[tier].includes(grant)) return;
  logger.warn(`${ctx.callableName}: tier may not grant`, { houseId: ctx.houseId, tier, grant });
  throw new HttpsError(
    'permission-denied',
    tier === 'none' || tier === 'resident'
      ? 'Only the house owner or staff can do this'
      : `Your role in this house cannot make someone ${TIER_LABEL[grant]}`,
  );
}

/** Reads the house and the caller's tier, then assertTierMayGrant. */
export async function assertMayGrantTier(params: {
  callerUid: string;
  claims: Claims;
  houseId: string;
  grant: RoleTier;
  callableName: string;
}): Promise<void> {
  const snap = await admin.firestore().collection('houses').doc(params.houseId).get();
  const house = (snap.data() ?? {}) as HouseFields;
  const tier = await houseTierOf(params.callerUid, params.claims, params.houseId, house);
  assertTierMayGrant(tier, params.grant, params);
}

/**
 * Records a grant. Never lowers a stored tier (a manager who is also invited
 * as a resident stays a manager). Transactional; returns the stored tier.
 */
export async function recordRoleGrant(
  houseId: string,
  uid: string,
  tier: RoleTier,
  meta: { grantedBy: string; via: RoleVia; invitationId?: string },
): Promise<RoleTier> {
  const ref = roleRef(houseId, uid);
  return admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? parseTier((snap.data() ?? {}).tier) : null;
    if (current && RANK[current] >= RANK[tier]) return current;
    const record: HouseRoleRecord = {
      tier,
      grantedBy: meta.grantedBy,
      grantedAt: new Date().toISOString(),
      via: meta.via,
      ...(meta.invitationId ? { invitationId: meta.invitationId } : {}),
    };
    tx.set(ref, record);
    return tier;
  });
}

/**
 * Updates the record after a claim is revoked:
 *   superAdmin removed: owner -> manager;
 *   admin removed:      peer leader -> resident, owner/manager -> no record;
 *   guest removed:      resident -> no record (a staff tier is unchanged:
 *                       removing a guest claim never changes a tier).
 */
export async function recordRoleRevoke(
  houseId: string,
  uid: string,
  removed: 'admin' | 'superAdmin' | 'guest',
): Promise<void> {
  const ref = roleRef(houseId, uid);
  await admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? parseTier((snap.data() ?? {}).tier) : null;
    if (!current) return;
    if (removed === 'superAdmin' && current === 'owner') tx.update(ref, { tier: 'manager' });
    if (removed === 'admin' && current === 'peerLeader') tx.update(ref, { tier: 'resident' });
    if (removed === 'admin' && (current === 'owner' || current === 'manager')) tx.delete(ref);
    if (removed === 'guest' && current === 'resident') tx.delete(ref);
  });
}

/** Staff tiers keep the admin claim when their resident record goes. */
export const isStaffTier = (tier: RoleTier | null): boolean =>
  tier === 'owner' || tier === 'manager';

/** Owner records for houses the uid now owns (createHouses, finishOperatorSetup). */
export async function recordOwnerRoles(
  uid: string,
  houseIds: string[],
  via: RoleVia,
): Promise<void> {
  for (const houseId of houseIds)
    await recordRoleGrant(houseId, uid, 'owner', { grantedBy: uid, via });
}
