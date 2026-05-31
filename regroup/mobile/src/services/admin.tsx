import { firestore } from '../../firebase-setup';
import * as crud from './crud';
import Admin from '../entities/Admin';
import { House } from '../entities/House';
import { Admins } from '../types';
import {
  firebase,
  FirebaseFirestoreTypes,
} from '@react-native-firebase/firestore';
import map from 'lodash/map';
import { createInvitation } from './invitations';

export const adminCollection = firestore.collection('admins');
export const adminArchive = firestore.collection('admin-archive');

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

export async function updateAdmin(
  adminId: string,
  updates: Partial<Admin>,
): Promise<Admin> {
  await crud.update<Admin>(adminCollection, { id: adminId, ...updates });
  return crud.get<Admin>(adminCollection, adminId);
}

export async function deleteAdmin(adminId: string): Promise<string> {
  const admin = await crud.get<Admin>(adminCollection, adminId);
  if (admin) {
    await crud.create<Admin>(adminArchive, admin, adminId);
  }
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
  return map(admins, admin => admin);
}

/**
 * Gets admins where attribute == value
 * @param {*} attribute The attribute to select by
 * @param {*} value The value of the attribute
 */
export async function getAdmins(
  attribute: string,
  operator: FirebaseFirestoreTypes.WhereFilterOp,
  value: string,
): Promise<Admins> {
  const result = await crud.getByAttribute<Admin>(
    adminCollection,
    attribute,
    operator,
    value,
  );
  const admins: Admins = {};
  if (result && result.length) {
    result.forEach(admin => {
      const id = admin.id!;
      admins[id] = admin;
    });
  }
  return admins;
}
