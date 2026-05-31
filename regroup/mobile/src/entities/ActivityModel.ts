import * as yup from 'yup';
import { BaseEntity } from './BaseEntity';

/**
 * Activity Types - Different types of activities guests can log
 */
export enum ActivityType {
  CHORE = 'chore',
  MEETING = 'meeting',
  WORK = 'work',
  MEDICATION = 'medication',
  PRIMARY_SUPPORTER = 'primary_supporter',
}

/**
 * Activity Status
 */
export enum ActivityStatus {
  ACTIVE = 'active',
  DISPUTED = 'disputed',
  RESOLVED = 'resolved',
  DELETED = 'deleted',
}

/**
 * Base Activity Interface
 * Represents a single activity logged by a guest
 */
export interface Activity {
  id: string;
  guestId: string;
  houseId: string;
  type: ActivityType;
  timestamp: Date | string; // When the activity happened
  data: ActivityData; // Type-specific data
  loggedBy: string; // User ID who logged this activity
  loggedAt: Date | string; // When it was logged in the system
  verified: boolean; // Admin verified?
  status: ActivityStatus;

  // Optional dispute fields
  disputeReason?: string;
  disputeResolvedBy?: string;
  disputeResolvedAt?: Date | string;

  // Metadata
  notes?: string;

  // Dispute workflow fields
  underDispute?: number;
  disputeResult?: 'none' | 'success' | 'fail';
  disputeId?: string;
}

/**
 * Union type for all activity data types
 */
export type ActivityData =
  | ChoreActivityData
  | MeetingActivityData
  | WorkActivityData
  | MedicationActivityData
  | PrimarySupporterActivityData;

/**
 * Chore Activity Data
 */
export interface ChoreActivityData {
  type: 'chore';
  choreType: string; // 'daily', 'weekly', etc.
  choreName: string; // Name of the chore
  choreId?: string; // Reference to Chore entity if needed
  photoUrl?: string; // Firebase Storage download URL, set when resident attaches photo evidence
}

/**
 * Meeting Activity Data
 */
export interface MeetingActivityData {
  type: 'meeting';
  meetingId?: string;
  meetingName: string;
  meetingType: string; // 'AA', 'NA', etc.
  duration: number; // Duration in minutes
  location?: string;
}

/**
 * Work Activity Data
 */
export interface WorkActivityData {
  type: 'work';
  jobName: string;
  hoursWorked: number;
  jobId?: string; // Reference to Job entity if needed
  shiftStart?: Date | string;
  shiftEnd?: Date | string;
}

/**
 * Medication Activity Data
 */
export interface MedicationActivityData {
  type: 'medication';
  medicationName?: string;
  dosage?: string;
  prescribedTime?: string; // e.g., "morning", "evening"
}

/**
 * Primary Supporter Meeting Activity Data
 */
export interface PrimarySupporterActivityData {
  type: 'primary_supporter';
  supporterId: string;
  supporterName: string;
  duration?: number; // Duration in minutes
  meetingType?: string; // 'in-person', 'phone', 'video'
}

/**
 * Activity Entity Class
 */
export class ActivityEntity extends BaseEntity implements Activity {
  id: string = '';
  guestId: string = '';
  houseId: string = '';
  type: ActivityType = ActivityType.CHORE;
  timestamp: Date = new Date();
  data: ActivityData;
  loggedBy: string = '';
  loggedAt: Date = new Date();
  verified: boolean = false;
  status: ActivityStatus = ActivityStatus.ACTIVE;

  disputeReason?: string;
  disputeResolvedBy?: string;
  disputeResolvedAt?: Date;
  notes?: string;

  constructor(
    guestId: string,
    houseId: string,
    type: ActivityType,
    data: ActivityData,
    loggedBy: string,
  ) {
    super();
    this.guestId = guestId;
    this.houseId = houseId;
    this.type = type;
    this.data = data;
    this.loggedBy = loggedBy;
    this.timestamp = new Date();
    this.loggedAt = new Date();
  }
}

/**
 * Validation Schema for Activity
 */
export const activitySchema = yup.object().shape({
  id: yup.string().notRequired(),
  guestId: yup.string().required('Guest ID is required'),
  houseId: yup.string().required('House ID is required'),
  type: yup
    .string()
    .oneOf(Object.values(ActivityType), 'Invalid activity type')
    .required('Activity type is required'),
  timestamp: yup.date().required('Timestamp is required'),
  loggedBy: yup.string().required('Logged by user ID is required'),
  loggedAt: yup.date().required('Logged at timestamp is required'),
  verified: yup.boolean().default(false),
  status: yup
    .string()
    .oneOf(Object.values(ActivityStatus), 'Invalid status')
    .default(ActivityStatus.ACTIVE),
  data: yup.object().required('Activity data is required'),
  disputeReason: yup.string().notRequired(),
  notes: yup.string().notRequired(),
});

/**
 * Type Guards
 */
export function isChoreActivity(
  activity: Activity,
): activity is Activity & { data: ChoreActivityData } {
  return activity.type === ActivityType.CHORE;
}

export function isMeetingActivity(
  activity: Activity,
): activity is Activity & { data: MeetingActivityData } {
  return activity.type === ActivityType.MEETING;
}

export function isWorkActivity(
  activity: Activity,
): activity is Activity & { data: WorkActivityData } {
  return activity.type === ActivityType.WORK;
}

export function isMedicationActivity(
  activity: Activity,
): activity is Activity & { data: MedicationActivityData } {
  return activity.type === ActivityType.MEDICATION;
}

export function isPrimarySupporterActivity(
  activity: Activity,
): activity is Activity & { data: PrimarySupporterActivityData } {
  return activity.type === ActivityType.PRIMARY_SUPPORTER;
}

/**
 * Helper to create activity data objects
 */
export const ActivityDataFactory = {
  chore: (
    choreType: string,
    choreName: string,
    choreId?: string,
    photoUrl?: string,
  ): ChoreActivityData => ({
    type: 'chore',
    choreType,
    choreName,
    choreId,
    ...(photoUrl ? { photoUrl } : {}),
  }),

  meeting: (
    meetingName: string,
    meetingType: string,
    duration: number = 60,
    meetingId?: string,
    location?: string,
  ): MeetingActivityData => ({
    type: 'meeting',
    meetingName,
    meetingType,
    duration,
    meetingId,
    location,
  }),

  work: (
    jobName: string,
    hoursWorked: number,
    jobId?: string,
    shiftStart?: Date,
    shiftEnd?: Date,
  ): WorkActivityData => ({
    type: 'work',
    jobName,
    hoursWorked,
    jobId,
    shiftStart,
    shiftEnd,
  }),

  medication: (
    medicationName?: string,
    dosage?: string,
    prescribedTime?: string,
  ): MedicationActivityData => ({
    type: 'medication',
    medicationName,
    dosage,
    prescribedTime,
  }),

  primarySupporter: (
    supporterId: string,
    supporterName: string,
    duration?: number,
    meetingType?: string,
  ): PrimarySupporterActivityData => ({
    type: 'primary_supporter',
    supporterId,
    supporterName,
    duration,
    meetingType,
  }),
};

// Note: No default export to avoid conflicts with legacy Activity.tsx
