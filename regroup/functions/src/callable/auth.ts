import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { auth } from "firebase-admin";
import { z } from "zod";
import { Guest } from "../entities/Guest";
import { createClaims, deleteClaim } from "../util/claims";
import Admin from "../entities/Admin";
import { getGuestsAsUsers } from "../util/user";
import { Role } from "../entities/Roles";
import { _verifyUserEmail } from "../util/user";
import { parseInput } from "../validation";
import { assertCanGrantClaimForHouses } from "../util/authGuard";

// ── Schemas ────────────────────────────────────────────────────────────────────
const guestAuthSchema = z
  .object({
    userId: z.string().min(1),
    houseId: z.string().min(1),
    isAdmin: z.boolean().optional(),
  })
  .passthrough();

const adminAuthSchema = z
  .object({
    userId: z.string().min(1),
    houseIds: z.array(z.string()),
    superAdmin: z.array(z.string()),
  })
  .passthrough();

const deleteAdminSchema = z.object({
  admin: z.object({ userId: z.string().min(1) }).passthrough(),
  adminHouseIds: z.array(z.string()),
  superAdminHouseIds: z.array(z.string()),
});

const guestMinSchema = z
  .object({
    userId: z.string().min(1),
    houseId: z.string().min(1),
  })
  .passthrough();

const removePrivilegesSchema = z.object({
  guests: z.array(guestMinSchema),
  role: z.enum(["admin", "superAdmin", "guest", "supporter"]),
});

const verifyEmailSchema = z.object({ userId: z.string().min(1) });

export const addGuestAuthorization = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Login required");
  const guest = parseInput(guestAuthSchema, request.data) as unknown as Guest;
  logger.info("Adding authorization for guest", {
    userId: guest.userId,
    houseId: guest.houseId,
  });

  // ── Authorization guard ────────────────────────────────────────────────────
  // A caller may only grant guest claims for a house when:
  //   1. The caller is the owner of that house (e.g. setup-wizard self-grant), OR
  //   2. The caller is an admin/superAdmin of that house AND is delegating to a
  //      different user (guest.userId !== callerUid).
  // The schema requires houseId.min(1), so the array below is always non-empty.
  await assertCanGrantClaimForHouses({
    callerUid: request.auth.uid,
    callerToken: request.auth.token,
    targetUid: guest.userId,
    houseIds: [guest.houseId],
    callableName: "addGuestAuthorization",
    enforceEntitlement: true,
  });

  try {
    let userClaims = await createClaims(guest.userId, [guest.houseId], "guest");
    await auth().setCustomUserClaims(guest.userId, userClaims);
    if (guest.isAdmin) {
      userClaims = await createClaims(
        guest.userId,
        [guest.houseId],
        "admin",
        false,
      );
      await auth().setCustomUserClaims(guest.userId, userClaims);
    }
    logger.info("Claims created for guest", userClaims);
    return true;
  } catch (error) {
    logger.error("addGuestAuthorization: failed to set claims", { error });
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", "Failed to update user authorization");
  }
});

export const addAdminAuthorization = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Login required");
  const adminInput = parseInput(
    adminAuthSchema,
    request.data,
  ) as unknown as Admin;
  logger.info("Adding claim for admin and houses", {
    userId: adminInput.userId,
    houseIds: adminInput.houseIds,
    superAdmin: adminInput.superAdmin,
  });

  // ── Authorization guard ────────────────────────────────────────────────────
  // A caller may only grant admin claims for a house when:
  //   1. The caller is the owner of that house (e.g. setup-wizard self-grant), OR
  //   2. The caller is already an admin/superAdmin of that house AND is
  //      delegating to a different user (adminInput.userId !== callerUid).
  // Self-grants of houses you already admin are denied — no legitimate use case.
  const callerUid = request.auth.uid;
  const requestedHouses = [
    ...new Set([
      ...(adminInput.houseIds || []),
      ...(adminInput.superAdmin || []),
    ]),
  ];

  // Defense-in-depth: reject no-op calls. An empty payload still reaches
  // setCustomUserClaims below, which would reset potentialSuperAdmin to false.
  if (requestedHouses.length === 0) {
    throw new HttpsError(
      "invalid-argument",
      "addAdminAuthorization requires at least one houseId or superAdmin entry",
    );
  }

  await assertCanGrantClaimForHouses({
    callerUid,
    callerToken: request.auth.token,
    targetUid: adminInput.userId,
    houseIds: requestedHouses,
    callableName: "addAdminAuthorization",
    enforceEntitlement: true,
  });

  try {
    const [userClaims, superAdminClaims] = await Promise.all([
      createClaims(adminInput.userId, adminInput.houseIds, "admin", false),
      createClaims(
        adminInput.userId,
        adminInput.superAdmin,
        "superAdmin",
        false,
      ),
    ]);
    logger.info("Creating claims", userClaims, superAdminClaims);
    await auth().setCustomUserClaims(adminInput.userId, {
      ...userClaims,
      ...superAdminClaims,
    });
    return true;
  } catch (error) {
    logger.error("addAdminAuthorization: failed to set claims", { error });
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", "Failed to update admin authorization");
  }
});

export const deleteAdminAuthorization = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Login required");
  const data = parseInput(deleteAdminSchema, request.data) as unknown as {
    admin: Admin;
    adminHouseIds: string[];
    superAdminHouseIds: string[];
  };
  const { admin, adminHouseIds, superAdminHouseIds } = data;
  const allHouseIds = [...(adminHouseIds ?? []), ...(superAdminHouseIds ?? [])];
  if (allHouseIds.length === 0) {
    throw new HttpsError(
      "invalid-argument",
      "deleteAdminAuthorization requires at least one houseId",
    );
  }
  await assertCanGrantClaimForHouses({
    callerUid: request.auth.uid,
    callerToken: request.auth.token,
    targetUid: admin.userId,
    houseIds: allHouseIds,
    callableName: "deleteAdminAuthorization",
  });
  if (adminHouseIds?.length) {
    const userClaims = await deleteClaim(admin.userId, adminHouseIds, "admin");
    await auth().setCustomUserClaims(admin.userId, { ...userClaims });
  }
  if (superAdminHouseIds?.length) {
    const superAdminClaims = await deleteClaim(
      admin.userId,
      superAdminHouseIds,
      "superAdmin",
    );
    await auth().setCustomUserClaims(admin.userId, { ...superAdminClaims });
  }
});

export const promoteGuestsToAdmin = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Login required");
  const data = parseInput(
    z.array(guestMinSchema),
    request.data,
  ) as unknown as Guest[];
  if (data.length === 0) return "success";
  // Authorize each target user against the specific house(s) being modified for
  // that user. Passing the caller's own uid as the target would collapse the
  // delegation branch in the guard, trivially self-authorizing a bulk op the
  // caller is not actually an admin/owner of the affected houses for.
  const housesByTarget = new Map<string, Set<string>>();
  for (const guest of data) {
    const houses = housesByTarget.get(guest.userId) ?? new Set<string>();
    houses.add(guest.houseId);
    housesByTarget.set(guest.userId, houses);
  }
  await Promise.all(
    [...housesByTarget.entries()].map(([targetUid, houses]) =>
      assertCanGrantClaimForHouses({
        callerUid: request.auth!.uid,
        callerToken: request.auth!.token,
        targetUid,
        houseIds: [...houses],
        callableName: "promoteGuestsToAdmin",
        enforceEntitlement: true,
      }),
    ),
  );
  const users = await getGuestsAsUsers(data);
  await Promise.all(
    users.map(async (user) => {
      const guest = data.find((g) => g.userId === user.uid)!;
      const claims = await createClaims(
        user.uid,
        [guest.houseId],
        "admin",
        false,
      );
      return auth().setCustomUserClaims(user.uid, claims);
    }),
  );
  return "success";
});

export const removePrivilegesForGuests = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Login required");
  const data = parseInput(removePrivilegesSchema, request.data) as unknown as {
    guests: Guest[];
    role: Role;
  };
  if (data.guests.length === 0) return "success";
  // Authorize each target user against the specific house(s) being modified for
  // that user. Passing the caller's own uid as the target would collapse the
  // delegation branch in the guard, trivially self-authorizing a bulk op the
  // caller is not actually an admin/owner of the affected houses for.
  const housesByTarget = new Map<string, Set<string>>();
  for (const guest of data.guests) {
    const houses = housesByTarget.get(guest.userId) ?? new Set<string>();
    houses.add(guest.houseId);
    housesByTarget.set(guest.userId, houses);
  }
  await Promise.all(
    [...housesByTarget.entries()].map(([targetUid, houses]) =>
      assertCanGrantClaimForHouses({
        callerUid: request.auth!.uid,
        callerToken: request.auth!.token,
        targetUid,
        houseIds: [...houses],
        callableName: "removePrivilegesForGuests",
      }),
    ),
  );
  const users = await getGuestsAsUsers(data.guests);
  await Promise.all(
    users.map(async (user) => {
      const guest = data.guests.find((g) => g.userId === user.uid)!;
      const claims = await deleteClaim(
        user.uid,
        [guest.houseId],
        data.role,
        false,
      );
      return auth().setCustomUserClaims(user.uid, claims);
    }),
  );
  return "success";
});

export const verifyUserEmail = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Login required");
  const data = parseInput(verifyEmailSchema, request.data) as {
    userId: string;
  };
  // Ownership: a caller may only verify their own email. Without this guard any
  // authenticated user could mark any account's email as verified.
  if (data.userId !== request.auth.uid) {
    throw new HttpsError(
      "permission-denied",
      "You can only verify your own email address",
    );
  }
  return _verifyUserEmail(data.userId);
});

export const givePotentialSuperAdminPrivilege = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Login required");

  // Check 1: token-based (fast, catches most cases)
  const token = request.auth.token as Record<string, unknown>;
  const tokenHasAdmin =
    token.admin && Object.keys(token.admin as object).length > 0;
  const tokenHasSuperAdmin =
    token.superAdmin && Object.keys(token.superAdmin as object).length > 0;

  if (tokenHasAdmin || tokenHasSuperAdmin) {
    throw new HttpsError(
      "permission-denied",
      "givePotentialSuperAdminPrivilege is only available to users with no existing house claims",
    );
  }

  // Check 2: live record (catches stale tokens whose claims were revoked within
  // the last hour but whose JWT is still valid)
  const user = await auth().getUser(request.auth.uid);
  const liveClaims = (user.customClaims ?? {}) as Record<string, unknown>;
  const liveHasAdmin =
    liveClaims.admin && Object.keys(liveClaims.admin as object).length > 0;
  const liveHasSuperAdmin =
    liveClaims.superAdmin &&
    Object.keys(liveClaims.superAdmin as object).length > 0;

  if (liveHasAdmin || liveHasSuperAdmin) {
    throw new HttpsError(
      "permission-denied",
      "givePotentialSuperAdminPrivilege is only available to users with no existing house claims",
    );
  }

  return auth().setCustomUserClaims(request.auth.uid, {
    ...liveClaims,
    potentialSuperAdmin: true,
  });
});
