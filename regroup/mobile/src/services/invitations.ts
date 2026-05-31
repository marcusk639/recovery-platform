import { functions } from '../../firebase-setup';

export type InvitationRole = 'admin' | 'guest' | 'senior-peer';

export interface CreateInvitationInput {
  email: string;
  houseId: string;
  role: InvitationRole;
  initialPhase?: string;
}

export interface CreateInvitationResult {
  token: string;
}

export interface PeekInvitationResult {
  houseId: string;
  role: InvitationRole;
  invitedEmail: string;
  initialPhase?: string;
  expiresAt: string;
}

export interface RedeemInvitationResult {
  houseId: string;
  role: InvitationRole;
}

/**
 * Ask the server to issue an invitation token + send the email. The caller
 * must be the house owner or an existing admin/superAdmin of the target
 * house (enforced by the CF).
 */
export async function createInvitation(
  input: CreateInvitationInput,
): Promise<CreateInvitationResult> {
  const result = await functions.httpsCallable('createInvitation')(
    input as any,
  );
  return result.data as CreateInvitationResult;
}

/**
 * Fetch metadata for an unredeemed invitation token. Used by SignUpForm
 * to pre-fill the email and branch on role before the user signs up.
 * Anyone with the token can call (the token IS the credential).
 */
export async function peekInvitation(
  token: string,
): Promise<PeekInvitationResult> {
  const result = await functions.httpsCallable('peekInvitation')({
    token,
  } as any);
  return result.data as PeekInvitationResult;
}

/**
 * Redeem an invitation token after sign-up. The CF validates the caller's
 * email matches the invitation and sets the role-appropriate custom
 * claim. Tokens are single-use.
 */
export async function redeemInvitation(
  token: string,
): Promise<RedeemInvitationResult> {
  const result = await functions.httpsCallable('redeemInvitation')({
    token,
  } as any);
  return result.data as RedeemInvitationResult;
}
