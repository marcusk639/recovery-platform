import { logger } from 'firebase-functions';
import { HttpsError } from 'firebase-functions/v2/https';
import { getUser, getInvitationsForHouse, updateUser } from '../api/firestore';
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
 * occupied slot rather than (transiently) a pending invitation. Mirrors the
 * "add" branch of updateSubscriptionGuests (callable/subscriptions.ts) —
 * same `numberOfGuests` counter, same tier-only guard. No-op for legacy
 * (non-tier) subscriptions, which track occupancy via Stripe item quantity
 * instead, and a no-op when the owner can't be resolved.
 */
export async function recordResidentAccepted(
  ownerId: string | undefined,
  houseId: string,
): Promise<void> {
  if (!ownerId) return;
  const owner = await getUser(ownerId);
  const meta = owner?.subscriptionMetadata;
  if (!meta?.tier) return;

  const houses = meta.houses ?? {};
  const current = houses[houseId]?.numberOfGuests ?? 0;
  await updateUser(ownerId, {
    subscriptionMetadata: {
      ...meta,
      houses: { ...houses, [houseId]: { numberOfGuests: current + 1 } },
      lastUpdatedAt: new Date().toISOString(),
    } as unknown as OperatorSubscription,
  });
}
