export interface Email {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
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
