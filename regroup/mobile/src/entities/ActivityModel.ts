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
 * Dispute model (owner decision): a disputed activity keeps counting while
 * the dispute is pending. A house admin (owner, manager or peer leader)
 * approves or rejects it via resolveDispute:
 *   approve -> status RESOLVED, disputed 'successful', incomplete true:
 *              the activity was not done and does NOT count;
 *   reject  -> status RESOLVED, disputed 'rejected', incomplete false:
 *              the activity stands and counts.
 * A house admin may undo a decision (reopenDispute): back to DISPUTED,
 * pending and counted, to be approved or rejected again. Every decision is
 * kept server-side (activities/{id}/dispute-decisions).
 * Legacy data: an old RESOLVED without `incomplete` (the former "keep")
 * counts like a reject; an old DELETED (the former "delete") does not.
 */
export type DisputeOutcome = 'successful' | 'rejected';

/** disputeOutcome written with an APPROVED dispute. */
export const DISPUTE_OUTCOME_INCOMPLETE = 'incomplete-per-residents' as const;

/** How an approved dispute is shown in the app. */
export const SUCCESSFUL_DISPUTE_LABEL =
  'Successfully disputed — residents of the house report this activity was not completed';

/**
 * An approved dispute: decided, and not counted (the residents report the
 * activity was not completed). From the counting rule, never from `disputed`
 * alone, so a reopened (pending) dispute shows no badge.
 */
export function isSuccessfullyDisputed(activity: unknown): boolean {
  const a = (activity ?? {}) as { status?: unknown };
  return a.status === ActivityStatus.RESOLVED && !countsTowardStats(activity);
}

const millis = (v: unknown): number | null => {
  if (v && typeof (v as { toMillis?: unknown }).toMillis === 'function') {
    return (v as { toMillis: () => number }).toMillis();
  }
  if (v instanceof Date) {
    return v.getTime();
  }
  if (typeof v === 'string') {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
  }
  return null;
};

/** An older build's "delete" resolution: deleted, resolved at loggedAt. */
export function isLegacyUpheld(activity: unknown): boolean {
  const a = (activity ?? {}) as Record<string, unknown>;
  const at = millis(a.disputeResolvedAt);
  return (
    a.status === ActivityStatus.DELETED &&
    at !== null &&
    at === millis(a.loggedAt) &&
    (a.disputed === undefined || a.disputed === null) &&
    a.incomplete !== true
  );
}

/**
 * Any dispute history at all — an open or decided dispute, or any dispute
 * field recorded. Owner rule: such an activity is never deleted; a dispute
 * ends only by APPROVE or REJECT (which an admin may undo). Mirrors
 * hasDisputeHistory in firebase/firestore.rules.
 */
export function hasDisputeHistory(activity: unknown): boolean {
  const a = (activity ?? {}) as Record<string, unknown>;
  const present = (k: string) => a[k] !== undefined && a[k] !== null;
  return (
    a.status === ActivityStatus.DISPUTED ||
    a.status === ActivityStatus.RESOLVED ||
    [
      'disputeReason',
      'disputedBy',
      'disputeResolvedBy',
      'disputeResolvedAt',
      'disputed',
      'disputeOutcome',
      'disputedAt',
      'reopenedBy',
    ].some(present) ||
    (a.disputeResult !== undefined && a.disputeResult !== null && a.disputeResult !== 'none') ||
    a.incomplete === true
  );
}

/** Statuses an activity list queries; countsTowardStats then drops incomplete. */
export const LISTED_ACTIVITY_STATUSES: ActivityStatus[] = [
  ActivityStatus.ACTIVE,
  ActivityStatus.DISPUTED,
  ActivityStatus.RESOLVED,
];

/**
 * Counts toward stats (and appears in lists) unless deleted or marked
 * incomplete by an approved dispute. Same rule as countsTowardSummary in
 * regroup/functions/src/activities/weekSummaryMath.ts.
 */
export function countsTowardStats(activity: unknown): boolean {
  // Accepts raw Firestore doc data as well as typed Activities.
  const a = (activity ?? {}) as { status?: unknown; incomplete?: unknown };
  return a.status !== ActivityStatus.DELETED && a.incomplete !== true;
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
  /** Who raised the dispute (kept after resolveDispute overwrites disputeResolvedBy). */
  disputedBy?: string;
  /** Set by an admin's resolution: approved ('successful') or 'rejected'. */
  disputed?: DisputeOutcome;
  /** true when an approved dispute marks the activity as not done. */
  incomplete?: boolean;
  /** Set with an APPROVED dispute: the residents report it was not completed. */
  disputeOutcome?: typeof DISPUTE_OUTCOME_INCOMPLETE;
  disputeResolvedBy?: string | null;
  disputeResolvedAt?: Date | string | null;
  /** When the dispute was raised (server time). */
  disputedAt?: Date | string;
  /** The admin who last undid a decision (reopenDispute), and when. */
  reopenedBy?: string;
  reopenedAt?: Date | string;
  /** The resident's account, stamped server-side (onActivityWritten). */
  residentUid?: string | null;

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
  /** Who raised the dispute (kept after resolveDispute overwrites disputeResolvedBy). */
  disputedBy?: string;
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
