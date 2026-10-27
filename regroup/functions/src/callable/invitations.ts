import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { parseInput } from '../validation';
import { generateInvitationToken } from '../util/tokens';
import { sendOneInviteEmail } from '../util/inviteEmails';
import { addHouseRoles } from '../util/claims';
import {
  assertResidentCapacityAvailable,
  recordResidentAccepted,
  roleConsumesResidentSlot,
} from '../util/residentCapacity';
import { getHouse } from '../api/firestore';
import { completeGrant, consumeInvitation, releaseInvitation } from '../util/admission';
import { assertTierMayGrant, houseTierOf, INVITATION_TIER, isPrimaryOwner } from '../util/houseRoles';
import { assertInviteeMayBeInvited, assertInviterStillMayIssue } from '../util/invitationChecks';
import { enforceHouseEntitlement } from '../util/entitlement';
import { Invitation, InvitationRole } from '../entities/Invitation';

/**
 * Fetches an invitation by token, throwing a `not-found` HttpsError when the
 * doc does not exist. Shared by peekInvitation + redeemInvitation.
 */
async function fetchInvitationByToken(token: string): Promise<Invitation> {
  const snap = await admin.firestore().collection('invitations').doc(token).get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Invitation not found');
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
    throw new HttpsError('failed-precondition', 'Invitation already redeemed');
  }
  if (new Date(inv.expiresAt).getTime() < Date.now()) {
    throw new HttpsError('failed-precondition', 'Invitation has expired');
  }
}

/**
 * Single source of truth for invitation roles. Task 5 (redeemInvitation) and
 * any downstream callers reference this same constant. Typed as a non-empty
 * readonly tuple so `z.enum(ROLES)` accepts it directly (no cast needed).
 */
export const ROLES = ['admin', 'guest', 'senior-peer'] as const satisfies readonly [
  InvitationRole,
  ...InvitationRole[],
];

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
    throw new HttpsError('unauthenticated', 'Login required');
  }
  const input = parseInput(createInvitationSchema, request.data);

  // ── Authorization: caller must be owner or existing admin/superAdmin ──
  const houseSnap = await admin.firestore().collection('houses').doc(input.houseId).get();
  if (!houseSnap.exists) {
    throw new HttpsError('not-found', 'House not found');
  }
  const house = houseSnap.data() as {
    ownerId?: string;
    houseType?: string;
    subscriptionStatus?: string | null;
    guestGraceEndsAt?: string | null;
  };
  const callerUid = request.auth.uid;
  const callerClaims = (request.auth.token ?? {}) as {
    admin?: Record<string, boolean>;
    superAdmin?: Record<string, boolean>;
  };
  const isOwner = await isPrimaryOwner(input.houseId, callerUid);
  const isAdmin = callerClaims.admin?.[input.houseId] === true;
  const isSuperAdmin = callerClaims.superAdmin?.[input.houseId] === true;
  if (!isOwner && !isAdmin && !isSuperAdmin) {
    logger.warn('createInvitation: denied', {
      callerUid,
      houseId: input.houseId,
    });
    throw new HttpsError(
      'permission-denied',
      'Only the house owner or an existing admin can send invitations',
    );
  }

  // Tiers (util/houseRoles, from the server-only role record): the owner may
  // invite a manager, peer leader or resident; a manager a peer leader or
  // resident; a peer leader a resident only. Oxford houses too, until the
  // Oxford admission PR.
  // Live claims (houseTierOf), so a just-revoked staff token cannot act.
  const tier = await houseTierOf(callerUid, input.houseId);
  assertTierMayGrant(tier, INVITATION_TIER[input.role], {
    callableName: 'createInvitation',
    houseId: input.houseId,
  });
  // No self-invites; nobody who already lives here (util/invitationChecks).
  await assertInviteeMayBeInvited({
    callerUid,
    callerEmail: request.auth.token?.email,
    invitedEmail: input.email,
    houseId: input.houseId,
  });

  // Onboarding new people is product usage. Redeeming an already-sent
  // invitation stays ungated so an invitee mid-flow is not stranded by the
  // operator lapsing after the invite went out.
  await enforceHouseEntitlement(house, input.houseId);

  // ── Resident capacity: guest/senior-peer invitations consume a slot on
  // the operator's subscription. Counts existing residents + outstanding
  // pending invitations so an operator can't bypass the cap by sending many
  // invitations at once and having them all accepted. Admin invitations
  // grant house-staff access, not a resident/guest claim, so they're exempt.
  if (roleConsumesResidentSlot(input.role)) {
    await assertResidentCapacityAvailable(house.ownerId, input.houseId);
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
  await admin.firestore().collection('invitations').doc(token).set(invitation);

  // ── Send the email via the extracted helper ──────────────────────────
  const link = buildInviteLink(token);
  // role string for the email template: 'admin' | 'guest' (senior-peer
  // is templated as 'guest' for the recipient — they see the same email).
  const emailRole = input.role === 'senior-peer' ? 'guest' : input.role;
  await sendOneInviteEmail({
    toEmail: input.email,
    inviteLink: link,
    role: emailRole,
  });

  logger.info('createInvitation: issued', {
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
 * Role mapping, set in ONE claims write (addHouseRoles), with the tier
 * recorded in house-roles (util/houseRoles):
 *  - role=guest        → guest claim; resident
 *  - role=admin        → admin claim; manager
 *  - role=senior-peer  → guest AND admin claims; peer leader
 * A repeat call by the account that redeemed it succeeds and grants nothing
 * once the grant completed (grantCompletedAt); a stranded redeem (grant and
 * release both failed) is completed while the invitation is unexpired
 * (+24h). util/admission consumeInvitation / completeGrant.
 */
export const redeemInvitation = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Login required');
  }
  const { token } = parseInput(redeemInvitationSchema, request.data);
  const callerUid = request.auth.uid;
  const callerEmail = ((request.auth.token?.email as string | undefined) ?? '').toLowerCase();

  const inv = await fetchInvitationByToken(token);
  const meta = inv as { redeemedByUid?: string; grantPending?: boolean; grantCompletedAt?: string };
  const retry = !!inv.redeemedAt && meta.redeemedByUid === callerUid;
  if (!retry) assertInvitationUsable(inv);
  // A completed retry grants nothing (util/admission ConsumeState).
  const willGrant = !retry || (!meta.grantCompletedAt && meta.grantPending === true);

  // Not checked: email_verified (see "Future consideration" in regroup/functions/CLAUDE.md).
  if (inv.invitedEmail.toLowerCase() !== callerEmail) {
    logger.warn('redeemInvitation: email mismatch', { callerUid });
    throw new HttpsError('permission-denied', 'Invitation was issued to a different email address');
  }

  // ── Resident capacity re-check: the invitation may have been created
  // before a downgrade, or may be racing another acceptance for the same
  // house. Re-derive the owner from the house doc — inv.inviterUid may be
  // an admin, not necessarily the billing owner who holds the subscription.
  let residentOwnerId: string | undefined;
  // The inviter must still be able to issue this role (live tier).
  if (willGrant) await assertInviterStillMayIssue(inv);
  if (willGrant && roleConsumesResidentSlot(inv.role)) {
    const house = await getHouse(inv.houseId);
    residentOwnerId = house?.ownerId;
    await assertResidentCapacityAvailable(residentOwnerId, inv.houseId);
  }

  // Consume the invitation first, in a transaction, so of two concurrent
  // redeems of one token only one can go on to grant claims. For a resident
  // role the same commit writes the caller's admission ticket, which the
  // guests self-create rule requires (util/admission).
  const { state } = await consumeInvitation(token, callerUid);

  // A completed grant is never repeated: a role revoked since then stays
  // revoked, however old the token (util/admission ConsumeState).
  if (state === 'completed') {
    logger.info('redeemInvitation: already completed for this account; nothing granted', {
      houseId: inv.houseId,
    });
    return { houseId: inv.houseId, role: inv.role };
  }

  // One claims write: a senior-peer gets guest and admin together or not at
  // all. If it fails, the redemption and ticket are released so the invitee
  // can retry.
  const roles: Array<'guest' | 'admin'> =
    inv.role === 'senior-peer' ? ['guest', 'admin'] : inv.role === 'admin' ? ['admin'] : ['guest'];
  try {
    await addHouseRoles(callerUid, [inv.houseId], roles);
  } catch (err) {
    if (state === 'fresh') await releaseInvitation(token, callerUid, inv.houseId);
    throw err;
  }
  await completeGrant(token, inv, callerUid, INVITATION_TIER[inv.role]);

  if (roleConsumesResidentSlot(inv.role)) {
    // Best-effort: the claim grant + invitation redemption above already
    // succeeded, so a failure here must not fail the whole call — it would
    // incorrectly report the redemption as failed after access was already
    // granted. Occupancy tracking is a cap-enforcement input, not the
    // privilege boundary.
    try {
      await recordResidentAccepted(residentOwnerId, inv.houseId);
    } catch {
      logger.warn('redeemInvitation: failed to record resident occupancy', {
        houseId: inv.houseId,
      });
    }
  }

  logger.info('redeemInvitation: success', {
    callerUid,
    houseId: inv.houseId,
    role: inv.role,
  });
  return { houseId: inv.houseId, role: inv.role };
});
