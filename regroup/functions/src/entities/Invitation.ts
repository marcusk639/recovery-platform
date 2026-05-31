/**
 * Server-issued, single-use invitation token.
 *
 * The Firestore document ID equals the opaque token (so token lookup is a
 * direct doc-by-id read). The token itself is the only credential needed
 * to call peekInvitation/redeemInvitation — treat it as a bearer secret.
 */
export type InvitationRole = "admin" | "guest" | "senior-peer";

export interface Invitation {
  /** Mirrored from the doc ID for convenience when reading. */
  token: string;
  /** UID of the admin/owner who created the invitation. */
  inviterUid: string;
  houseId: string;
  /** What role the invitee will be granted on redemption. */
  role: InvitationRole;
  /** Email the invitation was sent to; must match request.auth.token.email
   *  on redeem (case-insensitive). */
  invitedEmail: string;
  /** Initial phase name for guest invitations (optional). */
  initialPhase?: string;
  /** ISO 8601. */
  expiresAt: string;
  /** ISO 8601 when created. */
  createdAt: string;
  /** ISO 8601 when redeemed; absent until redemption. */
  redeemedAt?: string;
  /** UID that redeemed the invitation; absent until redemption. */
  redeemedByUid?: string;
}
