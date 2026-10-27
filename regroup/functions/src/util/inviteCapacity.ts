/**
 * Resident capacity for invitations (callable/invitations). Guest and
 * senior-peer invitations consume a slot on the subscription of the house's
 * PRIMARY OWNER (the primary house-roles record, util/houseRoles; never
 * houses.ownerId, which a superAdmin could rewrite before the rules deploy).
 * Admin invitations grant staff access, not a resident slot.
 */
import { logger } from 'firebase-functions';
import { HttpsError } from 'firebase-functions/v2/https';
import { InvitationRole } from '../entities/Invitation';
import { primaryOwnerUid } from './houseRoles';
import {
  assertResidentCapacityAvailable,
  recordResidentAccepted,
  roleConsumesResidentSlot,
} from './residentCapacity';

/** Throws if the role takes a slot and none is free; returns the subscription holder. */
export async function assertSlotForRole(
  houseId: string,
  role: InvitationRole,
): Promise<string | undefined> {
  if (!roleConsumesResidentSlot(role)) return undefined;
  const owner = await primaryOwnerUid(houseId);
  if (!owner) {
    // Fail closed: with no primary owner record there is no subscription to
    // charge the slot to (the backfill lists such houses for the owner).
    logger.warn('invitations: house has no owner record', { houseId });
    throw new HttpsError('failed-precondition', 'house has no owner record');
  }
  await assertResidentCapacityAvailable(owner, houseId);
  return owner;
}

/**
 * Records the accepted resident against the subscription. Best-effort: the
 * grant already succeeded, so a failure must not report the redeem as
 * failed. Occupancy is a cap-enforcement input, not the privilege boundary.
 */
export async function recordSlotTaken(
  owner: string | undefined,
  houseId: string,
  role: InvitationRole,
): Promise<void> {
  if (!roleConsumesResidentSlot(role)) return;
  try {
    await recordResidentAccepted(owner, houseId);
  } catch {
    logger.warn('redeemInvitation: failed to record resident occupancy', { houseId });
  }
}
