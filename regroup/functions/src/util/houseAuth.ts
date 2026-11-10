import { HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { logger } from "firebase-functions";

/** Minimal house fields needed for admin/member authorization checks. */
export interface HouseAdminFields {
  adminId?: string;
  adminIds?: string[];
  superAdminIds?: string[];
  ownerId?: string;
}

/** Returns true if `uid` holds any admin or owner role on the house. */
export function isHouseAdmin(uid: string, house: HouseAdminFields): boolean {
  return (
    house.adminId === uid ||
    (house.adminIds ?? []).includes(uid) ||
    (house.superAdminIds ?? []).includes(uid) ||
    house.ownerId === uid
  );
}

/**
 * Throws `permission-denied` if `uid` is not an admin/owner of the house.
 *
 * @param message - Optional override for the error message shown to the client.
 */
export function assertHouseAdmin(
  uid: string,
  house: HouseAdminFields,
  message = "Only house admins can perform this action"
): void {
  if (!isHouseAdmin(uid, house)) {
    throw new HttpsError("permission-denied", message);
  }
}

/**
 * Returns true if `uid` is a member (admin/owner or registered guest) of the
 * given house. Admins and owners are resolved directly from the house doc
 * fields; guests are verified via a sub-collection query.
 */
export async function checkIsMember(
  uid: string,
  houseId: string,
  house: HouseAdminFields
): Promise<boolean> {
  if (isHouseAdmin(uid, house)) return true;

  const guestSnap = await admin
    .firestore()
    .collection("houses")
    .doc(houseId)
    .collection("guests")
    .where("userId", "==", uid)
    .limit(1)
    .get();

  return !guestSnap.empty;
}

/**
 * Asserts that the caller is a member (admin or guest) of the given house
 * by inspecting Firebase custom claims.
 *
 * Note: custom claims are cached on the token and may be up to 1 hour stale
 * after role changes. Use checkIsMember() for ground-truth checks.
 */
export function assertHouseMemberFromClaims(
  token: Record<string, unknown>,
  houseId: string
): void {
  const adminClaims = token.admin as Record<string, unknown> | undefined;
  const guestClaims = token.guest as Record<string, unknown> | undefined;
  const isAdmin = adminClaims != null && houseId in adminClaims;
  const isGuest = guestClaims != null && houseId in guestClaims;
  if (!isAdmin && !isGuest) {
    throw new HttpsError(
      "permission-denied",
      "Caller is not a member of this house"
    );
  }
}

/**
 * Takes a removed staff member out of the house docs' adminIds (admin houses)
 * and superAdminIds (super-admin houses). Those hold admins doc ids, not uids,
 * so the user's own doc ids are looked up here by uid; ids from the client are
 * never trusted. A house that no longer exists is skipped.
 */
export async function removeStaffFromHouses(
  uid: string,
  adminHouseIds: string[],
  superAdminHouseIds: string[],
): Promise<void> {
  const { arrayRemove } = admin.firestore.FieldValue;
  const adminDocs = await admin.firestore().collection("admins").where("userId", "==", uid).get();
  const docIds = adminDocs.docs.map((d) => d.id);
  if (docIds.length === 0) return;
  for (const houseId of new Set([...adminHouseIds, ...superAdminHouseIds])) {
    const update: Record<string, unknown> = {};
    if (adminHouseIds.includes(houseId)) update.adminIds = arrayRemove(...docIds);
    if (superAdminHouseIds.includes(houseId)) update.superAdminIds = arrayRemove(...docIds);
    try {
      await admin.firestore().collection("houses").doc(houseId).update(update);
    } catch (err) {
      const code = (err as { code?: unknown }).code;
      if (code === 5 || code === "not-found") {
        logger.warn("removeStaffFromHouses: house not found", { houseId });
        continue;
      }
      throw err;
    }
  }
}
