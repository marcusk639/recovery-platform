import { BaseEntity } from './BaseEntity';

export interface Invitation extends BaseEntity {
  type: InvitationType;
  houseId: string;
  // the userId of the inviter
  inviterId: string;
  // email address of the invitee
  email: string;
  // name of the initial phase for the inviting house
  initialPhase: string;
  expirationDate: Date;
  // owner of the house
  ownerId: string;
  /**
   * Server-issued opaque token. Present on new invitations created via
   * the createInvitation CF; absent on legacy URL-payload links.
   * When present, signup uses redeemInvitation instead of
   * addAdminAuthorization/addGuestAuthorization.
   */
  token?: string;
}

export type InvitationType =
  | 'guest'
  | 'admin'
  | 'superAdmin'
  | 'supporter'
  | 'senior-peer';
