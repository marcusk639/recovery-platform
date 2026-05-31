import { BaseEntity } from './BaseEntity';

export default class Admin extends BaseEntity {
  firstName?: string = '';
  lastName?: string = '';
  superAdmin: string[];
  userId: string = '';
  houseIds: string[] = [];
  avatar?: string;
  phoneNumber: string;
  uniqueAdminAttribute: string = 'admin';
  email: string = '';

  // static [Symbol.hasInstance](obj) {
  //   if (obj.houseIds) {
  //     return true;
  //   }
  // }
}
