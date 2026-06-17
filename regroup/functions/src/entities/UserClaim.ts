export type HouseRoleClaim = Record<string, true>;

export default interface UserClaims {
  potentialSuperAdmin?: boolean;
  // Maps of houseId -> true (NOT arrays). The map shape is REQUIRED because the
  // Firestore security rules are the real authz boundary for direct mobile writes
  // and use map-only idioms: `houseId in token.role` and
  // `token.role.keys().hasAny(houseIds)`. Writing arrays here silently breaks
  // every rule built on those idioms (isAdmin/isGuest/...). See P0-1.
  admin: HouseRoleClaim;
  guest: HouseRoleClaim;
  superAdmin: HouseRoleClaim;
}
