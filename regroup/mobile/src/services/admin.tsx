import {
  collection,
  type WhereFilterOp,
} from '@react-native-firebase/firestore';
import { firestore } from '../../firebase-setup';
import * as crud from './crud';
import Admin from '../entities/Admin';
import { House } from '../entities/House';
import { Admins } from '../types';
import map from 'lodash/map';
import { createInvitation } from './invitations';
import { logException } from '../util/logging';

export const adminCollection = collection(firestore, 'admins');

export function createAdminId(): string {
  return crud.createId(adminCollection);
}

export async function getAdmin(uuid: string): Promise<Admin> {
  return crud.get<Admin>(adminCollection, uuid);
}

export async function createAdmin(admin: Admin) {
  return crud.create<Admin>(adminCollection, admin);
}

export function createId() {
  return crud.createId(adminCollection);
}

export async function updateAdmin(adminId: string, updates: Partial<Admin>): Promise<Admin> {
  await crud.update<Admin>(adminCollection, { id: adminId, ...updates });
  return crud.get<Admin>(adminCollection, adminId);
}

// Nothing is archived: the old admin-archive copy was refused by the rules,
// which made removal fail, and nothing read it (#196).
export async function deleteAdmin(adminId: string): Promise<string> {
  await crud.deleteObject<Admin>(adminCollection, { id: adminId } as Admin);
  return adminId;
}

export async function sendAdminInvite(
  email: string,
  houseId: string,
  _houseName: string,
): Promise<void> {
  // The createInvitation CF assembles the email (including the house name
  // it looks up server-side) and the token-bearing deep link, then writes
  // the invitations/{token} document. The caller's uid is used by the CF
  // to authorize the invite against the target house.
  await createInvitation({
    email,
    houseId,
    role: 'admin',
  });
}

export async function getHouseAdmins(house: House): Promise<Admin[]> {
  const admins = await getAdmins('houseIds', 'array-contains', house.id);
  return map(admins, (admin) => admin);
}

/**
 * The admins of one house, keyed by id, read one by one from house.adminIds
 * (#183 item 4). The rules let a house's residents and admins read an admins
 * doc listing that house, but refuse a list query (it can't prove the
 * per-house check), so getHouseAdmins' query returns nothing to a resident.
 * A missing or unreadable admin is skipped so the others still show.
 */
export async function getAdminsForHouse(house: House): Promise<Admins> {
  const adminIds = house?.adminIds ?? [];
  const results = await Promise.allSettled(adminIds.map((id) => getAdmin(id)));
  const admins: Admins = {};
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      logException(result.reason, 'getAdminsForHouse: admin read failed');
    } else if (result.value) {
      admins[adminIds[index]] = { ...result.value, id: adminIds[index] } as Admin;
    }
  });
  return admins;
}

/**
 * Gets admins where attribute == value
 * @param {*} attribute The attribute to select by
 * @param {*} value The value of the attribute
 */
export async function getAdmins(
  attribute: string,
  operator: WhereFilterOp,
  value: string,
): Promise<Admins> {
  const result = await crud.getByAttribute<Admin>(adminCollection, attribute, operator, value);
  const admins: Admins = {};
  if (result && result.length) {
    result.forEach((admin) => {
      const id = admin.id!;
      admins[id] = admin;
    });
  }
  return admins;
}
