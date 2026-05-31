import { BaseEntity } from './BaseEntity';
import { createAdminId } from '../services/admin';

export default class Admin extends BaseEntity {
  firstName?: string = '';
  lastName?: string = '';
  superAdmin: string[] = [];
  userId: string = '';
  houseIds: string[] = [];
  avatar?: string;
  phoneNumber: string = '';
  uniqueAdminAttribute: string = 'admin';
  email: string = '';

  // static [Symbol.hasInstance](obj) {
  //   if (obj.houseIds) {
  //     return true;
  //   }
  // }

  constructor(
    email: string,
    firstName?: string,
    lastName?: string,
    userId?: string,
    superAdmin: string[] = [],
  ) {
    super();
    this.firstName = firstName || '';
    this.lastName = lastName || '';
    this.superAdmin = superAdmin;
    this.userId = userId || '';
    this.email = email;
    this.id = createAdminId();
  }
}
