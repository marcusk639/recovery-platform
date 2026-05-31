import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import * as admin from "firebase-admin";
import { auth } from "firebase-admin";
import { z } from "zod";
import { parseInput } from "../validation";
import { generateInvitationToken } from "../util/tokens";
import { sendOneInviteEmail } from "../util/inviteEmails";
import { createClaims } from "../util/claims";
import { Invitation, InvitationRole } from "../entities/Invitation";

/**
 * Fetches an invitation by token, throwing a `not-found` HttpsError when the
 * doc does not exist. Shared by peekInvitation + redeemInvitation.
 */
async function fetchInvitationByToken(token: string): Promise<Invitation> {
  const snap = await admin
    .firestore()
    .collection("invitations")
    .doc(token)
    .get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "Invitation not found");
  }
  return snap.data() as Invitation;
}

/**
 * Throws `failed-precondition` HttpsError when the invitation has already been
 * redeemed or has expired. Shared by peekInvitation + redeemInvitation so the
 * two CFs cannot drift on what "usable" means.
 */
function assertInvitationUsable(inv: Invitation): void {
  if (inv.redeemedAt) {
    throw new HttpsError("failed-precondition", "Invitation already redeemed");
  }
  if (new Date(inv.expiresAt).getTime() < Date.now()) {
    throw new HttpsError("failed-precondition", "Invitation has expired");
  }
}

/**
 * Single source of truth for invitation roles. Task 5 (redeemInvitation) and
 * any downstream callers reference this same constant. Typed as a non-empty
 * readonly tuple so `z.enum(ROLES)` accepts it directly (no cast needed).
 */
export const ROLES = [
  "admin",
  "guest",
  "senior-peer",
] as const satisfies readonly [InvitationRole, ...InvitationRole[]];

const createInvitationSchema = z.object({
  email: z.string().email(),
  houseId: z.string().min(1),
  role: z.enum(ROLES),
  initialPhase: z.string().optional(),
});

/**
 * Token TTL — 7 days from creation. Matches the prior client-side
 * `expirationDate` value at src/services/native-deep-links.ts:119 so the
 * UX is unchanged.
 */
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Build the invitation link the recipient will tap. The mobile parser at
 * src/services/native-deep-links.ts treats `?token=<...>` as the new
 * server-issued format.
 */
function buildInviteLink(token: string): string {
  return `regroup-app://?type=invitation&token=${encodeURIComponent(token)}`;
}

export const createInvitation = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Login required");
  }
  const input = parseInput(createInvitationSchema, request.data);

  // ── Authorization: caller must be owner or existing admin/superAdmin ──
  const houseSnap = await admin
    .firestore()
    .collection("houses")
    .doc(input.houseId)
    .get();
  if (!houseSnap.exists) {
    throw new HttpsError("not-found", "House not found");
  }
  const house = houseSnap.data() as { ownerId?: string };
  const callerUid = request.auth.uid;
  const callerClaims = (request.auth.token ?? {}) as {
    admin?: Record<string, boolean>;
    superAdmin?: Record<string, boolean>;
  };
  const isOwner = house.ownerId === callerUid;
  const isAdmin = callerClaims.admin?.[input.houseId] === true;
  const isSuperAdmin = callerClaims.superAdmin?.[input.houseId] === true;
  if (!isOwner && !isAdmin && !isSuperAdmin) {
    logger.warn("createInvitation: denied", {
      callerUid,
      houseId: input.houseId,
    });
    throw new HttpsError(
      "permission-denied",
      "Only the house owner or an existing admin can send invitations"
    );
  }

  // ── Build + write the invitation doc ─────────────────────────────────
  const token = generateInvitationToken();
  const now = new Date();
  const invitation: Invitation = {
    token,
    inviterUid: callerUid,
    houseId: input.houseId,
    role: input.role,
    invitedEmail: input.email.toLowerCase(),
    expiresAt: new Date(now.getTime() + TOKEN_TTL_MS).toISOString(),
    createdAt: now.toISOString(),
    ...(input.initialPhase !== undefined && {
      initialPhase: input.initialPhase,
    }),
  };
  await admin.firestore().collection("invitations").doc(token).set(invitation);

  // ── Send the email via the extracted helper ──────────────────────────
  const link = buildInviteLink(token);
  // role string for the email template: 'admin' | 'guest' (senior-peer
  // is templated as 'guest' for the recipient — they see the same email).
  const emailRole = input.role === "senior-peer" ? "guest" : input.role;
  await sendOneInviteEmail({
    toEmail: input.email,
    inviteLink: link,
    role: emailRole,
  });

  logger.info("createInvitation: issued", {
    callerUid,
    houseId: input.houseId,
    role: input.role,
  });
  return { token };
});

const peekInvitationSchema = z.object({ token: z.string().min(1) });

/**
 * Returns the metadata needed by SignUpForm to pre-fill the email and
 * branch on role. The token is the credential (anyone with it can call).
 * We still reject expired / redeemed tokens here so the UI can show the
 * correct error state before the user finishes signup.
 */
export const peekInvitation = onCall(async (request) => {
  const { token } = parseInput(peekInvitationSchema, request.data);
  const inv = await fetchInvitationByToken(token);
  assertInvitationUsable(inv);
  return {
    houseId: inv.houseId,
    role: inv.role,
    invitedEmail: inv.invitedEmail,
    initialPhase: inv.initialPhase,
    expiresAt: inv.expiresAt,
  };
});

const redeemInvitationSchema = z.object({ token: z.string().min(1) });

/**
 * Server-issued claim grant. The mobile client calls this after the user
 * authenticates (or signs up) with the invited email. The Cloud Function is
 * the only path that can write `admin` / `guest` custom claims, so this is
 * the privilege boundary — every gate below MUST hold before claims are set.
 *
 * Gates:
 *  - caller is authenticated
 *  - invitation exists
 *  - invitation has not been redeemed
 *  - invitation has not expired
 *  - caller's email (case-insensitive) matches `invitedEmail` on the doc
 *
 * Role mapping mirrors the legacy `addGuestAuthorization` flow:
 *  - role=guest        → guest claim for the house
 *  - role=admin        → admin claim for the house
 *  - role=senior-peer  → BOTH guest and admin claims (two createClaims calls,
 *                        two setCustomUserClaims calls, layered)
 */
export const redeemInvitation = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Login required");
  }
  const { token } = parseInput(redeemInvitationSchema, request.data);
  const callerUid = request.auth.uid;
  const callerEmail = (
    (request.auth.token?.email as string | undefined) ?? ""
  ).toLowerCase();

  const inv = await fetchInvitationByToken(token);
  assertInvitationUsable(inv);

  if (inv.invitedEmail.toLowerCase() !== callerEmail) {
    logger.warn("redeemInvitation: email mismatch", {
      callerUid,
      invitedEmail: inv.invitedEmail,
      callerEmail,
    });
    throw new HttpsError(
      "permission-denied",
      "Invitation was issued to a different email address"
    );
  }

  // Map role → claims. createClaims is the canonical merger; we call it
  // once for guest+senior-peer and a second time to layer admin on top
  // of senior-peer. Mirrors addGuestAuthorization at callable/auth.ts:50-72.
  if (inv.role === "guest" || inv.role === "senior-peer") {
    const claims = await createClaims(callerUid, [inv.houseId], "guest", false);
    await auth().setCustomUserClaims(callerUid, claims);
  }
  if (inv.role === "admin" || inv.role === "senior-peer") {
    const claims = await createClaims(callerUid, [inv.houseId], "admin", false);
    await auth().setCustomUserClaims(callerUid, claims);
  }

  const invitationRef = admin.firestore().collection("invitations").doc(token);
  await invitationRef.update({
    redeemedAt: new Date().toISOString(),
    redeemedByUid: callerUid,
  });

  logger.info("redeemInvitation: success", {
    callerUid,
    houseId: inv.houseId,
    role: inv.role,
  });
  return { houseId: inv.houseId, role: inv.role };
});
