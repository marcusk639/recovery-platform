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
 * ticket for the caller and the house. The rule cannot stop several docs
 * created before any trigger runs (a batch, or quick sequential writes), so
 * onGuestWrite settles the ticket (settleTicket): it marks it used, bound to
 * ONE doc (usedByGuestId: the first doc of that account in that house since
 * the ticket, by createTime then id), and flags every other self-created doc
 * in the server-only guest-flags/{guestId} { reason: 'extra-self-create' }.
 * Nothing is deleted; a flagged doc does not keep the account's claims.
 */
import * as admin from 'firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { Invitation } from '../entities/Invitation';

/** At most 7 days after the redeem, and at most 24h after the invitation expires. */
export const TICKET_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const TICKET_GRACE_AFTER_INVITATION_MS = 24 * 60 * 60 * 1000;

export function ticketExpiryMs(redeemedAtMs: number, invitationExpiresAt: string): number {
  const invitationMs = new Date(invitationExpiresAt).getTime();
  const cap = Number.isFinite(invitationMs)
    ? invitationMs + TICKET_GRACE_AFTER_INVITATION_MS
    : redeemedAtMs + TICKET_TTL_MS;
  return Math.min(redeemedAtMs + TICKET_TTL_MS, cap);
}

const db = () => admin.firestore();
export const ticketId = (uid: string, houseId: string) => `${uid}_${houseId}`;
export const ticketRef = (uid: string, houseId: string) =>
  db().collection('admission-tickets').doc(ticketId(uid, houseId));

/** Roles whose redemption lets the invitee create their own resident record. */
const SELF_CREATE_ROLES = new Set(['guest', 'senior-peer']);

const ticketFor = (token: string, inv: Invitation, redeemedAtMs: number) => ({
  invitationId: token,
  role: inv.role,
  // The app sends phase = the invitation's initialPhase, or "" when it has
  // none (SignUp.tsx peek: initialPhase ?? ""); the rule compares exactly.
  initialPhase: inv.initialPhase ?? '',
  used: false,
  createdAt: Timestamp.fromMillis(redeemedAtMs),
  expiresAt: Timestamp.fromMillis(ticketExpiryMs(redeemedAtMs, inv.expiresAt)),
});

/**
 * Consumes the invitation for this caller, atomically: only one redeem of a
 * token can succeed, however many race. Re-checks the invitation inside the
 * transaction (not redeemed, not expired) and, for resident roles, writes
 * the caller's admission ticket in the same commit.
 *
 * Idempotent for the same account: if this caller already redeemed it, it
 * returns alreadyRedeemed (the caller then grants nothing again) and
 * re-writes the ticket only if it is missing.
 */
export async function consumeInvitation(
  token: string,
  uid: string,
  nowMs = Date.now(),
): Promise<{ inv: Invitation; alreadyRedeemed: boolean }> {
  const invRef = db().collection('invitations').doc(token);
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(invRef);
    if (!snap.exists) throw new HttpsError('not-found', 'Invitation not found');
    const inv = snap.data() as Invitation & { redeemedByUid?: string };
    if (inv.redeemedAt && inv.redeemedByUid === uid) {
      if (SELF_CREATE_ROLES.has(inv.role)) {
        const tRef = ticketRef(uid, inv.houseId);
        const ticket = await tx.get(tRef);
        const redeemedMs = new Date(inv.redeemedAt).getTime();
        if (!ticket.exists) tx.set(tRef, ticketFor(token, inv, redeemedMs));
      }
      return { inv, alreadyRedeemed: true };
    }
    if (inv.redeemedAt) throw new HttpsError('failed-precondition', 'Invitation already redeemed');
    if (new Date(inv.expiresAt).getTime() < nowMs) {
      throw new HttpsError('failed-precondition', 'Invitation has expired');
    }
    tx.update(invRef, { redeemedAt: new Date(nowMs).toISOString(), redeemedByUid: uid });
    if (SELF_CREATE_ROLES.has(inv.role)) {
      tx.set(ticketRef(uid, inv.houseId), ticketFor(token, inv, nowMs));
    }
    return { inv, alreadyRedeemed: false };
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

type Snap = FirebaseFirestore.QueryDocumentSnapshot;
const ms = (t: unknown): number => {
  const v = t as { toMillis?: () => number } | undefined;
  return typeof v?.toMillis === 'function' ? v.toMillis() : 0;
};
/** Created by the account itself, or by a build that did not record createdBy. */
const maybeSelfCreated = (d: Snap, uid: string) => {
  const by = (d.data() ?? {}).createdBy;
  return by === undefined || by === null || by === uid;
};

export const flagRef = (guestId: string) => db().collection('guest-flags').doc(guestId);

/**
 * Settles the account's ticket for the house after a guest doc is created
 * (see header). Transactional and idempotent: an existing usedByGuestId is
 * never moved, and flags are written once. Returns the flagged doc ids.
 */
export async function settleTicket(uid: string, houseId: string): Promise<string[]> {
  const tRef = ticketRef(uid, houseId);
  const docsQuery = db()
    .collection('guests')
    .where('userId', '==', uid)
    .where('houseId', '==', houseId);
  return db().runTransaction(async (tx) => {
    const ticket = await tx.get(tRef);
    if (!ticket.exists) return [];
    const t = ticket.data() ?? {};
    const since = ms(t.createdAt);
    const docs = (await tx.get(docsQuery)).docs
      .filter((d) => ms(d.createTime) >= since)
      .sort((a, b) => ms(a.createTime) - ms(b.createTime) || (a.id < b.id ? -1 : 1));
    if (docs.length === 0) return [];
    const bound =
      typeof t.usedByGuestId === 'string' && t.usedByGuestId ? t.usedByGuestId : docs[0].id;
    const extras = docs.filter((d) => d.id !== bound && maybeSelfCreated(d, uid));
    const flagSnaps = extras.length ? await tx.getAll(...extras.map((d) => flagRef(d.id))) : [];
    const toFlag = extras.filter((_d, i) => !flagSnaps[i].exists);
    if (t.used !== true || t.usedByGuestId !== bound) {
      tx.update(tRef, { used: true, usedAt: Timestamp.now(), usedByGuestId: bound });
    }
    for (const d of toFlag) {
      tx.set(flagRef(d.id), {
        reason: 'extra-self-create',
        ticketId: ticketId(uid, houseId),
        houseId,
        flaggedAt: Timestamp.now(),
      });
    }
    if (toFlag.length) {
      logger.warn('onGuestWrite: extra self-created guest docs under one ticket; flagged', {
        houseId,
        keptGuestId: bound,
        flaggedGuestIds: toFlag.map((d) => d.id),
      });
    }
    return toFlag.map((d) => d.id);
  });
}

/**
 * Of an account's active docs in a house, those that may keep its claims:
 * not flagged as an extra self-create, and, when self-created under a ticket
 * (createdBy == the account), the ticket's usedByGuestId. Staff-created docs
 * and legacy docs with no createdBy count as before.
 */
export async function entitlingDocs(uid: string, houseId: string, docs: Snap[]): Promise<Snap[]> {
  if (docs.length === 0) return [];
  const [ticket, ...flags] = await db().getAll(
    ticketRef(uid, houseId),
    ...docs.map((d) => flagRef(d.id)),
  );
  const bound = ticket.exists ? (ticket.data() ?? {}).usedByGuestId : undefined;
  return docs.filter((d, i) => {
    if (flags[i].exists) return false;
    const selfCreated = (d.data() ?? {}).createdBy === uid;
    return !(selfCreated && typeof bound === 'string' && bound && bound !== d.id);
  });
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
