/**
 * The server-only role records house-roles/{houseId}_{uid} (util/houseRoles
 * holds the tier policy): their shape, reading them with the account's live
 * claims, and writing them on grants and revocations. No client rule matches
 * the path; the rules read the records with get() for guest-doc departures.
 */
import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';

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
  /** The house (so per-house checks, e.g. "is there a primary owner", are queries). */
  houseId: string;
  tier: RoleTier;
  grantedBy: string;
  grantedAt: string;
  via: RoleVia;
  invitationId?: string;
  /** The house's primary owner (set only by createHouses and the backfill). */
  primary?: boolean;
}

export const RANK: Record<RoleTier, number> = { resident: 0, peerLeader: 1, manager: 2, owner: 3 };
const TIERS = Object.keys(RANK) as RoleTier[];

/** Custom claims (only the admin/superAdmin/guest house maps are read). */
export type Claims = Record<string, unknown> | undefined;
export const holds = (claims: Claims, role: 'admin' | 'superAdmin' | 'guest', houseId: string) => {
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

export const parseTier = (v: unknown): RoleTier | null =>
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

/** The house's primary owner (the subscription holder), from the records; null if none. */
export async function primaryOwnerUid(houseId: string): Promise<string | null> {
  const snap = await admin
    .firestore()
    .collection('house-roles')
    .where('houseId', '==', houseId)
    .where('primary', '==', true)
    .get();
  const id = snap.docs[0]?.id;
  return id ? id.slice(houseId.length + 1) : null;
}

/** The primary owner record createHouses writes (in its transaction) and the backfill writes. */
export const primaryOwnerRecord = (
  uid: string,
  via: RoleVia,
  houseId: string,
): HouseRoleRecord => ({
  houseId,
  tier: 'owner',
  primary: true,
  grantedBy: uid,
  grantedAt: new Date().toISOString(),
  via,
});

/** The record to store for a grant, or null when the stored tier is already as high. */
export function nextRoleRecord(
  current: unknown,
  tier: RoleTier,
  meta: { houseId: string; grantedBy: string; via: RoleVia; invitationId?: string },
): HouseRoleRecord | null {
  const stored = parseTier(current);
  if (stored && RANK[stored] >= RANK[tier]) return null;
  return {
    houseId: meta.houseId,
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
    const record = nextRoleRecord(snap.exists ? (snap.data() ?? {}).tier : null, tier, {
      ...meta,
      houseId,
    });
    if (!record) return parseTier((snap.data() ?? {}).tier) ?? tier;
    tx.set(ref, record);
    return tier;
  });
}

/**
 * Brings the record in line with the account's LIVE claims after a claim is
 * revoked (call it after the claims write): it reflects the highest claim
 * that remains, never raising the stored tier.
 *   superAdmin left        -> unchanged (an owner record stays an owner);
 *   admin left, no super   -> owner becomes manager; manager/peer leader unchanged;
 *   guest only             -> resident;
 *   no house claim         -> no record.
 * The primary owner's record is never lowered: ownership is not a claim.
 * `removed` names the claim the caller removed (for the log only).
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
    // Live claims read after the record, inside the transaction (Admin SDK
    // transactions lock the record, so a grant's record write waits for this
    // one). A grant writes record, claims, record (callable/auth): if this
    // revoke runs between its first record write and its claims write, it
    // re-derives from the old claims and may lower or delete the record; the
    // grant's second record write restores it. Only a grant that fails after
    // its claims write leaves the lowered record: an admin grant then holds
    // the admin claim with a peer-leader record or none (least privilege); a
    // superAdmin grant ranks as owner by its claim but, as a rules target,
    // by the lowered record until the grant is retried. The backfill re-run
    // records what is missing.
    const claims = await liveClaims(uid);
    const cap: RoleTier | null = holds(claims, 'superAdmin', houseId)
      ? 'owner'
      : holds(claims, 'admin', houseId)
        ? 'manager'
        : holds(claims, 'guest', houseId)
          ? 'resident'
          : null;
    if (!cap) {
      tx.delete(ref);
    } else if (RANK[cap] < RANK[current]) {
      tx.update(ref, { tier: cap });
    }
  });
  logger.info('house-roles: record re-derived after a revoke', { houseId, removed });
}

/** Staff tiers keep the admin claim when their resident record goes. */
export const isStaffTier = (tier: RoleTier | null): boolean =>
  tier === 'owner' || tier === 'manager';
