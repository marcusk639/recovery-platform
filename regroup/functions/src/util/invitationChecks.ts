/**
 * Checks around invitations (callable/invitations): who may be invited, and
 * whether an invitation is still backed by its inviter when it is redeemed.
 */
import * as admin from 'firebase-admin';
import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { Invitation, InvitationRole } from '../entities/Invitation';
import { entitlingDocs } from './admission';
import { isActiveGuestDoc } from './guestMembership';
import { houseTierOf, INVITATION_TIER, MAY_GRANT_TIERS } from './houseRoles';

export const normalizeEmail = (e: unknown): string =>
  typeof e === 'string' ? e.trim().toLowerCase() : '';

/**
 * Refuses an invitation to the inviter's own email (a staff member inviting
 * themselves as a resident to mint a second, eviction-proof record), and a
 * guest invitation to an account that already has an active entitling
 * resident record in the house. Ids only in logs.
 */
export async function assertInviteeMayBeInvited(params: {
  callerUid: string;
  callerEmail: unknown;
  invitedEmail: string;
  houseId: string;
  role: InvitationRole;
}): Promise<void> {
  const invited = normalizeEmail(params.invitedEmail);
  if (invited && invited === normalizeEmail(params.callerEmail)) {
    logger.warn('createInvitation: self-invite refused', { houseId: params.houseId });
    throw new HttpsError('failed-precondition', 'You cannot invite yourself');
  }
  let uid: string | undefined;
  try {
    uid = (await admin.auth().getUserByEmail(invited)).uid;
  } catch (err) {
    if ((err as { code?: string }).code === 'auth/user-not-found') return;
    throw err;
  }
  if (uid === params.callerUid) {
    throw new HttpsError('failed-precondition', 'You cannot invite yourself');
  }
  // A staff invitation (admin, senior-peer) may go to someone who already
  // lives here: it is how the owner promotes a resident manager (the tier
  // check above still applies).
  if (params.role !== 'guest') return;
  if (await livesIn(uid, params.houseId)) {
    logger.warn('createInvitation: invitee already lives in the house', {
      houseId: params.houseId,
    });
    throw new HttpsError('failed-precondition', 'This person already lives in this house');
  }
}

/**
 * At redeem time the inviter must still rank high enough to issue the
 * invitation's role, by their LIVE tier (util/houseRoles): a manager demoted
 * after sending an admin or senior-peer invitation cannot have it honoured.
 */
export async function assertInviterStillMayIssue(inv: Invitation): Promise<void> {
  const tier = await houseTierOf(inv.inviterUid, inv.houseId);
  if (MAY_GRANT_TIERS(tier).includes(INVITATION_TIER[inv.role])) return;
  logger.warn('redeemInvitation: inviter may no longer issue this role', {
    houseId: inv.houseId,
    tier,
    role: inv.role,
  });
  throw new HttpsError(
    'failed-precondition',
    'This invitation is no longer valid: the person who sent it can no longer grant this role. Ask for a new invitation.',
  );
}

/** An account's active entitling resident records in the house (util/admission). */
async function livesIn(uid: string, houseId: string): Promise<boolean> {
  const snap = await admin.firestore().collection('guests').where('userId', '==', uid).get();
  const active = snap.docs.filter(
    (d) => (d.data() ?? {}).houseId === houseId && isActiveGuestDoc(d.data() ?? {}),
  );
  return (await entitlingDocs(uid, houseId, active)).length > 0;
}

/**
 * At redeem: the inviter never redeems their own invitation, and a guest or
 * senior-peer invitation is refused to an account that already lives in
 * the house (no second resident record).
 */
export async function assertRedeemerMayAccept(inv: Invitation, callerUid: string): Promise<void> {
  if (callerUid === inv.inviterUid) {
    logger.warn('redeemInvitation: inviter redeeming own invitation refused', {
      houseId: inv.houseId,
    });
    throw new HttpsError('failed-precondition', 'You cannot accept an invitation you sent');
  }
  if (inv.role !== 'admin' && (await livesIn(callerUid, inv.houseId))) {
    logger.warn('redeemInvitation: already lives in the house', { houseId: inv.houseId });
    throw new HttpsError('failed-precondition', 'You already have a resident record in this house');
  }
}
