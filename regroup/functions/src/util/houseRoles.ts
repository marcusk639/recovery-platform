/**
 * Who may bring whom into a house (NARR tiers; Oxford houses too, until the
 * Oxford admission PR). Owner rule: a resident never adds themselves; each
 * tier hands out only the tiers below it.
 *
 *   primary owner (primary owner record)               -> owner, manager, peer leader, resident
 *   co-owner (superAdmin claim, not primary)            -> manager, peer leader, resident
 *   manager                                             -> peer leader, resident
 *   peer leader                                         -> resident
 *
 * Ranks are strict for every grant and revoke: only the primary owner
 * (rank 4) may make someone an owner; a co-owner (rank 3) may not.
 *
 * The tier comes ONLY from the server-only role record
 *   house-roles/{houseId}_{uid}  { tier, grantedBy, grantedAt, via, primary? }
 * (no client rule matches the path) and the account's LIVE claims. The house
 * owner is the record with `primary: true`, written by createHouses (in its
 * transaction) and by scripts/backfillHouseRoles only where server-written
 * evidence agrees with superAdminId and ownerId (scripts/backfillHouseOwners);
 * `houses.ownerId` is never trusted for authority (a superAdmin could rewrite
 * it until the rules deploy). Never from guest
 * docs, admins docs or houseType. An admin-claim holder with no record is a
 * peer leader, the least privilege. The rules read the same records
 * (firestore.rules guests block) for direct guest-doc departures.
 *
 * Record before claims: addAdminAuthorization, addGuestAuthorization and
 * promoteGuestsToAdmin write the record, then the claims. If the claims
 * write fails, a record with no matching claim is left. It grants nothing:
 * every tier check here needs the live claim, and the rules count a caller's
 * record only when a matching claim backs it (owner: superAdmin; manager or
 * peer leader: admin), so an account with a lower claim keeps that claim's
 * rank. As a TARGET it still ranks by the record (the rules cannot read
 * another account's claims): no lower staff can make a shadow guest doc for
 * it, and equal staff cannot discharge it (a manager or the owner can) until
 * a retry succeeds or the backfill's stale pass lowers the record (it skips
 * records granted in the last 10 minutes). The other order left an admin-claim holder with no
 * record, ranked 0 in the rules. redeemInvitation still writes the claims
 * first (its retry design needs the record and grantCompletedAt together);
 * a redeem stranded there is completed by the retry, and the backfill
 * records any admin-claim holder still without a record.
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

// 'owner' is granted only by the primary owner (assertMayGrantTier), never by tier alone.
const MAY_GRANT: Record<HouseTier, readonly RoleTier[]> = {
  owner: ['manager', 'peerLeader', 'resident'],
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
 * Targets equal to the caller are skipped here, but that does not let
 * anyone remove their own claims: the callables also run
 * assertCanGrantClaimForHouses (util/authGuard), which refuses a self-target
 * unless the caller is the primary owner. The caller's rank is computed once per
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

/**
 * The caller's tier (live claims and record), then assertTierMayGrant. Making
 * someone an owner needs the primary owner record (rank 4): a co-owner holds
 * the owner tier but ranks 3, and ranks are strict.
 */
export async function assertMayGrantTier(params: {
  callerUid: string;
  houseId: string;
  grant: RoleTier;
  callableName: string;
}): Promise<void> {
  const caller = await tierAndRank(params.callerUid, params.houseId);
  if (params.grant === 'owner') {
    if (caller.primary) return;
    logger.warn(`${params.callableName}: only the primary owner may grant owner`, {
      houseId: params.houseId,
      tier: caller.tier,
    });
    throw new HttpsError('permission-denied', 'Only the house owner can add another owner');
  }
  assertTierMayGrant(caller.tier, params.grant, params);
}
