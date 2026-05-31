import { Change } from 'firebase-functions/v2';
import Admin from '../entities/Admin';

export const removedHouseIds = (houseIdsBefore: string[], houseIdsAfter: string[]) => {
  return houseIdsBefore.filter((houseId) => !houseIdsAfter.includes(houseId));
};

export const addedHouseIds = (houseIdsBefore: string[], houseIdsAfter: string[]) => {
  return houseIdsAfter.filter((houseId) => !houseIdsBefore.includes(houseId));
};

export const getAdminHouseIds = (snapshot: Change<FirebaseFirestore.DocumentSnapshot>) => {
  const admin = snapshot.after.exists ? (snapshot.after.data() as Admin) : null;
  const adminBefore = snapshot.before.exists ? (snapshot.before.data() as Admin) : null;
  const adminAfterHouseIds = admin ? admin.houseIds : [];
  const adminBeforeHouseIds = adminBefore ? adminBefore.houseIds : [];
  const superAdminAfterHouseIds = admin ? admin.superAdmin : [];
  const superAdminBeforeHouseIds = adminBefore ? adminBefore.superAdmin : [];
  const deletedSuperAdminHouses = removedHouseIds(superAdminBeforeHouseIds, superAdminAfterHouseIds);
  const deletedAdminHouses = removedHouseIds(adminBeforeHouseIds, adminAfterHouseIds);
  const addedSuperAdminHouses = addedHouseIds(superAdminBeforeHouseIds, superAdminAfterHouseIds);
  const addedAdminHouses = addedHouseIds(adminBeforeHouseIds, adminAfterHouseIds);
  return [deletedSuperAdminHouses, deletedAdminHouses, addedSuperAdminHouses, addedAdminHouses];
};
