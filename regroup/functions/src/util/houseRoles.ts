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
/** Custom claims (only the admin/superAdmin/guest house maps are read). */
type Claims = Record<string, unknown> | undefined;
const holds = (claims: Claims, role: 'admin' | 'superAdmin' | 'guest', houseId: string) => {
  const v = claims?.[role];
  if (Array.isArray(v)) return v.includes(houseId);
  return !!v && typeof v === 'object' && (v as Record<string, unknown>)[houseId] === true;
};

/**
 * The account's LIVE custom claims (Auth record), never the caller's ID
 * token: a token keeps a revoked claim for up to an hour. Missing account:
 * no claims.
 */
export async function liveClaims(uid: string): Promise<Claims> {
  try {
    return ((await admin.auth().getUser(uid)).customClaims ?? {}) as Claims;
  } catch (err) {
    if ((err as { code?: string }).code === 'auth/user-not-found') return {};
    throw err;
  }
}

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
 * An account's tier in the house, from its LIVE claims (liveClaims). Owner:
 * ownerId or a superAdmin claim. Staff otherwise needs the admin claim AND
 * reads its tier from the role record (a stale owner record counts as
 * manager); no record means peer leader. A guest claim alone is resident.
 */
export async function houseTierOf(
  uid: string,
  houseId: string,
  house: HouseFields,
): Promise<HouseTier> {
  const claims = await liveClaims(uid);
  if (house.ownerId === uid || holds(claims, 'superAdmin', houseId)) return 'owner';
  if (!holds(claims, 'admin', houseId)) return holds(claims, 'guest', houseId) ? 'resident' : 'none';
  const stored = await readRoleTier(houseId, uid);
  return stored === 'owner' || stored === 'manager' ? 'manager' : 'peerLeader';
}

const houseFields = async (houseId: string): Promise<HouseFields> =>
  ((await admin.firestore().collection('houses').doc(houseId).get()).data() ?? {}) as HouseFields;

/** Rank for removals: the house's primary owner (ownerId) above a co-owner. */
const removalRank = (tier: HouseTier, isPrimaryOwner: boolean) =>
  isPrimaryOwner ? 4 : tier === 'none' ? -1 : RANK[tier];

/**
 * Removing someone's house claim (admin, superAdmin or guest) needs a tier
 * strictly above theirs: owner > manager > peer leader > resident, so only
 * an owner removes a manager. The primary owner (ownerId) can be demoted only
 * by themselves; a co-owner holding superAdmin cannot remove them. Anyone may
 * remove their own claims. Both tiers come from live claims and records.
 */
export async function assertMayRevoke(params: {
  callerUid: string;
  targetUid: string;
  houseId: string;
  callableName: string;
}): Promise<void> {
  const { callerUid, targetUid, houseId, callableName } = params;
  if (callerUid === targetUid) return;
  const house = await houseFields(houseId);
  const [callerTier, targetTier] = await Promise.all([
    houseTierOf(callerUid, houseId, house),
    houseTierOf(targetUid, houseId, house),
  ]);
  const caller = removalRank(callerTier, house.ownerId === callerUid);
  const target = removalRank(targetTier, house.ownerId === targetUid);
  if (caller >= 1 && caller > target) return;
  logger.warn(`${callableName}: tier may not remove`, { houseId, callerTier, targetTier });
  throw new HttpsError(
    'permission-denied',
    house.ownerId === targetUid
      ? 'Only the house owner can change their own access'
      : 'Your role in this house cannot remove this person',
  );
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

/** Reads the house and the caller's tier (live claims), then assertTierMayGrant. */
export async function assertMayGrantTier(params: {
  callerUid: string;
  houseId: string;
  grant: RoleTier;
  callableName: string;
}): Promise<void> {
  const house = await houseFields(params.houseId);
  const tier = await houseTierOf(params.callerUid, params.houseId, house);
  assertTierMayGrant(tier, params.grant, params);
}

/** The record to store for a grant, or null when the stored tier is already as high. */
export function nextRoleRecord(
  current: unknown,
  tier: RoleTier,
  meta: { grantedBy: string; via: RoleVia; invitationId?: string },
): HouseRoleRecord | null {
  const stored = parseTier(current);
  if (stored && RANK[stored] >= RANK[tier]) return null;
  return {
    tier,
    grantedBy: meta.grantedBy,
    grantedAt: new Date().toISOString(),
    via: meta.via,
    ...(meta.invitationId ? { invitationId: meta.invitationId } : {}),
  };
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
    const record = nextRoleRecord(snap.exists ? (snap.data() ?? {}).tier : null, tier, meta);
    if (!record) return parseTier((snap.data() ?? {}).tier) ?? tier;
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
