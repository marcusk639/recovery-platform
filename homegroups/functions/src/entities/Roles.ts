export type Role = "admin" | "superAdmin" | "guest" | "supporter";

export interface Roles {
  [userId: string]: Role;
}
