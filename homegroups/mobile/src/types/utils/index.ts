// src/types/utils.ts

import {FirestoreTimestamp} from '..';

/**
 * Type utilities to help with common type transformations
 */

// Converts a type to its Firestore representation (dates become timestamps)
export type FirestoreData<T> = {
  [K in keyof T]: T[K] extends Date
    ? FirestoreTimestamp
    : T[K] extends Date | undefined
    ? FirestoreTimestamp | undefined
    : T[K] extends Date | null
    ? FirestoreTimestamp | null
    : T[K] extends object
    ? FirestoreData<T[K]>
    : T[K];
};

// Converts a Firestore type back to its app representation (timestamps become dates)
export type AppData<T> = {
  [K in keyof T]: T[K] extends FirestoreTimestamp
    ? Date
    : T[K] extends FirestoreTimestamp | undefined
    ? Date | undefined
    : T[K] extends FirestoreTimestamp | null
    ? Date | null
    : T[K] extends object
    ? AppData<T[K]>
    : T[K];
};

// Makes all properties in T required
export type Required<T> = {
  [K in keyof T]-?: T[K];
};

// Makes specified properties in T required
export type RequiredProps<T, K extends keyof T> = T & Required<Pick<T, K>>;

// Makes all properties in T optional
export type Optional<T> = {
  [K in keyof T]+?: T[K];
};

// Makes specified properties in T optional
export type OptionalProps<T, K extends keyof T> = Omit<T, K> &
  Partial<Pick<T, K>>;

// Omits the specified properties from T
export type OmitProps<T, K extends keyof T> = Omit<T, K>;

// Picks the specified properties from T
export type PickProps<T, K extends keyof T> = Pick<T, K>;

// Creates a new type with the specified properties set to null
export type Nullable<T> = {
  [K in keyof T]: T[K] | null;
};

// Creates a new type with the specified properties made nullable
export type NullableProps<T, K extends keyof T> = Omit<T, K> & {
  [P in K]: T[P] | null;
};

// src/types/enums.ts

/**
 * Enums for the application
 */

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
  SUPER_ADMIN = 'super_admin',
  GROUP_ADMIN = 'group_admin',
}

export enum MeetingTypeEnum {
  AA = 'AA',
  NA = 'NA',
  IOP = 'IOP',
  RELIGIOUS = 'Religious',
  CELEBRATE_RECOVERY = 'Celebrate Recovery',
  CUSTOM = 'Custom',
}

export enum DayOfWeek {
  SUNDAY = 'sunday',
  MONDAY = 'monday',
  TUESDAY = 'tuesday',
  WEDNESDAY = 'wednesday',
  THURSDAY = 'thursday',
  FRIDAY = 'friday',
  SATURDAY = 'saturday',
  ALL = 'all',
}

export enum GroupRoleEnum {
  SECRETARY = 'Secretary',
  TREASURER = 'Treasurer',
  GSR = 'GSR',
  LITERATURE = 'Literature',
  COFFEE = 'Coffee',
  SETUP = 'Setup',
  GREETER = 'Greeter',
  SPEAKER_SEEKER = 'Speaker Seeker',
  MEMBER = 'Member',
}

export enum TransactionTypeEnum {
  INCOME = 'income',
  EXPENSE = 'expense',
}

export enum IncomeCategoryEnum {
  SEVENTH_TRADITION = '7th Tradition',
  LITERATURE_SALES = 'Literature Sales',
  EVENT_INCOME = 'Event Income',
  GROUP_CONTRIBUTIONS = 'Group Contributions',
  OTHER_INCOME = 'Other Income',
}

export enum ExpenseCategoryEnum {
  RENT = 'Rent',
  LITERATURE = 'Literature',
  REFRESHMENTS = 'Refreshments',
  EVENTS = 'Events',
  CONTRIBUTIONS = 'Contributions to Service Bodies',
  SUPPLIES = 'Supplies',
  PRINTING = 'Printing',
  INSURANCE = 'Insurance',
  OTHER_EXPENSES = 'Other Expenses',
}

export enum NotificationTypeEnum {
  ANNOUNCEMENT = 'announcement',
  MEETING_REMINDER = 'meeting_reminder',
  CELEBRATION = 'celebration',
  GROUP_INVITE = 'group_invite',
  DIRECT_MESSAGE = 'direct_message',
  BUSINESS_MEETING = 'business_meeting',
  SERVICE_OPPORTUNITY = 'service_opportunity',
  SYSTEM = 'system',
}

export enum FilterDateRangeEnum {
  WEEK = 'week',
  MONTH = 'month',
  QUARTER = 'quarter',
  YEAR = 'year',
  CUSTOM = 'custom',
}

export enum MeetingFormatEnum {
  // AA Meeting formats
  OPEN = 'O',
  CLOSED = 'C',
  DISCUSSION = 'D',
  SPEAKER = 'S',
  BIG_BOOK = 'BB',
  STEP_STUDY = 'ST',
  MEDITATION = 'M',
  MENS = 'MN',
  WOMENS = 'W',
  LGBTQ = 'LG',
  YOUNG_PEOPLE = 'YP',
  BEGINNERS = 'BE',

  // NA Meeting formats
  BASIC_TEXT = 'BT',
  CANDLELIGHT = 'CAN',
  CHILDREN_WELCOME = 'CW',
  LITERATURE_STUDY = 'LIT',
  NEWCOMER = 'NC',
  QUESTION_ANSWER = 'QA',
  STEP_WORKING_GUIDE = 'SWG',
  TRADITIONS_STUDY = 'TRAD',
  WHEELCHAIR = 'WC',

  // Generic formats
  ONLINE = 'ONL',
  HYBRID = 'HYB',
  IN_PERSON = 'IP',
}

export enum BusinessMeetingStatusEnum {
  SCHEDULED = 'scheduled',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum AgendaItemTypeEnum {
  OLD_BUSINESS = 'old_business',
  NEW_BUSINESS = 'new_business',
  REPORT = 'report',
  ELECTION = 'election',
  OTHER = 'other',
}

export enum AgendaItemStatusEnum {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  TABLED = 'tabled',
}

export enum LiteratureTypeEnum {
  BOOK = 'book',
  PAMPHLET = 'pamphlet',
  WORKBOOK = 'workbook',
  CARD = 'card',
  OTHER = 'other',
}

export enum ProgramTypeEnum {
  AA = 'AA',
  NA = 'NA',
  OTHER = 'other',
}

export enum ServiceLengthEnum {
  THREE_MONTHS = 3,
  SIX_MONTHS = 6,
  ONE_YEAR = 12,
  TWO_YEARS = 24,
}

// src/types/constants.ts

/**
 * Constants for the application
 */

export const DEFAULT_MEETING_TYPES = [
  MeetingTypeEnum.AA,
  MeetingTypeEnum.NA,
  MeetingTypeEnum.CELEBRATE_RECOVERY,
  MeetingTypeEnum.IOP,
  MeetingTypeEnum.RELIGIOUS,
  MeetingTypeEnum.CUSTOM,
];

export const DAYS_OF_WEEK = [
  DayOfWeek.SUNDAY,
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.FRIDAY,
  DayOfWeek.SATURDAY,
];

export const INCOME_CATEGORIES = [
  IncomeCategoryEnum.SEVENTH_TRADITION,
  IncomeCategoryEnum.LITERATURE_SALES,
  IncomeCategoryEnum.EVENT_INCOME,
  IncomeCategoryEnum.GROUP_CONTRIBUTIONS,
  IncomeCategoryEnum.OTHER_INCOME,
];

export const EXPENSE_CATEGORIES = [
  ExpenseCategoryEnum.RENT,
  ExpenseCategoryEnum.LITERATURE,
  ExpenseCategoryEnum.REFRESHMENTS,
  ExpenseCategoryEnum.EVENTS,
  ExpenseCategoryEnum.CONTRIBUTIONS,
  ExpenseCategoryEnum.SUPPLIES,
  ExpenseCategoryEnum.PRINTING,
  ExpenseCategoryEnum.INSURANCE,
  ExpenseCategoryEnum.OTHER_EXPENSES,
];

export const GROUP_ROLES = [
  GroupRoleEnum.SECRETARY,
  GroupRoleEnum.TREASURER,
  GroupRoleEnum.GSR,
  GroupRoleEnum.LITERATURE,
  GroupRoleEnum.COFFEE,
  GroupRoleEnum.SETUP,
  GroupRoleEnum.GREETER,
  GroupRoleEnum.SPEAKER_SEEKER,
  GroupRoleEnum.MEMBER,
];

export const AA_MEETING_FORMATS = {
  [MeetingFormatEnum.OPEN]: 'Open Meeting',
  [MeetingFormatEnum.CLOSED]: 'Closed Meeting',
  [MeetingFormatEnum.DISCUSSION]: 'Discussion',
  [MeetingFormatEnum.SPEAKER]: 'Speaker Meeting',
  [MeetingFormatEnum.BIG_BOOK]: 'Big Book Study',
  [MeetingFormatEnum.STEP_STUDY]: 'Step Study',
  [MeetingFormatEnum.MEDITATION]: 'Meditation',
  [MeetingFormatEnum.MENS]: "Men's Meeting",
  [MeetingFormatEnum.WOMENS]: "Women's Meeting",
  [MeetingFormatEnum.LGBTQ]: 'LGBTQ Meeting',
  [MeetingFormatEnum.YOUNG_PEOPLE]: "Young People's Meeting",
  [MeetingFormatEnum.BEGINNERS]: 'Beginners Meeting',
};

export const NA_MEETING_FORMATS = {
  [MeetingFormatEnum.BASIC_TEXT]: 'Basic Text Study',
  [MeetingFormatEnum.CANDLELIGHT]: 'Candlelight Meeting',
  [MeetingFormatEnum.CHILDREN_WELCOME]: 'Children Welcome',
  [MeetingFormatEnum.LITERATURE_STUDY]: 'Literature Study',
  [MeetingFormatEnum.NEWCOMER]: 'Newcomer Meeting',
  [MeetingFormatEnum.QUESTION_ANSWER]: 'Question & Answer',
  [MeetingFormatEnum.STEP_WORKING_GUIDE]: 'Step Working Guide',
  [MeetingFormatEnum.TRADITIONS_STUDY]: 'Traditions Study',
  [MeetingFormatEnum.WHEELCHAIR]: 'Wheelchair Accessible',
};

export const GENERIC_MEETING_FORMATS = {
  [MeetingFormatEnum.ONLINE]: 'Online Meeting',
  [MeetingFormatEnum.HYBRID]: 'Hybrid Meeting (In-Person & Online)',
  [MeetingFormatEnum.IN_PERSON]: 'In-Person Meeting',
};

export const DEFAULT_MEETING_RADIUS = 10; // miles

export const DEFAULT_PRUDENT_RESERVE = 600; // dollars

export const DEFAULT_MEETING_DURATION = 60; // minutes

export const MAX_GROUP_ADMINS = 5;

export const MAX_PINNED_ANNOUNCEMENTS = 3;

export const MIN_PASSWORD_LENGTH = 8;

export const FIREBASE_COLLECTIONS = {
  USERS: 'users',
  GROUPS: 'groups',
  MEETINGS: 'meetings',
  ANNOUNCEMENTS: 'announcements',
  EVENTS: 'events',
  TRANSACTIONS: 'transactions',
  NOTIFICATIONS: 'notifications',
  LITERATURE: 'literature',
  BUSINESS_MEETINGS: 'business_meetings',
  SERVICES: 'services',
};
