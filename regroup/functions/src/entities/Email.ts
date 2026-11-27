export interface Email {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** false: send with SendGrid click tracking off (links that carry a token). */
  clickTracking?: false;
}

export interface InviteEmailPayload {
  email: Email;
  dynamicLink: string;
  type: InvitationType;
}

export interface EmailConfirmationPayload {
  email: string;
  dynamicLink: string;
  name: string;
}

export type InvitationType = "guest" | "admin" | "superAdmin" | "supporter";
