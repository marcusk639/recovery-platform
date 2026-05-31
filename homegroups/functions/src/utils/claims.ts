// import {auth} from "firebase-admin";
// import UserClaims from "../entities/UserClaim";
// import {Role} from "../entities/Roles";

// export const createClaims = async (userId: string, houseIds: string[], role: Role, potentialSuperAdmin = false) => {
//   const currentUser = await auth().getUser(userId);
//   const currentUserClaims: any = currentUser && currentUser.customClaims ? currentUser.customClaims : {};
//   const currentRoleClaims: string[] = currentUserClaims[role] ? currentUserClaims[role] : [];
//   const newRoleClaims = new Set([...currentRoleClaims, ...houseIds]);
//   const userClaims: UserClaims = {
//     ...currentUserClaims,
//     [role]: Array.from(newRoleClaims),
//     potentialSuperAdmin,
//   };
//   return userClaims;
// };

// export const deleteClaim = async (userId: string, houseIds: string[], role: Role, potentialSuperAdmin = false) => {
//   const currentUser = await auth().getUser(userId);
//   const currentUserClaims: any = currentUser && currentUser.customClaims ? currentUser.customClaims : {};
//   const currentRoleClaims: string[] = currentUserClaims[role] ? currentUserClaims[role] : [];
//   const indices = houseIds.map((houseId) => currentRoleClaims.findIndex((id) => id === houseId));
//   indices.forEach((index) => currentRoleClaims.splice(index, 1));
//   const newRoleClaims = new Set([...currentRoleClaims]);
//   const userClaims: UserClaims = {
//     ...currentUserClaims,
//     [role]: Array.from(newRoleClaims),
//     potentialSuperAdmin,
//   };
//   return userClaims;
// };
