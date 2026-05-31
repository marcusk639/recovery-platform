import { InvitationType } from './Invite';

export interface DynamicLink {
  type: 'invitation';
  // user id of the inviter
  inviter?: string;
  // house id
  house: string;
  // type of invitation
  invitationType: InvitationType;
  // email address
  email: string;
  // initial phase name for the inviting house
  initialPhase?: string;
  // user id
  userId?: string;
}
