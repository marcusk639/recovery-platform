/**
 * Who may bring whom into a NARR (traditional) house. Owner rule: a resident
 * never adds themselves; staff tiers limit which roles each tier may hand out.
 *
 *   owner (house.ownerId, or a superAdmin claim) -> manager, peer leader, resident
 *   manager (admin claim, not a resident here)   -> peer leader, resident
 *   peer leader (admin claim AND a resident)     -> resident only
 *
 * "Is a resident" is decided from server state only: an active guest doc
 * (util/guestMembership isActiveGuestDoc) of that account in the house.
 * Oxford houses keep their current invitation behaviour; vote-gated
 * admission comes in a separate PR.
 */
import * as admin from 'firebase-admin';
import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { isActiveGuestDoc } from './guestMembership';
import { InvitationRole } from '../entities/Invitation';

export type HouseTier = 'owner' | 'manager' | 'peer-leader' | 'none';

const MAY_INVITE: Record<HouseTier, readonly InvitationRole[]> = {
  owner: ['admin', 'senior-peer', 'guest'],
  manager: ['senior-peer', 'guest'],
  'peer-leader': ['guest'],
  none: [],
};

const TIER_LABEL: Record<InvitationRole, string> = {
  admin: 'a manager',
  'senior-peer': 'a peer leader',
  guest: 'a resident',
};

interface HouseFields {
  ownerId?: string;
  houseType?: string;
}
/** Caller's token claims (only the admin/superAdmin house maps are read). */
type Claims = Record<string, unknown> | undefined;
const houseMap = (claims: Claims, role: 'admin' | 'superAdmin') =>
  (claims?.[role] ?? {}) as Record<string, unknown>;

/** True when the account has an active guest doc in the house. */
export async function isActiveResidentOfHouse(uid: string, houseId: string): Promise<boolean> {
  const snap = await admin.firestore().collection('guests').where('userId', '==', uid).get();
  return snap.docs.some((d) => {
    const data = d.data() ?? {};
    return data.houseId === houseId && isActiveGuestDoc(data);
  });
}

export async function houseTierOf(
  uid: string,
  claims: Claims,
  houseId: string,
  house: HouseFields,
): Promise<HouseTier> {
  if (house.ownerId === uid || houseMap(claims, 'superAdmin')[houseId] === true) return 'owner';
  if (houseMap(claims, 'admin')[houseId] !== true) return 'none';
  return (await isActiveResidentOfHouse(uid, houseId)) ? 'peer-leader' : 'manager';
}

export const isOxfordHouse = (house: HouseFields) => house.houseType === 'oxford';

/** Throws permission-denied unless the tier may hand out this role. */
export function assertTierMayGrant(
  tier: HouseTier,
  role: InvitationRole,
  ctx: { callableName: string; houseId: string },
): void {
  if (MAY_INVITE[tier].includes(role)) return;
  logger.warn(`${ctx.callableName}: tier may not grant role`, { houseId: ctx.houseId, tier, role });
  throw new HttpsError(
    'permission-denied',
    tier === 'none'
      ? 'Only the house owner or staff can do this'
      : `Your role in this house cannot make someone ${TIER_LABEL[role]}`,
  );
}

/**
 * Tier check for granting a staff claim directly (addAdminAuthorization,
 * promoteGuestsToAdmin). Granting admin to someone who is a resident of the
 * house makes them a peer leader; to anyone else, a manager. A superAdmin
 * grant is owner-only. Oxford houses are left as they are.
 */
export async function assertMayGrantStaffClaim(params: {
  callerUid: string;
  claims: Claims;
  targetUid: string;
  houseId: string;
  superAdmin: boolean;
  callableName: string;
}): Promise<void> {
  const { callerUid, claims, targetUid, houseId, callableName } = params;
  const snap = await admin.firestore().collection('houses').doc(houseId).get();
  const house = (snap.data() ?? {}) as HouseFields;
  if (isOxfordHouse(house)) return;
  const tier = await houseTierOf(callerUid, claims, houseId, house);
  const role: InvitationRole = params.superAdmin
    ? 'admin'
    : (await isActiveResidentOfHouse(targetUid, houseId))
      ? 'senior-peer'
      : 'admin';
  if (params.superAdmin && tier !== 'owner') {
    logger.warn(`${callableName}: superAdmin grant by non-owner`, { houseId, tier });
    throw new HttpsError('permission-denied', 'Only the house owner can grant owner access');
  }
  assertTierMayGrant(tier, role, { callableName, houseId });
}
