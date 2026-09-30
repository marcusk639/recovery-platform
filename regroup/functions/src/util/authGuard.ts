import { logger } from "firebase-functions";
import * as admin from "firebase-admin";
import { HttpsError } from "firebase-functions/v2/https";
import { enforceHouseEntitlement } from "./entitlement";

/**
 * Authorization guard for claim-granting Cloud Functions
 * (addAdminAuthorization, addGuestAuthorization).
 *
 * Each requested house must satisfy ONE of:
 *   (a) caller is the house owner (ownerId match) — covers the setup-wizard
 *       self-service path where an operator creates a house and claims admin/guest
 *       for themselves on it.
 *   (b) caller is an existing admin/superAdmin of the house AND the grant
 *       targets a DIFFERENT user (delegation) — covers an admin inviting a peer
 *       from inside the app.
 *
 * Throws HttpsError on first denial; logger.warn includes traceable identifiers.
 *
 * See .full-review/03-s2-cross-repo-audit.md for the threat model.
 */
export async function assertCanGrantClaimForHouses(params: {
  callerUid: string;
  callerToken: any;
  targetUid: string;
  houseIds: string[];
  callableName: string; // for log context, e.g. "addAdminAuthorization"
  /**
   * Also require the house to be entitled (paying). Set only on claim GRANTS.
   * Revocations must stay ungated: preventing an operator from removing
   * someone's access because billing lapsed is a safety problem, not a
   * monetisation lever.
   */
  enforceEntitlement?: boolean;
}): Promise<void> {
  const {
    callerUid,
    callerToken,
    targetUid,
    houseIds,
    callableName,
    enforceEntitlement = false,
  } = params;

  // De-dupe; an empty list means "no claims to grant" — callers should reject
  // before calling this guard. (Defense in depth — see addAdminAuthorization.)
  const uniqueHouses = [...new Set(houseIds)];
  if (uniqueHouses.length === 0) return;

  const houseSnaps = await Promise.all(
    uniqueHouses.map((id) =>
      admin.firestore().collection("houses").doc(id).get()
    )
  );

  for (let i = 0; i < uniqueHouses.length; i++) {
    const houseId = uniqueHouses[i];
    const snap = houseSnaps[i];
    if (!snap.exists) {
      throw new HttpsError("not-found", `House ${houseId} not found`);
    }
    const house = snap.data() as {
      ownerId?: string;
      subscriptionStatus?: string | null;
      guestGraceEndsAt?: string | null;
    };
    const isOwner = house.ownerId === callerUid;
    const callerIsExistingAdmin =
      callerToken?.admin?.[houseId] === true ||
      callerToken?.superAdmin?.[houseId] === true;
    const isDelegation = targetUid !== callerUid;
    const allowed = isOwner || (callerIsExistingAdmin && isDelegation);
    if (!allowed) {
      logger.warn(`${callableName}: denied`, {
        callerUid,
        targetUid,
        houseId,
      });
      throw new HttpsError(
        "permission-denied",
        `Not authorized to grant this claim for house ${houseId}`
      );
    }

    // Permission first, then entitlement: a caller who is not authorized for
    // this house should not learn anything about its subscription state.
    if (enforceEntitlement) {
      await enforceHouseEntitlement(house, houseId);
    }
  }
}
