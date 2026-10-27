/**
 * Who may bring whom into a house (NARR tiers; Oxford houses too, until the
 * Oxford admission PR). Owner rule: a resident never adds themselves; each
 * tier hands out only the tiers below it.
 *
 *   owner (primary owner record, or a superAdmin claim) -> owner, manager, peer leader, resident
 *   manager                                             -> peer leader, resident
 *   peer leader                                         -> resident
 *
 * The tier comes ONLY from the server-only role record
 *   house-roles/{houseId}_{uid}  { tier, grantedBy, grantedAt, via, primary? }
 * (no client rule matches the path) and the account's LIVE claims. The house
 * owner is the record with `primary: true`, written by createHouses (in its
 * transaction) and by scripts/backfillHouseRoles from ownerId read before the
 * functions deploy; `houses.ownerId` is never trusted for authority (a
 * superAdmin could rewrite it until the rules deploy). Never from guest
 * docs, admins docs or houseType. An admin-claim holder with no record is a
 * peer leader, the least privilege. The rules read the same records
 * (firestore.rules guests block) for direct guest-doc departures.
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
  | 'promoteScript'
  | 'backfill';

export interface HouseRoleRecord {
  tier: RoleTier;
  grantedBy: string;
  grantedAt: string;
  via: RoleVia;
  invitationId?: string;
  /** The house's primary owner (set only by createHouses and the backfill). */
  primary?: boolean;
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

/** The tiers this tier may hand out. */
export const MAY_GRANT_TIERS = (tier: HouseTier): readonly RoleTier[] => MAY_GRANT[tier];

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

/** The stored record (tier and primary flag), or null when there is no valid one. */
export async function readRoleRecord(
  houseId: string,
  uid: string,
): Promise<{ tier: RoleTier; primary: boolean } | null> {
  const snap = await roleRef(houseId, uid).get();
  const data = snap.exists ? (snap.data() ?? {}) : {};
  const tier = parseTier(data.tier);
  return tier ? { tier, primary: tier === 'owner' && data.primary === true } : null;
}

export async function readRoleTier(houseId: string, uid: string): Promise<RoleTier | null> {
  return (await readRoleRecord(houseId, uid))?.tier ?? null;
}

/** The house's primary owner, from the server-only record (never houses.ownerId). */
export async function isPrimaryOwner(houseId: string, uid: string): Promise<boolean> {
  return (await readRoleRecord(houseId, uid))?.primary === true;
}

/** The primary owner record createHouses writes (in its transaction) and the backfill writes. */
export const primaryOwnerRecord = (uid: string, via: RoleVia): HouseRoleRecord => ({
  tier: 'owner',
  primary: true,
  grantedBy: uid,
  grantedAt: new Date().toISOString(),
  via,
});

/** Tier plus removal rank (the primary owner ranks above a co-owner). */
async function tierAndRank(uid: string, houseId: string) {
  const [claims, record] = await Promise.all([liveClaims(uid), readRoleRecord(houseId, uid)]);
  let tier: HouseTier;
  if (record?.primary || holds(claims, 'superAdmin', houseId)) tier = 'owner';
  else if (!holds(claims, 'admin', houseId))
    tier = holds(claims, 'guest', houseId) ? 'resident' : 'none';
  else tier = record?.tier === 'owner' || record?.tier === 'manager' ? 'manager' : 'peerLeader';
  const rank = record?.primary ? 4 : tier === 'none' ? -1 : RANK[tier];
  return { tier, rank, primary: !!record?.primary };
}

/**
 * An account's tier in the house: owner (primary owner record, or a live
 * superAdmin claim); staff need the live admin claim and take their tier
 * from the record (a stale owner record counts as manager; none means peer
 * leader); a guest claim alone is resident.
 */
export async function houseTierOf(uid: string, houseId: string): Promise<HouseTier> {
  return (await tierAndRank(uid, houseId)).tier;
}

/**
 * Removing someone's house claim needs a rank strictly above theirs: primary
 * owner > co-owner > manager > peer leader > resident, so only an owner
 * removes a manager, and the primary owner is demoted only by themselves.
 * Anyone may remove their own claims. The caller's rank is computed once per
 * house; the targets are checked in parallel.
 */
export async function assertMayRevokeAll(params: {
  callerUid: string;
  targets: Array<{ targetUid: string; houseId: string }>;
  callableName: string;
}): Promise<void> {
  const { callerUid, callableName } = params;
  const targets = params.targets.filter((t) => t.targetUid !== callerUid);
  const houses = [...new Set(targets.map((t) => t.houseId))];
  const callerByHouse = new Map(
    await Promise.all(houses.map(async (h) => [h, await tierAndRank(callerUid, h)] as const)),
  );
  await Promise.all(
    targets.map(async ({ targetUid, houseId }) => {
      const caller = callerByHouse.get(houseId)!;
      const target = await tierAndRank(targetUid, houseId);
      if (caller.rank >= 1 && caller.rank > target.rank) return;
      logger.warn(`${callableName}: tier may not remove`, {
        houseId,
        callerTier: caller.tier,
        targetTier: target.tier,
      });
      throw new HttpsError(
        'permission-denied',
        target.primary
          ? 'Only the house owner can change their own access'
          : 'Your role in this house cannot remove this person',
      );
    }),
  );
}

export const assertMayRevoke = (p: {
  callerUid: string;
  targetUid: string;
  houseId: string;
  callableName: string;
}) => assertMayRevokeAll({ callerUid: p.callerUid, targets: [p], callableName: p.callableName });

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

/** The caller's tier (live claims and record), then assertTierMayGrant. */
export async function assertMayGrantTier(params: {
  callerUid: string;
  houseId: string;
  grant: RoleTier;
  callableName: string;
}): Promise<void> {
  assertTierMayGrant(await houseTierOf(params.callerUid, params.houseId), params.grant, params);
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
 *   guest removed:      resident -> no record (a staff tier is unchanged).
 * The primary owner's record is never lowered: ownership is not a claim.
 */
export async function recordRoleRevoke(
  houseId: string,
  uid: string,
  removed: 'admin' | 'superAdmin' | 'guest',
): Promise<void> {
  const ref = roleRef(houseId, uid);
  await admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? (snap.data() ?? {}) : {};
    const current = parseTier(data.tier);
    if (!current || data.primary === true) return;
    if (removed === 'superAdmin' && current === 'owner') tx.update(ref, { tier: 'manager' });
    if (removed === 'admin' && current === 'peerLeader') tx.update(ref, { tier: 'resident' });
    if (removed === 'admin' && (current === 'owner' || current === 'manager')) tx.delete(ref);
    if (removed === 'guest' && current === 'resident') tx.delete(ref);
  });
}

/** Staff tiers keep the admin claim when their resident record goes. */
export const isStaffTier = (tier: RoleTier | null): boolean =>
  tier === 'owner' || tier === 'manager';
