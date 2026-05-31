export default interface UserClaims {
  potentialSuperAdmin?: boolean;
  // arrays of house ids
  admin: string[];
  guest: string[];
  superAdmin: string[];
}
