import { BaseEntity } from './BaseEntity';
import OperatorSubscription from './OperatorSubscription';

export const removeUserFromHouse = () => {
  return { guestId: null, houseId: null, potentialGuest: false, potentialSuperAdmin: false, isGuest: false, isSuperAdmin: false };
};

class User extends BaseEntity {
  uid: string = '';
  adminId: string = '';
  guestId: string = '';
  houseId: string = '';
  isAdmin: boolean = false;
  emailVerified: boolean = false;
  houseAccountVerified: boolean = false;
  houseCode: string = '';
  isGuest: boolean = false;
  isSuperAdmin: boolean = false;
  email: string = '';
  firstName: string = '';
  lastName: string = '';
  middleInitial: string = '';
  phoneNumber: string = '';
  housesOwned: string[] = [];
  gender: 'male' | 'female' = 'male';
  ethnicity: string = '';
  dateOfBirth: string = '';
  sobrietyDate: string = '';
  avatar: string = '';
  ssn: string = '';
  maritalStatus: '' | 'single' | 'separated' | 'married' = '';
  housingStatus: 'homeless' | 'renter' | 'homeowner' | 'family' = 'renter';
  termsOfService: boolean = false;
  keepUpdated: boolean = false;
  infoEntered: boolean = false;
  messagingToken: string[] = [];
  password?: string;
  isAnonymous: boolean = false;
  potentialGuest: boolean = false;
  potentialSuperAdmin: boolean = false;
  orgSetupCompleted: boolean = false;
  subscriptionMetadata: OperatorSubscription = new OperatorSubscription();
}

export { User };
