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
}

export type InvitationType = 'guest' | 'admin' | 'superAdmin' | 'supporter' | 'senior-peer';
