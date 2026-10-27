/**
 * Server-side maintenance of `week-summaries/{guestId}_{weekStart}`.
 *
 * Every activity write recomputes the affected guest-week from the activities
 * themselves, inside one Admin SDK transaction that reads the week's
 * activities, the guest and the summary, then writes the summary (creating it
 * when missing). Only activities activityTrust accepts are counted, and the
 * summary's houseId always comes from the guest doc, never from an activity.
 *
 * Why recompute rather than apply a +1/-1 delta with a ledger of applied
 * activity ids:
 *   - Idempotent by construction: a re-delivered event recomputes the same
 *     numbers, and an unchanged summary is not rewritten at all.
 *   - Order-independent: the transaction reads the activities as they are now,
 *     not the event payload, so out-of-order delivery still converges.
 *   - No ledger to grow inside the summary doc, and none to seed for the
 *     summaries that already exist.
 * The cost is one read per activity in that guest-week per event.
 *
 * Old app versions still write summaries (+1 on log, -1 on delete, and a full
 * client recompute on edit/resolve over a different window that counts
 * untrusted activities). The trigger's next recompute for that guest-week
 * overwrites them, but nothing re-triggers on its own: a client write that
 * lands after the trigger stays until that guest's next activity write in
 * that week. Re-running the backfill once old versions are retired is
 * therefore mandatory, not optional.
 *
 * Logs ids and counts only. Activity data (medication details, notes) is PHI.
 */
import { logger } from 'firebase-functions';
import { FieldValue } from 'firebase-admin/firestore';
import {
  ActivityLike,
  WeekAggregate,
  aggregateWeek,
  summaryDocId,
  toInstant,
  weekEndFor,
  weekStartFor,
  weekWindowUtc,
} from './weekSummaryMath';
import {
  Exclusions,
  GuestContext,
  HouseAdminCheck,
  claimsHouseAdminCheck,
  loadGuestContext,
  noExclusions,
  trustedActivities,
  trustedGuestFrom,
} from './activityTrust';

export { houseTimeZone } from './activityTrust';

type Firestore = FirebaseFirestore.Firestore;
type Data = Record<string, unknown>;

const DAY_MS = 86_400_000;
export const ACTIVITIES = 'activities';
export const WEEK_SUMMARIES = 'week-summaries';

export interface SummaryTarget {
  guestId: string;
  weekStart: string;
  timeZone: string;
}

export interface RecomputeOptions {
  /** false: report only, in a read-only transaction (backfill dry run). */
  write?: boolean;
  isHouseAdmin?: HouseAdminCheck;
}

export interface RecomputeResult {
  /** The guest doc is missing or has no house: nothing was computed. */
  skipped: boolean;
  changed: boolean;
  activityCount: number;
  excluded: Exclusions;
  nonNumericHours: number;
}

function sameAggregate(
  prev: Data,
  next: WeekAggregate,
  houseId: string,
  weekStart: string,
): boolean {
  if (
    prev.houseId !== houseId ||
    prev.startDate !== weekStart ||
    prev.endDate !== weekEndFor(weekStart) ||
    prev.activityCount !== next.activityCount
  ) {
    return false;
  }
  const stats = (prev.stats ?? {}) as Data;
  if (Object.entries(next.stats).some(([k, v]) => stats[k] !== v)) return false;

  const daily = (prev.dailyStats ?? {}) as Record<string, Data>;
  if (Object.keys(daily).length !== Object.keys(next.dailyStats).length) return false;
  return Object.entries(next.dailyStats).every(([date, day]) =>
    Object.entries(day).every(([k, v]) => daily[date]?.[k] === v),
  );
}

/**
 * Rebuild one guest-week summary from its trusted activities. Fields the
 * summary holds but this code does not own (e.g. phaseRequirementsMet) are
 * kept.
 */
export async function recomputeWeekSummary(
  db: Firestore,
  target: SummaryTarget,
  { write = true, isHouseAdmin = claimsHouseAdminCheck() }: RecomputeOptions = {},
): Promise<RecomputeResult> {
  const { guestId, weekStart, timeZone } = target;
  const id = summaryDocId(guestId, weekStart);
  // Widened by a day each side: aggregateWeek re-filters by weekStartFor, so
  // the result never depends on the exact UTC instant of local midnight
  // (skipped/ambiguous midnights in some historical zone transitions).
  const window = weekWindowUtc(weekStart, timeZone);
  const start = new Date(window.start.getTime() - DAY_MS);
  const end = new Date(window.end.getTime() + DAY_MS);
  const summaryRef = db.collection(WEEK_SUMMARIES).doc(id);
  const guestRef = db.collection('guests').doc(guestId);
  // Matches the existing (guestId ASC, timestamp DESC) composite index.
  const weekActivities = db
    .collection(ACTIVITIES)
    .where('guestId', '==', guestId)
    .where('timestamp', '>=', start)
    .where('timestamp', '<', end)
    .orderBy('timestamp', 'desc');

  const body = async (tx: FirebaseFirestore.Transaction): Promise<RecomputeResult> => {
    const activities = await tx.get(weekActivities);
    const guestSnap = await tx.get(guestRef);
    const existing = await tx.get(summaryRef);

    const guest = trustedGuestFrom(
      guestId,
      guestSnap.exists ? (guestSnap.data() as Data) : undefined,
    );
    if (!guest) {
      return {
        skipped: true,
        changed: false,
        activityCount: 0,
        excluded: noExclusions(),
        nonNumericHours: 0,
      };
    }
    const { trusted, excluded } = await trustedActivities(
      activities.docs.map((d) => d.data() as Data),
      guest,
      isHouseAdmin,
    );
    const next = aggregateWeek(trusted as ActivityLike[], weekStart, timeZone);
    const result = {
      skipped: false,
      activityCount: next.activityCount,
      excluded,
      nonNumericHours: next.nonNumericHours,
    };
    const prev = existing.exists ? (existing.data() as Data) : undefined;
    if (prev && sameAggregate(prev, next, guest.houseId, weekStart)) {
      return { ...result, changed: false };
    }
    if (!write) return { ...result, changed: true };

    tx.set(summaryRef, {
      ...(prev ?? {}),
      id,
      guestId,
      houseId: guest.houseId,
      startDate: weekStart,
      endDate: weekEndFor(weekStart),
      stats: next.stats,
      dailyStats: next.dailyStats,
      activityCount: next.activityCount,
      lastUpdated: FieldValue.serverTimestamp(),
    });
    return { ...result, changed: true };
  };

  // A dry run takes no write locks in production.
  return write ? db.runTransaction(body) : db.runTransaction(body, { readOnly: true });
}

/**
 * The fields that decide which summary an activity lands in and whether it
 * counts. Two versions with the same key contribute identically, so a write
 * that only changes anything else (verified, verifiedBy, loggedAt, notes) is
 * skipped.
 */
export function contributionKey(data: Data | undefined): string | null {
  if (!data) return null;
  const at = toInstant(data.timestamp);
  return JSON.stringify([
    data.guestId,
    data.houseId,
    data.loggedBy,
    at ? at.getTime() : null,
    data.status,
    data.type,
    (data.data as Data | null | undefined)?.hoursWorked ?? null,
  ]);
}

/**
 * Handle one activities/{activityId} write: recompute the summary the activity
 * was in before and the one it is in after (the same doc unless the timestamp
 * or guest changed). Weeks use the guest's house zone. A missing guest doc is
 * skipped and logged by id. A failure is rethrown so the event is retried; the
 * recompute is safe to repeat.
 */
export async function syncWeekSummariesForActivityWrite(
  db: Firestore,
  activityId: string,
  before: Data | undefined,
  after: Data | undefined,
  { isHouseAdmin = claimsHouseAdminCheck() }: { isHouseAdmin?: HouseAdminCheck } = {},
): Promise<{ recomputed: string[] }> {
  if (before && after && contributionKey(before) === contributionKey(after)) {
    return { recomputed: [] };
  }

  const guests = new Map<string, Promise<GuestContext | null>>();
  const targets = new Map<string, SummaryTarget>();
  for (const data of [after, before]) {
    if (!data || typeof data.guestId !== 'string' || data.guestId === '') continue;
    const at = toInstant(data.timestamp);
    if (!at) continue;
    const guestId = data.guestId;
    if (!guests.has(guestId)) guests.set(guestId, loadGuestContext(db, guestId));
    const guest = await guests.get(guestId)!;
    if (!guest) {
      logger.warn('week_summary.skipped_no_guest', { activityId, guestId });
      continue;
    }
    const weekStart = weekStartFor(at, guest.timeZone);
    const id = summaryDocId(guestId, weekStart);
    if (!targets.has(id)) targets.set(id, { guestId, weekStart, timeZone: guest.timeZone });
  }

  const recomputed: string[] = [];
  for (const [summaryId, target] of targets) {
    try {
      const r = await recomputeWeekSummary(db, target, { isHouseAdmin });
      logger.info('week_summary.recomputed', {
        activityId,
        summaryId,
        skipped: r.skipped,
        changed: r.changed,
        activityCount: r.activityCount,
        excludedOtherHouse: r.excluded.otherHouse,
        excludedUntrustedLogger: r.excluded.untrustedLogger,
      });
      if (!r.skipped) recomputed.push(summaryId);
    } catch (err) {
      logger.error('week_summary.recompute_failed', {
        activityId,
        summaryId,
        code: (err as { code?: unknown })?.code ?? null,
      });
      throw err;
    }
  }
  return { recomputed };
}
