/**
 * Admission tickets: the server-side proof that a resident record a client
 * creates for itself has an invitation behind it (owner rule: a resident
 * never adds themselves to a house).
 *
 *   admission-tickets/{uid}_{houseId}
 *     { invitationId, role, initialPhase, used, createdAt, expiresAt, ... }
 *
 * No client rule matches the path, so only the Admin SDK reads or writes it.
 * redeemInvitation writes one in the same transaction that consumes the
 * invitation; the guests self-create rule requires an unused, unexpired
 * ticket for the caller and the house; onGuestWrite marks it used on the
 * first guest doc created for that account in that house.
 */
import * as admin from 'firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { Invitation } from '../entities/Invitation';

/** Same lifetime as an invitation token. */
export const TICKET_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const db = () => admin.firestore();
export const ticketId = (uid: string, houseId: string) => `${uid}_${houseId}`;
export const ticketRef = (uid: string, houseId: string) =>
  db().collection('admission-tickets').doc(ticketId(uid, houseId));

/** Roles whose redemption lets the invitee create their own resident record. */
const SELF_CREATE_ROLES = new Set(['guest', 'senior-peer']);

/**
 * Consumes the invitation for this caller, atomically: only one redeem of a
 * token can succeed, however many race. Re-checks the invitation inside the
 * transaction (not redeemed, not expired) and, for resident roles, writes
 * the caller's admission ticket in the same commit.
 */
export async function consumeInvitation(
  token: string,
  uid: string,
  nowMs = Date.now(),
): Promise<Invitation> {
  const invRef = db().collection('invitations').doc(token);
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(invRef);
    if (!snap.exists) throw new HttpsError('not-found', 'Invitation not found');
    const inv = snap.data() as Invitation;
    if (inv.redeemedAt) throw new HttpsError('failed-precondition', 'Invitation already redeemed');
    if (new Date(inv.expiresAt).getTime() < nowMs) {
      throw new HttpsError('failed-precondition', 'Invitation has expired');
    }
    tx.update(invRef, { redeemedAt: new Date(nowMs).toISOString(), redeemedByUid: uid });
    if (SELF_CREATE_ROLES.has(inv.role)) {
      tx.set(ticketRef(uid, inv.houseId), {
        invitationId: token,
        role: inv.role,
        // The app sends phase = the invitation's initialPhase, or "" when it
        // has none (SignUp.tsx peek: initialPhase ?? ""); the rule compares.
        initialPhase: inv.initialPhase ?? '',
        used: false,
        createdAt: Timestamp.fromMillis(nowMs),
        expiresAt: Timestamp.fromMillis(nowMs + TICKET_TTL_MS),
      });
    }
    return inv;
  });
}

/**
 * Undoes consumeInvitation when the claim grant that follows it fails, so
 * the invitee can retry: clears the redemption (only if it is still this
 * caller's) and deletes the ticket if it is unused. Never throws; logs ids.
 */
export async function releaseInvitation(
  token: string,
  uid: string,
  houseId: string,
): Promise<void> {
  try {
    await db().runTransaction(async (tx) => {
      const invRef = db().collection('invitations').doc(token);
      const tRef = ticketRef(uid, houseId);
      const [inv, ticket] = [await tx.get(invRef), await tx.get(tRef)];
      if (inv.exists && (inv.data() ?? {}).redeemedByUid === uid) {
        tx.update(invRef, { redeemedAt: FieldValue.delete(), redeemedByUid: FieldValue.delete() });
      }
      if (ticket.exists && (ticket.data() ?? {}).used === false) tx.delete(tRef);
    });
  } catch (err) {
    logger.error('redeemInvitation: could not release the invitation after a failed grant', {
      houseId,
      error: (err as Error).message,
    });
  }
}

/**
 * Marks the account's ticket for the house used, once: the first guest doc
 * created for that account in that house consumes it, whoever created it.
 * Transactional and idempotent: a used or missing ticket is left alone.
 * Returns true when this call marked it.
 */
export async function markTicketUsed(
  uid: string,
  houseId: string,
  guestId: string,
): Promise<boolean> {
  const ref = ticketRef(uid, houseId);
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || (snap.data() ?? {}).used !== false) return false;
    tx.update(ref, { used: true, usedAt: Timestamp.now(), usedByGuestId: guestId });
    return true;
  });
}
