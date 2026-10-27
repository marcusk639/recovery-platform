import { firestore } from '../../firebase-setup';
import FirebaseFirestore from '@react-native-firebase/firestore';
import {
  Activity,
  ActivityType,
  ActivityData,
  ActivityStatus,
  LISTED_ACTIVITY_STATUSES,
  countsTowardStats,
  hasDisputeHistory,
  DISPUTE_OUTCOME_INCOMPLETE,
} from '../entities/ActivityModel';
import { WeekSummary } from '../entities/WeekSummary';
import { logException } from '../util/logging';

/**
 * Log a new activity
 *
 * @param guestId - ID of the guest logging the activity
 * @param houseId - ID of the house
 * @param type - Type of activity (chore, meeting, work, etc.)
 * @param data - Activity-specific data
 * @param loggedBy - User ID who logged this activity
 * @param timestamp - Optional custom timestamp (defaults to now)
 * @returns The created activity with Firestore-generated ID
 */
export async function logActivity(
  guestId: string,
  houseId: string,
  type: ActivityType,
  data: ActivityData,
  loggedBy: string,
  timestamp?: Date,
): Promise<Activity> {
  try {
    const activityTimestamp = timestamp || new Date();

    const activity: Omit<Activity, 'id'> = {
      guestId,
      houseId,
      type,
      timestamp: activityTimestamp,
      data,
      loggedBy,
      loggedAt: FirebaseFirestore.FieldValue.serverTimestamp() as any,
      verified: false,
      status: ActivityStatus.ACTIVE,
    };

    // Add to Firestore. This is the whole write: week-summaries are kept by
    // the onActivityWritten Cloud Function (regroup/functions). The client
    // must not write them — the rules allow only admins, so a resident's
    // log used to save the activity and then throw here.
    const docRef = await firestore.collection('activities').add(activity);

    // Return activity with ID
    return {
      id: docRef.id,
      ...activity,
      loggedAt: new Date(), // Convert server timestamp to Date for return
    };
  } catch (error) {
    logException(error);
    // Original error, so its `code` still tells callers what failed.
    throw error;
  }
}

/**
 * Get activities for a guest within a date range
 *
 * @param guestId - ID of the guest
 * @param startDate - Start of date range (inclusive)
 * @param endDate - End of date range (exclusive)
 * @param type - Optional: Filter by activity type
 * @returns Array of activities
 */
export async function getActivities(
  guestId: string,
  startDate: Date,
  endDate: Date,
  type?: ActivityType,
): Promise<Activity[]> {
  try {
    let query = firestore
      .collection('activities')
      .where('guestId', '==', guestId)
      .where('timestamp', '>=', startDate)
      .where('timestamp', '<', endDate)
      .where('status', 'in', LISTED_ACTIVITY_STATUSES);

    // Add type filter if specified
    if (type) {
      query = query.where('type', '==', type);
    }

    const snapshot = await query.orderBy('timestamp', 'desc').get();

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      timestamp: doc.data().timestamp?.toDate?.() || doc.data().timestamp,
      loggedAt: doc.data().loggedAt?.toDate?.() || doc.data().loggedAt,
    })).filter(countsTowardStats) as Activity[];
  } catch (error) {
    logException(error);
    throw new Error('Failed to get activities');
  }
}

// ---------------------------------------------------------------------------
// Cursor-based pagination
// ---------------------------------------------------------------------------

/**
 * Represents a single page of activities returned by cursor-based pagination.
 *
 * `nextCursor` is a Firestore DocumentSnapshot that can be passed back as the
 * `cursor` argument on the next call to advance through result sets.
 * `null` means there are no more pages.
 */
export interface ActivityPage {
  activities: Activity[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  nextCursor: any | null;
  hasMore: boolean;
}

/**
 * Get a paginated page of activities for a guest within a date range.
 *
 * Uses Firestore cursor-based pagination (.startAfter + .limit) so that
 * long-term residents with thousands of docs do not incur a full collection
 * scan on every fetch.
 *
 * Strategy: fetch `pageSize + 1` documents. If more than `pageSize` are
 * returned there are additional pages; `hasMore` will be `true` and the
 * result is trimmed to `pageSize`. The last doc in the trimmed slice becomes
 * `nextCursor` for the caller to pass back on the next request.
 *
 * @param guestId   - ID of the guest
 * @param startDate - Start of date range (inclusive)
 * @param endDate   - End of date range (exclusive)
 * @param pageSize  - Number of activities per page (default 20)
 * @param cursor    - Firestore DocumentSnapshot to start after (undefined = first page)
 * @param type      - Optional: Filter by activity type
 * @returns An ActivityPage containing activities, the next cursor, and hasMore flag
 */
export async function getActivitiesPage(
  guestId: string,
  startDate: Date,
  endDate: Date,
  pageSize: number = 20,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cursor?: any,
  type?: ActivityType,
): Promise<ActivityPage> {
  try {
    let query = firestore
      .collection('activities')
      .where('guestId', '==', guestId)
      .where('timestamp', '>=', startDate)
      .where('timestamp', '<', endDate)
      .where('status', 'in', LISTED_ACTIVITY_STATUSES);

    if (type) {
      query = query.where('type', '==', type);
    }

    query = query.orderBy('timestamp', 'desc');

    // Apply cursor for subsequent pages
    if (cursor) {
      query = query.startAfter(cursor);
    }

    // Fetch one extra doc to detect whether another page exists
    query = query.limit(pageSize + 1);

    const snapshot = await query.get();
    const docs = snapshot.docs;

    const hasMore = docs.length > pageSize;
    const pageDocs = hasMore ? docs.slice(0, pageSize) : docs;

    const activities = pageDocs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      timestamp: doc.data().timestamp?.toDate?.() || doc.data().timestamp,
      loggedAt: doc.data().loggedAt?.toDate?.() || doc.data().loggedAt,
    })).filter(countsTowardStats) as Activity[];

    const nextCursor = hasMore ? pageDocs[pageDocs.length - 1] : null;

    return { activities, nextCursor, hasMore };
  } catch (error) {
    logException(error);
    throw new Error('Failed to get activities page');
  }
}

/**
 * Get all activities for a house (for activity feed)
 *
 * @param houseId - ID of the house
 * @param limit - Maximum number of activities to return
 * @returns Array of recent activities
 */
export async function getHouseActivities(
  houseId: string,
  limit: number = 50,
): Promise<Activity[]> {
  try {
    const snapshot = await firestore
      .collection('activities')
      .where('houseId', '==', houseId)
      .where('status', 'in', LISTED_ACTIVITY_STATUSES)
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      timestamp: doc.data().timestamp?.toDate?.() || doc.data().timestamp,
      loggedAt: doc.data().loggedAt?.toDate?.() || doc.data().loggedAt,
    })).filter(countsTowardStats) as Activity[];
  } catch (error) {
    logException(error);
    throw new Error('Failed to get house activities');
  }
}

/**
 * Get week summary for a guest
 * Returns pre-aggregated stats for fast reads
 *
 * @param guestId - ID of the guest
 * @param weekStart - Week start date (YYYY-MM-DD)
 * @returns WeekSummary or null if doesn't exist
 */
export async function getWeekSummary(
  guestId: string,
  weekStart: string,
): Promise<WeekSummary | null> {
  try {
    const docId = `${guestId}_${weekStart}`;
    const doc = await firestore.collection('week-summaries').doc(docId).get();

    if (!doc.exists) {
      return null;
    }

    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      // eslint-disable-next-line no-restricted-syntax -- WeekSummary Firestore schema field
      lastUpdated: data?.lastUpdated?.toDate?.() || data?.lastUpdated,
    } as WeekSummary;
  } catch (error) {
    logException(error);
    throw new Error('Failed to get week summary');
  }
}

/**
 * Update an existing activity
 *
 * @param activityId - ID of the activity to update
 * @param updates - Partial activity data to update
 */
export async function updateActivity(
  activityId: string,
  updates: Partial<Activity>,
): Promise<void> {
  try {
    const activityRef = firestore.collection('activities').doc(activityId);
    const activity = await activityRef.get();

    if (!activity.exists) {
      throw new Error('Activity not found');
    }

    // Update activity. The week summary is recomputed server-side.
    await activityRef.update({
      ...updates,
      loggedAt: FirebaseFirestore.FieldValue.serverTimestamp(),
    });
  } catch (error: any) {
    if (error?.message === 'Activity not found') throw error;
    logException(error);
    throw new Error('Failed to update activity');
  }
}

/** deleteActivity's refusal for an activity with dispute history. */
export const DISPUTED_NOT_DELETABLE =
  'This activity has been disputed, so it cannot be deleted. A dispute ends when a house admin approves or rejects it.';

/**
 * Delete an activity (soft delete - sets status to DELETED)
 *
 * @param activityId - ID of the activity to delete
 */
export async function deleteActivity(activityId: string): Promise<void> {
  try {
    const activityRef = firestore.collection('activities').doc(activityId);
    const activity = await activityRef.get();

    if (!activity.exists) {
      throw new Error('Activity not found');
    }
    // Owner rule: a disputed activity is never deleted; its dispute ends by
    // APPROVE or REJECT. The rules refuse it too.
    if (hasDisputeHistory(activity.data())) {
      throw new Error(DISPUTED_NOT_DELETABLE);
    }

    // Soft delete. The server trigger drops it from the week summary.
    await activityRef.update({
      status: ActivityStatus.DELETED,
      loggedAt: FirebaseFirestore.FieldValue.serverTimestamp(),
    });
  } catch (error: any) {
    if (error?.message === 'Activity not found' || error?.message === DISPUTED_NOT_DELETABLE) {
      throw error;
    }
    logException(error);
    throw new Error('Failed to delete activity');
  }
}

/**
 * Dispute an activity
 *
 * @param activityId - ID of the activity
 * @param reason - Reason for dispute
 * @param disputedBy - User ID who is disputing
 */
export async function disputeActivity(
  activityId: string,
  reason: string,
  disputedBy: string,
): Promise<void> {
  try {
    await firestore.collection('activities').doc(activityId).update({
      status: ActivityStatus.DISPUTED,
      disputeReason: reason,
      // disputeResolvedBy has always held the disputer (and is overwritten
      // with the resolver by resolveDispute); disputedBy keeps who disputed.
      // The rules require both to be the caller for a peer dispute.
      disputedBy,
      disputeResolvedBy: disputedBy,
      loggedAt: FirebaseFirestore.FieldValue.serverTimestamp(),
    });
  } catch (error) {
    logException(error);
    throw new Error('Failed to dispute activity');
  }
}

/** resolveDispute refusals the UI shows as-is (the rest are generic). */
export const RESOLVE_REFUSALS = [
  'Activity not found',
  'Dispute already resolved',
  'Activity is not disputed',
];

/**
 * Resolve a dispute. Only house admins (owners, managers, peer leaders) may;
 * the rules enforce it.
 *
 * approve: the dispute stands, the activity was not done. It is marked
 *          incomplete and stops counting (it stays on record, e.g. for the
 *          court export's history).
 * reject:  the dispute fails, the activity stands and counts.
 *
 * Both set status RESOLVED and the legacy `disputeResult` the UI's
 * activityIsDisputable reads, so a resolved activity cannot be re-disputed.
 *
 * @param activityId - ID of the activity
 * @param resolvedBy - User ID of the admin resolving the dispute
 * @param outcome - 'approve' or 'reject'
 */
export async function resolveDispute(
  activityId: string,
  resolvedBy: string,
  outcome: 'approve' | 'reject',
): Promise<void> {
  try {
    const approved = outcome === 'approve';
    const updates: Partial<Activity> = {
      status: ActivityStatus.RESOLVED,
      disputed: approved ? 'successful' : 'rejected',
      incomplete: approved,
      // The owner's wording: residents of the house report it was not done.
      ...(approved ? { disputeOutcome: DISPUTE_OUTCOME_INCOMPLETE } : {}),
      disputeResult: approved ? 'success' : 'fail',
      disputeResolvedBy: resolvedBy,
      disputeResolvedAt: FirebaseFirestore.FieldValue.serverTimestamp() as any,
      loggedAt: FirebaseFirestore.FieldValue.serverTimestamp() as any,
    };

    const activityRef = firestore.collection('activities').doc(activityId);

    // In a transaction, so two admins resolving at once cannot both win (the
    // rules also refuse a resolution unless the dispute is still open).
    await firestore.runTransaction(async (tx: any) => {
      const activity = await tx.get(activityRef);
      if (!activity.exists) {
        throw new Error('Activity not found');
      }
      const status = (activity.data() as Activity | undefined)?.status;
      if (status === ActivityStatus.RESOLVED) {
        throw new Error('Dispute already resolved');
      }
      // Only an open dispute can be resolved: resolving a deleted or active
      // activity would invent an outcome.
      if (status !== ActivityStatus.DISPUTED) {
        throw new Error('Activity is not disputed');
      }
      // The week summary and house.disputes are updated server-side.
      tx.update(activityRef, updates);
    });
  } catch (error: any) {
    if (RESOLVE_REFUSALS.includes(error?.message)) {
      throw error;
    }
    logException(error);
    throw new Error('Failed to resolve dispute');
  }
}

/**
 * Mark an activity as verified by an admin
 *
 * @param activityId - ID of the activity to verify
 * @param verifiedBy - User ID of the admin verifying
 */
export async function verifyActivity(
  activityId: string,
  verifiedBy: string,
): Promise<void> {
  try {
    await firestore.collection('activities').doc(activityId).update({
      verified: true,
      verifiedBy,
      loggedAt: FirebaseFirestore.FieldValue.serverTimestamp(),
    });
  } catch (error) {
    logException(error);
    throw new Error('Failed to verify activity');
  }
}

/**
 * Subscribe to real-time activity updates for a house
 *
 * @param houseId - ID of the house
 * @param onUpdate - Callback when activities change
 * @param limit - Maximum number of activities to watch
 * @returns Unsubscribe function
 */
export function subscribeToHouseActivities(
  houseId: string,
  onUpdate: (activities: Activity[]) => void,
  limit: number = 50,
): () => void {
  return firestore
    .collection('activities')
    .where('houseId', '==', houseId)
    .where('status', 'in', LISTED_ACTIVITY_STATUSES)
    .orderBy('timestamp', 'desc')
    .limit(limit)
    .onSnapshot(snapshot => {
      const activities = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate?.() || doc.data().timestamp,
        loggedAt: doc.data().loggedAt?.toDate?.() || doc.data().loggedAt,
      })).filter(countsTowardStats) as Activity[];

      onUpdate(activities);
    });
}
