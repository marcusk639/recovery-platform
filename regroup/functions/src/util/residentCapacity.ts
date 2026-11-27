import { logger } from 'firebase-functions';
import { HttpsError } from 'firebase-functions/v2/https';
import { getHouse, getUser, getInvitationsForHouse } from '../api/firestore';
import { changeSubscriptionHouses } from './operatorSubscriptionWrite';
import { totalResidents } from './tierCaps';
import { Invitation, InvitationRole } from '../entities/Invitation';
import OperatorSubscription from '../entities/OperatorSubscription';

/**
 * Roles that consume a resident (guest) slot on the operator's subscription.
 * "admin" invitations grant house-staff access — not a guest claim — so they
 * are exempt from the resident cap. Mirrors the claim mapping in
 * redeemInvitation (callable/invitations.ts): role=guest|senior-peer grant a
 * "guest" claim, role=admin does not.
 */
const RESIDENT_ROLES: ReadonlySet<InvitationRole> = new Set(['guest', 'senior-peer']);

export const roleConsumesResidentSlot = (role: InvitationRole): boolean => RESIDENT_ROLES.has(role);

const isPendingResidentInvite = (inv: Invitation): boolean =>
  !inv.redeemedAt &&
  roleConsumesResidentSlot(inv.role) &&
  new Date(inv.expiresAt).getTime() >= Date.now();

/**
 * Counts outstanding (pending, unexpired, resident-consuming) invitations
 * across every house on the operator's subscription. Queried one house at a
 * time (single-field `houseId ==` equality) — see getInvitationsForHouse for
 * why this avoids needing a composite Firestore index.
 */
async function countPendingResidentInvites(houseIds: string[]): Promise<number> {
  const perHouse = await Promise.all(houseIds.map((id) => getInvitationsForHouse(id)));
  return perHouse.flat().filter((inv) => isPendingResidentInvite(inv as Invitation)).length;
}

/**
 * Enforces the operator's resident cap before a guest/senior-peer invitation
 * is created or accepted. Counts BOTH already-occupied resident slots
 * (persisted `subscriptionMetadata.houses[*].numberOfGuests`) and
 * outstanding pending invitations, summed across every house on the
 * subscription — counting only accepted residents would let an operator
 * blow past the cap by sending many invitations at once and having them all
 * accepted later.
 *
 * Deliberately FAILS OPEN (allows the operation) when the limit cannot be
 * resolved — e.g. the house has no owner on record, the owner has no
 * subscriptionMetadata, or `maxResidents` was never persisted (a legacy,
 * pre-tier subscriber). This is a revenue-protection check, not a security
 * boundary, and this product's domain is recovery housing: silently
 * blocking a legitimate resident invite is more operationally harmful than
 * a temporarily-unenforced cap. The anomaly is logged (ids + limit only,
 * never names/emails) so billing/ops can follow up.
 *
 * `maxResidents === null` (Enterprise/Network tiers) is unlimited by design
 * and is intentionally NOT logged — that's an expected, valid state, not an
 * anomaly.
 */
export async function assertResidentCapacityAvailable(
  ownerId: string | undefined,
  houseId: string,
): Promise<void> {
  if (!ownerId) {
    logger.warn('residentCapacity: house has no resolvable owner — allowing', {
      houseId,
    });
    return;
  }

  const owner = await getUser(ownerId);
  const meta = owner?.subscriptionMetadata;
  const maxResidents = meta?.maxResidents;

  if (!meta || maxResidents === undefined) {
    logger.warn('residentCapacity: unresolvable maxResidents for owner — allowing', {
      ownerId,
      houseId,
    });
    return;
  }
  if (maxResidents === null) {
    return; // unlimited tier
  }

  const houseIds = Object.keys(meta.houses ?? {});
  if (!houseIds.includes(houseId)) houseIds.push(houseId);

  const pending = await countPendingResidentInvites(houseIds);
  const current = totalResidents(meta) + pending;

  if (current + 1 > maxResidents) {
    logger.info('residentCapacity: blocked at plan limit', {
      ownerId,
      houseId,
      maxResidents,
    });
    throw new HttpsError(
      'failed-precondition',
      `This plan supports up to ${maxResidents} residents. Upgrade to add more.`,
    );
  }
}

/**
 * Persists the newly-accepted resident so future cap checks see it as an
 * occupied slot rather than (transiently) a pending invitation. Same
 * `numberOfGuests` counter and tier-only guard as updateSubscriptionGuests'
 * add branch, but it neither refuses nor checks the cap: the cap was checked
 * when the invitation was created and redeemed, and the redeem has happened.
 * A house missing from the owner's map is counted there all the same, which
 * takes a property slot, and logged at error for ops to reconcile:
 * assertResidentCapacityAvailable admits such a house, so leaving the resident
 * out would let every redeem past the cap. A house whose doc is gone (deleted
 * since the invitation) isn't brought back: onHouseDeleted freed its slot. No-op
 * for non-tier subscriptions and when the owner can't be resolved.
 */
export async function recordResidentAccepted(
  ownerId: string | undefined,
  houseId: string,
): Promise<void> {
  if (!ownerId) return;
  const owner = await getUser(ownerId);
  const meta = owner?.subscriptionMetadata;
  if (!meta?.tier) return;

  const houseExists = !!(await getHouse(houseId));
  // From the stored map, writing only it: see changeSubscriptionHouses.
  // Set in the transaction's callback, which may run more than once: the last run wins.
  let outcome = 'counted' as 'counted' | 'added' | 'deleted';
  await changeSubscriptionHouses(ownerId, (houses) => {
    if (houseId in houses) {
      outcome = 'counted';
    } else if (!houseExists) {
      outcome = 'deleted';
      return houses;
    } else {
      outcome = 'added';
    }
    return { ...houses, [houseId]: { numberOfGuests: (houses[houseId]?.numberOfGuests ?? 0) + 1 } };
  });
  if (outcome === 'added') {
    logger.error(
      'residentCapacity: accepted resident for a house not on the plan; it now takes a property slot there',
      { ownerId, houseId },
    );
  } else if (outcome === 'deleted') {
    logger.warn('residentCapacity: accepted resident for a deleted house; not counted', {
      ownerId,
      houseId,
    });
  }
}
