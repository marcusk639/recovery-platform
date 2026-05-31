import * as yup from 'yup';
import { parseISO, startOfDay, isAfter } from 'date-fns';
import SchemaConstants from './SchemaConstants';
import { BaseEntity } from './BaseEntity';
import { Role } from './Roles';

export const removeUserFromHouse = () => {
  return {
    guestId: null,
    houseId: null,
    potentialGuest: false,
    potentialSuperAdmin: false,
    isGuest: false,
    isSuperAdmin: false,
  };
};

export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'pending'
  | '';

export class OperatorSubscription {
  subscriptionId: string = '';
  currentPeriodEnd: number = 0;
  customerId: string = '';
  status: SubscriptionStatus = '';
  lastUpdatedAt?: string = undefined;
  plan: string = '';
  items: {
    houseItemId: string;
    guestItemId: string;
  } = { guestItemId: '', houseItemId: '' };
  houses: {
    [houseId: string]: {
      numberOfGuests: number;
    };
  } = {};
  oxfordEnabled: boolean = false;
}

/**
 * User Entity
 *
 * Represents a user account in the system. Users can be:
 * - Admins (house managers)
 * - Guests (residents)
 * - Super Admins (system administrators)
 *
 * NOTE: User entity uses `uid` as primary identifier (Firebase Auth ID)
 * The `id` field from BaseEntity is automatically synchronized with `uid`
 */
class User extends BaseEntity {
  // Primary identifier (Firebase Auth UID)
  uid: string = '';

  // Role-specific IDs
  adminId: string = '';
  guestId: string = '';
  houseId: string = '';

  // Role flags
  isAdmin: boolean = false;
  isGuest: boolean = false;
  isSuperAdmin: boolean = false;
  potentialGuest?: boolean = false;
  potentialSuperAdmin?: boolean = false;

  // Account status
  emailVerified: boolean = true;
  houseAccountVerified: boolean = false;
  houseCode: string = '';
  infoEntered: boolean = false;
  orgSetupCompleted?: boolean = false;
  isAnonymous: boolean = false;
  termsOfService: boolean = false;
  keepUpdated: boolean = false;

  // Personal information
  email: string = '';
  firstName: string = '';
  lastName: string = '';
  middleInitial: string = '';
  phoneNumber: string = '';
  avatar: string = '';
  gender: 'male' | 'female' = 'male';
  ethnicity: string = '';
  dateOfBirth: string = '';
  sobrietyDate: string = '';
  ssn: string = '';
  maritalStatus: '' | 'single' | 'separated' | 'married' = '';
  housingStatus: 'homeless' | 'renter' | 'homeowner' | 'family' = 'renter';

  // Management
  housesOwned: string[] = [];
  messagingToken: string[] = [];
  subscriptionMetadata: OperatorSubscription = new OperatorSubscription();

  // Authentication
  password?: string | null;

  /**
   * Constructor
   * Synchronizes id with uid for consistency with BaseEntity
   */
  constructor(uid?: string) {
    super();
    if (uid) {
      this.uid = uid;
      this.id = uid; // Keep id synchronized with uid
    }
  }
}

const userSchema = yup.object().shape({
  uid: yup.string().notRequired(),
  adminId: yup.string().notRequired(),
  guestId: yup.string().notRequired(),
  email: yup
    .string()
    .email(SchemaConstants.EMAIL)
    .max(50, SchemaConstants.stringMax(50))
    .required(SchemaConstants.REQUIRED),
  firstName: yup
    .string()
    .required(SchemaConstants.REQUIRED)
    .min(1, SchemaConstants.stringMin(0))
    .max(50, SchemaConstants.stringMax(50)),
  lastName: yup
    .string()
    .required(SchemaConstants.REQUIRED)
    .min(1, SchemaConstants.stringMin(0))
    .max(50, SchemaConstants.stringMax(50)),
  middleInitial: yup
    .string()
    .required(SchemaConstants.REQUIRED)
    .min(1, SchemaConstants.stringMin(0))
    .max(1, SchemaConstants.stringMax(1)),
  phoneNumber: yup
    .string()
    .required(SchemaConstants.REQUIRED)
    .min(10, SchemaConstants.stringMin(10))
    .max(14, SchemaConstants.stringMax(15)),
  gender: yup.string().required(),
  ethnicity: yup
    .string()
    .required(SchemaConstants.REQUIRED)
    .min(1, SchemaConstants.stringMin(0))
    .max(20, SchemaConstants.stringMax(20)),
  ssn: yup
    .string()
    .required(SchemaConstants.REQUIRED)
    .min(4, SchemaConstants.stringMin(4))
    .max(4, SchemaConstants.stringMax(4)),
  maritalStatus: yup
    .string()
    .required(SchemaConstants.REQUIRED)
    .min(0, SchemaConstants.stringMin(0))
    .max(20, SchemaConstants.stringMax(20)),
  housingStatus: yup
    .string()
    .required(SchemaConstants.REQUIRED)
    .min(0, SchemaConstants.stringMin(0))
    .max(20, SchemaConstants.stringMax(20)),
  dateOfBirth: yup
    .string()
    .test(
      'Maximum date',
      'error.no.future.date',
      value =>
        !value || !isAfter(startOfDay(parseISO(value)), startOfDay(new Date())),
    )
    .required(SchemaConstants.REQUIRED),
  termsOfService: yup.boolean().oneOf([true], 'error.terms.of.service'),
});

export { User, userSchema };
