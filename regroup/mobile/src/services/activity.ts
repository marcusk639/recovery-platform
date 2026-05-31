import { firestore } from '../../firebase-setup';
import FirebaseFirestore from '@react-native-firebase/firestore';
import {
  Activity,
  ActivityType,
  ActivityData,
  ActivityStatus,
  ActivityEntity,
  isChoreActivity,
  isMeetingActivity,
  isWorkActivity,
  isMedicationActivity,
  isPrimarySupporterActivity,
} from '../entities/ActivityModel';
import {
  WeekSummary,
  WeekSummaryEntity,
  DailyStats,
  createEmptyWeekStats,
  initializeDailyStats,
} from '../entities/WeekSummary';
import { logException } from '../util/logging';
import { offlineQueue, isNetworkError } from './offlineQueue';

/**
 * Helper: Get week start date (Monday) from any date
 */
function getWeekStart(date: Date | { toDate(): Date }): string {
  const d =
    typeof (date as any)?.toDate === 'function'
      ? (date as any).toDate()
      : new Date(date as Date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
}

/**
 * Helper: Get week end date (Sunday) from start date
 */
function getWeekEnd(startDate: string): string {
  const d = new Date(startDate);
  d.setDate(d.getDate() + 6);
  return d.toISOString().split('T')[0];
}

/**
 * Helper: Get date string from Date object
 */
function getDateString(date: Date | string): string {
  if (typeof date === 'string') {
    return date.split('T')[0];
  }
  return date.toISOString().split('T')[0];
}

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

    // Add to Firestore
    const docRef = await firestore.collection('activities').add(activity);

    // Apply a +1 delta to the week summary. This replaces the prior
    // read-all-week-activities → recompute → write strategy on the hot
    // logActivity path. See .full-review [P1] and the docstring on
    // incrementWeekSummaryForActivity below.
    await incrementWeekSummaryForActivity(
      guestId,
      houseId,
      { type, timestamp: activityTimestamp, data },
      1,
    );

    // Return activity with ID
    return {
      id: docRef.id,
      ...activity,
      loggedAt: new Date(), // Convert server timestamp to Date for return
    };
  } catch (error) {
    logException(error);
    throw new Error(`Failed to log activity: ${type}`);
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
      .where('status', '==', ActivityStatus.ACTIVE);

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
    })) as Activity[];
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
      .where('status', '==', ActivityStatus.ACTIVE);

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
    })) as Activity[];

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
      .where('status', '==', ActivityStatus.ACTIVE)
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      timestamp: doc.data().timestamp?.toDate?.() || doc.data().timestamp,
      loggedAt: doc.data().loggedAt?.toDate?.() || doc.data().loggedAt,
    })) as Activity[];
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
 * Mutate `stats` and the `dailyStats[date]` entry in-place by `delta` for the
 * counters that `activity` contributes to. `delta` is +1 for log / -1 for
 * delete. WORK activities scale by `data.hoursWorked` (so deleting an 8-hour
 * shift subtracts 8 hours, not 1).
 *
 * Used by the increment-based hot path on the first write of the week, where
 * we need to construct the full WeekSummary schema from scratch. The same
 * accounting is encoded in the FieldValue.increment payload for subsequent
 * writes (see `addIncrementsForType`).
 */
function applyActivityDeltaInPlace(
  stats: ReturnType<typeof createEmptyWeekStats>,
  daily: DailyStats,
  activity: Pick<Activity, 'type' | 'data'>,
  delta: number,
): void {
  switch (activity.type) {
    case ActivityType.CHORE:
      stats.choresCompleted += delta;
      daily.choresCompleted += delta;
      break;
    case ActivityType.MEETING:
      stats.meetingsAttended += delta;
      daily.meetingsAttended += delta;
      break;
    case ActivityType.WORK: {
      const hours = isWorkActivity(activity as Activity)
        ? activity.data.hoursWorked || 0
        : 0;
      stats.hoursWorked += hours * delta;
      daily.hoursWorked += hours * delta;
      break;
    }
    case ActivityType.MEDICATION:
      stats.medicationTaken += delta;
      daily.medicationTaken += delta;
      break;
    case ActivityType.PRIMARY_SUPPORTER:
      stats.primarySupporterMet += delta;
      daily.primarySupporterMet += delta;
      break;
  }
}

/**
 * Build the `set({merge: true})` payload that applies a delta to an existing
 * WeekSummary document via FieldValue.increment. No read needed — Firestore
 * applies the deltas server-side atomically.
 */
function addIncrementsForType(
  updates: Record<string, any>,
  activity: Pick<Activity, 'type' | 'data'>,
  activityDate: string,
  delta: number,
): void {
  let topLevelKey: string | null = null;
  let incrementBy = delta;

  switch (activity.type) {
    case ActivityType.CHORE:
      topLevelKey = 'choresCompleted';
      break;
    case ActivityType.MEETING:
      topLevelKey = 'meetingsAttended';
      break;
    case ActivityType.WORK: {
      topLevelKey = 'hoursWorked';
      const hours = isWorkActivity(activity as Activity)
        ? activity.data.hoursWorked || 0
        : 0;
      incrementBy = hours * delta;
      break;
    }
    case ActivityType.MEDICATION:
      topLevelKey = 'medicationTaken';
      break;
    case ActivityType.PRIMARY_SUPPORTER:
      topLevelKey = 'primarySupporterMet';
      break;
  }

  if (topLevelKey && incrementBy !== 0) {
    updates[`stats.${topLevelKey}`] =
      FirebaseFirestore.FieldValue.increment(incrementBy);
    updates[`dailyStats.${activityDate}.${topLevelKey}`] =
      FirebaseFirestore.FieldValue.increment(incrementBy);
  }
}

/**
 * Apply a single-activity delta to the week summary doc.
 *
 * Replaces the prior read-all-week-activities → recompute → write strategy
 * on the hot logActivity / deleteActivity paths. Cost transitions:
 *   - First write of the week: 1 read (existence check) + 1 write.
 *   - Subsequent writes:        0 reads + 1 write (FieldValue.increment).
 * Old strategy was 1 query returning up to N docs + 1 write per call — i.e.
 * O(N²) reads per week per guest. New strategy is O(1) reads per week.
 *
 * The full-schema initialization on the first write keeps consumers reading
 * fields like `summary.stats.choresCompleted` consistent (they expect
 * every stat key to be present as a number).
 *
 * See .full-review/02-security-performance.md [P1].
 */
export async function incrementWeekSummaryForActivity(
  guestId: string,
  houseId: string,
  activity: Pick<Activity, 'type' | 'timestamp' | 'data'>,
  delta: 1 | -1,
): Promise<void> {
  try {
    const weekStart = getWeekStart(
      typeof activity.timestamp === 'string'
        ? new Date(activity.timestamp)
        : (activity.timestamp as Date),
    );
    const weekEnd = getWeekEnd(weekStart);
    const activityDate = getDateString(activity.timestamp);
    const docId = `${guestId}_${weekStart}`;
    const summaryRef = firestore.collection('week-summaries').doc(docId);

    await firestore.runTransaction(async tx => {
      const snap = await tx.get(summaryRef);

      if (!snap.exists) {
        // First write of the week. Materialize the full schema (every stat
        // key present as a number) and apply the delta into the new object,
        // so consumers reading `summary.stats.x` never see `undefined`.
        const stats = createEmptyWeekStats();
        const dailyStats = initializeDailyStats(weekStart, weekEnd);
        const dailyForDate = dailyStats[activityDate] ?? {
          date: activityDate,
          choresCompleted: 0,
          meetingsAttended: 0,
          hoursWorked: 0,
          medicationTaken: 0,
          primarySupporterMet: 0,
        };
        applyActivityDeltaInPlace(stats, dailyForDate, activity, delta);
        dailyStats[activityDate] = dailyForDate;

        tx.set(summaryRef, {
          guestId,
          houseId,
          startDate: weekStart,
          endDate: weekEnd,
          stats,
          dailyStats,
          // eslint-disable-next-line no-restricted-syntax -- WeekSummary Firestore schema field
          lastUpdated: FirebaseFirestore.FieldValue.serverTimestamp() as any,
          activityCount: Math.max(0, delta),
        });
        return;
      }

      // Doc exists — server-side atomic increments. No data round-trip.
      const updates: Record<string, any> = {
        // eslint-disable-next-line no-restricted-syntax -- WeekSummary Firestore schema field
        lastUpdated: FirebaseFirestore.FieldValue.serverTimestamp(),
        activityCount: FirebaseFirestore.FieldValue.increment(delta),
        [`dailyStats.${activityDate}.date`]: activityDate,
      };
      addIncrementsForType(updates, activity, activityDate, delta);
      tx.set(summaryRef, updates, { merge: true });
    });
  } catch (error) {
    logException(error);
    throw new Error('Failed to update week summary');
  }
}

/**
 * Update week summary by recalculating from activities
 * Called automatically when activities are logged
 *
 * Retained for use by updateActivity and resolveDispute where the before↔
 * after type/hours diff is more complex than a single delta. Also suitable
 * for a periodic Cloud Function rebuild as a safety net against drift.
 *
 * @param guestId - ID of the guest
 * @param houseId - ID of the house
 * @param weekStart - Week start date (YYYY-MM-DD)
 */
export async function updateWeekSummary(
  guestId: string,
  houseId: string,
  weekStart: string,
): Promise<void> {
  try {
    const weekEnd = getWeekEnd(weekStart);
    const docId = `${guestId}_${weekStart}`;

    // Get all activities for this week
    const activities = await getActivities(
      guestId,
      new Date(weekStart),
      new Date(weekEnd + 'T23:59:59'),
    );

    // Calculate week stats
    const stats = createEmptyWeekStats();
    const dailyStats = initializeDailyStats(weekStart, weekEnd);

    for (const activity of activities) {
      const activityDate = getDateString(activity.timestamp);

      // Ensure daily stats exist for this date
      if (!dailyStats[activityDate]) {
        dailyStats[activityDate] = {
          date: activityDate,
          choresCompleted: 0,
          meetingsAttended: 0,
          hoursWorked: 0,
          medicationTaken: 0,
          primarySupporterMet: 0,
        };
      }

      // Aggregate based on activity type
      switch (activity.type) {
        case ActivityType.CHORE:
          stats.choresCompleted++;
          dailyStats[activityDate].choresCompleted++;
          break;

        case ActivityType.MEETING:
          stats.meetingsAttended++;
          dailyStats[activityDate].meetingsAttended++;
          break;

        case ActivityType.WORK:
          if (isWorkActivity(activity)) {
            const hours = activity.data.hoursWorked || 0;
            stats.hoursWorked += hours;
            dailyStats[activityDate].hoursWorked += hours;
          }
          break;

        case ActivityType.MEDICATION:
          stats.medicationTaken++;
          dailyStats[activityDate].medicationTaken++;
          break;

        case ActivityType.PRIMARY_SUPPORTER:
          stats.primarySupporterMet++;
          dailyStats[activityDate].primarySupporterMet++;
          break;
      }
    }

    // Update or create week summary
    const summary: Omit<WeekSummary, 'id'> = {
      guestId,
      houseId,
      startDate: weekStart,
      endDate: weekEnd,
      stats,
      dailyStats,
      // eslint-disable-next-line no-restricted-syntax -- WeekSummary Firestore schema field
      lastUpdated: FirebaseFirestore.FieldValue.serverTimestamp() as any,
      activityCount: activities.length,
    };

    await firestore
      .collection('week-summaries')
      .doc(docId)
      .set(summary, { merge: true });
  } catch (error) {
    logException(error);
    throw new Error('Failed to update week summary');
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

    const data = activity.data() as Activity;

    // Update activity
    await activityRef.update({
      ...updates,
      loggedAt: FirebaseFirestore.FieldValue.serverTimestamp(),
    });

    // Recalculate week summary
    const weekStart = getWeekStart(
      typeof data.timestamp === 'string'
        ? new Date(data.timestamp)
        : data.timestamp,
    );
    await updateWeekSummary(data.guestId, data.houseId, weekStart);
  } catch (error: any) {
    if (error?.message === 'Activity not found') throw error;
    logException(error);
    throw new Error('Failed to update activity');
  }
}

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

    const data = activity.data() as Activity;
    const wasActive = data.status === ActivityStatus.ACTIVE;

    // Soft delete
    await activityRef.update({
      status: ActivityStatus.DELETED,
      loggedAt: FirebaseFirestore.FieldValue.serverTimestamp(),
    });

    // Apply a -1 delta to the week summary, but ONLY if the activity was
    // ACTIVE (and therefore counted in the summary). DISPUTED and already-
    // DELETED activities are not in the summary, so deleting them is a no-op
    // from the summary's perspective. See .full-review [P1].
    if (wasActive) {
      await incrementWeekSummaryForActivity(
        data.guestId,
        data.houseId,
        { type: data.type, timestamp: data.timestamp, data: data.data },
        -1,
      );
    }
  } catch (error: any) {
    if (error?.message === 'Activity not found') throw error;
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
      disputeResolvedBy: disputedBy,
      loggedAt: FirebaseFirestore.FieldValue.serverTimestamp(),
    });
  } catch (error) {
    logException(error);
    throw new Error('Failed to dispute activity');
  }
}

/**
 * Resolve a disputed activity
 *
 * @param activityId - ID of the activity
 * @param resolvedBy - User ID who resolved the dispute
 * @param resolution - 'keep' or 'delete'
 */
export async function resolveDispute(
  activityId: string,
  resolvedBy: string,
  resolution: 'keep' | 'delete',
): Promise<void> {
  try {
    const updates: Partial<Activity> = {
      status:
        resolution === 'keep'
          ? ActivityStatus.RESOLVED
          : ActivityStatus.DELETED,
      disputeResolvedBy: resolvedBy,
      disputeResolvedAt: FirebaseFirestore.FieldValue.serverTimestamp() as any,
      loggedAt: FirebaseFirestore.FieldValue.serverTimestamp() as any,
    };

    const activityRef = firestore.collection('activities').doc(activityId);
    const activity = await activityRef.get();

    if (!activity.exists) {
      throw new Error('Activity not found');
    }

    const data = activity.data() as Activity;

    await activityRef.update(updates);

    // Recalculate week summary
    const weekStart = getWeekStart(
      typeof data.timestamp === 'string'
        ? new Date(data.timestamp)
        : data.timestamp,
    );
    await updateWeekSummary(data.guestId, data.houseId, weekStart);
  } catch (error: any) {
    if (error?.message === 'Activity not found') throw error;
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
 * Log an activity with automatic offline fallback.
 *
 * Attempts to write the activity to Firestore immediately. If the write fails
 * because the device is offline (Firestore error code `unavailable` or
 * `deadline-exceeded`), the activity is queued locally and will be synced the
 * next time `useFlushOfflineQueue` is called.
 *
 * Any non-network error (permission denied, invalid argument, etc.) is
 * re-thrown so callers can handle real failures.
 *
 * @returns `{ success: true, queued: false, activityId }` on immediate write,
 *          `{ success: false, queued: true, activityId }` when queued locally.
 */
export async function logActivityWithOfflineSupport(
  guestId: string,
  houseId: string,
  type: ActivityType,
  data: ActivityData,
  loggedBy: string,
  timestamp?: Date,
): Promise<{ success: boolean; queued: boolean; activityId?: string }> {
  try {
    const activity = await logActivity(
      guestId,
      houseId,
      type,
      data,
      loggedBy,
      timestamp,
    );
    return { success: true, queued: false, activityId: activity.id };
  } catch (error: unknown) {
    if (isNetworkError(error)) {
      const localId = await offlineQueue.enqueue({
        guestId,
        houseId,
        type,
        data,
        loggedBy,
        timestamp: timestamp ?? new Date(),
      });
      return { success: false, queued: true, activityId: localId };
    }
    throw error;
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
    .where('status', '==', ActivityStatus.ACTIVE)
    .orderBy('timestamp', 'desc')
    .limit(limit)
    .onSnapshot(snapshot => {
      const activities = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate?.() || doc.data().timestamp,
        loggedAt: doc.data().loggedAt?.toDate?.() || doc.data().loggedAt,
      })) as Activity[];

      onUpdate(activities);
    });
}
