import { Invitation, InvitationType } from '../../entities/Invite';
import { AppLink } from './parseAppLink';

type InvitationLink = Extract<AppLink, { kind: 'invitation' | 'invitation-legacy' }>;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The Invitation the signup screen reads (state.user.invitation) for a parsed
 * invitation link. A token link carries only the token: SignUp fills in the
 * rest with peekInvitation and grants claims with redeemInvitation. A legacy
 * link carries the invitation in its params (kept until Phase F removes it).
 */
export const invitationFromAppLink = (link: InvitationLink): Invitation => {
  const now = new Date();
  const base = {
    id: '',
    expirationDate: new Date(now.getTime() + WEEK_MS),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  if (link.kind === 'invitation') {
    return {
      ...base,
      type: 'guest', // placeholder, overwritten by peekInvitation
      houseId: '',
      inviterId: '',
      ownerId: '',
      email: '',
      initialPhase: '',
      token: link.token,
    };
  }
  const { params } = link;
  return {
    ...base,
    type: params.invitationType as InvitationType,
    houseId: params.house,
    inviterId: params.inviter || '',
    ownerId: params.owner || '',
    email: params.email,
    initialPhase: params.initialPhase ? params.initialPhase.replace(/\+/g, ' ') : '',
  };
};
