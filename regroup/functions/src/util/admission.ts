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
 * the ticket, by createTime then id), and flags every other doc of that
 * account in that house created since the ticket that is not staff-created
 * (createdBy absent, or the account itself) in the server-only
 * guest-flags/{guestId} { reason: 'extra-self-create' }. Nothing is
 * deleted; a flagged doc does not keep the account's claims.
 *
 * One rule for docs with no createdBy (builds before #145 send none): with
 * no ticket for that account and house they count as legacy/staff docs and
 * are never flagged; with a ticket they are flagged unless they are the
 * bound doc. A doc whose createdBy names someone else is staff-created and
 * never flagged.
 */
import * as admin from 'firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { Invitation } from '../entities/Invitation';
import { nextRoleRecord, roleRef, RoleTier } from './houseRoles';

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
 * fresh:     this call consumed the invitation; grant, then completeGrant.
 * completed: this account already redeemed it AND its grant completed
 *            (grantCompletedAt): succeed, grant and record nothing. A role
 *            revoked since then is never brought back by an old token.
 * stranded:  this account redeemed it but the grant never completed (the
 *            grant failed and so did the release): grant and record again,
 *            only while the invitation is unexpired (+24h grace).
 */
export type ConsumeState = 'fresh' | 'completed' | 'stranded';

/**
 * Consumes the invitation for this caller, atomically: only one redeem of a
 * token can succeed, however many race. Re-checks the invitation inside the
 * transaction (not redeemed, not expired) and, for resident roles, writes
 * the caller's admission ticket in the same commit. A repeat by the same
 * account is `completed` or `stranded` (see ConsumeState); only a stranded
 * retry re-writes a missing ticket. An expired token never grants.
 */
export async function consumeInvitation(
  token: string,
  uid: string,
  nowMs = Date.now(),
): Promise<{ inv: Invitation; state: ConsumeState }> {
  const invRef = db().collection('invitations').doc(token);
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(invRef);
    if (!snap.exists) throw new HttpsError('not-found', 'Invitation not found');
    const inv = snap.data() as Invitation & { redeemedByUid?: string; grantCompletedAt?: string };
    if (inv.redeemedAt && inv.redeemedByUid === uid) {
      if (inv.grantCompletedAt) return { inv, state: 'completed' as const };
      if (new Date(inv.expiresAt).getTime() + TICKET_GRACE_AFTER_INVITATION_MS < nowMs) {
        throw new HttpsError('failed-precondition', 'Invitation has expired');
      }
      if (SELF_CREATE_ROLES.has(inv.role)) {
        const tRef = ticketRef(uid, inv.houseId);
        const ticket = await tx.get(tRef);
        const redeemedMs = new Date(inv.redeemedAt).getTime();
        if (!ticket.exists) tx.set(tRef, ticketFor(token, inv, redeemedMs));
      }
      return { inv, state: 'stranded' as const };
    }
    if (inv.redeemedAt) throw new HttpsError('failed-precondition', 'Invitation already redeemed');
    if (new Date(inv.expiresAt).getTime() < nowMs) {
      throw new HttpsError('failed-precondition', 'Invitation has expired');
    }
    tx.update(invRef, { redeemedAt: new Date(nowMs).toISOString(), redeemedByUid: uid });
    if (SELF_CREATE_ROLES.has(inv.role)) {
      tx.set(ticketRef(uid, inv.houseId), ticketFor(token, inv, nowMs));
    }
    return { inv, state: 'fresh' as const };
  });
}

/**
 * After the claims write succeeded: marks the invitation's grant complete
 * (grantCompletedAt) and records the tier, in one transaction, so a later
 * call with the same token grants and records nothing.
 */
export async function completeGrant(
  token: string,
  inv: Invitation,
  uid: string,
  tier: RoleTier,
): Promise<void> {
  const invRef = db().collection('invitations').doc(token);
  const rRef = roleRef(inv.houseId, uid);
  await db().runTransaction(async (tx) => {
    const [invSnap, roleSnap] = [await tx.get(invRef), await tx.get(rRef)];
    if (!invSnap.exists) return;
    const record = nextRoleRecord(roleSnap.exists ? (roleSnap.data() ?? {}).tier : null, tier, {
      grantedBy: inv.inviterUid,
      via: 'invitation',
      invitationId: token,
    });
    tx.update(invRef, { grantCompletedAt: new Date().toISOString() });
    if (record) tx.set(rRef, record);
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
/** Not staff-created: createdBy is absent (older build) or the account itself. */
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
 * not flagged (settleTicket flags, under a ticket, every non-staff doc but
 * the bound one), and, when createdBy names the account, the ticket's
 * usedByGuestId if one is bound. With no ticket, docs with no createdBy and
 * staff-created docs count as before (see the header).
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
