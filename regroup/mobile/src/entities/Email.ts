import { InvitationType } from './Invite';

export interface Email {
  from: string;
  to: string;
  subject: string;
  text: string;
}

export interface InviteEmailPayload {
  email: Partial<Email>;
  type: InvitationType;
  dynamicLink: string;
}

// EmailConfirmationPayload removed - no longer needed
