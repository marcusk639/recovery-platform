import Admin from '../entities/Admin';
import { User } from '../entities/User';
import each from 'lodash/each';

export const mapUserToAdmin = (user: Partial<User>, admin: Admin) => {
  admin.firstName = user.firstName || '';
  admin.lastName = user.lastName || '';
  admin.userId = user.uid || '';
  admin.phoneNumber = user.phoneNumber || '';
  admin.email = user.email || '';
  return admin;
};

export const isSuperAdmin = (admin: any, houseId: string) => {
  return (
    admin &&
    admin.superAdmin &&
    admin.superAdmin.length &&
    admin.superAdmin.includes(houseId)
  );
};

export const houseIdsRemoved = (before: Admin, after: Admin) => {
  const removedSuperAdminHouses: string[] = [];
  const removedAdminHouses: string[] = [];
  if (before && after) {
    const { houseIds: beforeIds } = before;
    const { houseIds: afterIds } = after;
    if (beforeIds && afterIds) {
      removedSuperAdminHouses.push(
        ...beforeIds.filter(bHouseId => !afterIds.includes(bHouseId)),
      );
      removedAdminHouses.push(
        ...beforeIds.filter(bHouseId => !afterIds.includes(bHouseId)),
      );
    }
  }
  return [removedSuperAdminHouses, removedAdminHouses];
};
