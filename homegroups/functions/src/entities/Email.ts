export interface Email {
  from: string;
  to: string;
  subject: string;
  text: string;
}

// Note: These interfaces are legacy and not currently used.
// The app uses Universal Links instead of Dynamic Links.
export type InvitationType = "guest" | "admin" | "superAdmin" | "supporter";
