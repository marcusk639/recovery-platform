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
import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { InvitationRole } from '../entities/Invitation';
import {
  Claims,
  holds,
  HouseTier,
  liveClaims,
  RANK,
  readRoleRecord,
  RoleTier,
} from './houseRoleStore';

export * from './houseRoleStore';

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
