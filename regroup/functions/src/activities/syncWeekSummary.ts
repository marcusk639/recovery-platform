/**
 * Server-side maintenance of `week-summaries/{guestId}_{weekStart}`.
 *
 * Every activity write recomputes the affected guest-week from the activities
 * themselves, inside one Admin SDK transaction that reads the week's activities
 * and the summary and then writes the summary (creating it when missing).
 *
 * Why recompute rather than apply a +1/-1 delta with a ledger of applied
 * activity ids:
 *   - Idempotent by construction: a re-delivered event recomputes the same
 *     numbers, and an unchanged summary is not rewritten at all.
 *   - Order-independent: the transaction reads the activities as they are now,
 *     not the event payload, so out-of-order delivery still converges.
 *   - Self-healing during rollout: app versions before this change still apply
 *     their own +1 to the summary. Because the trigger writes absolute values,
 *     a stray client increment is overwritten by the next recompute instead of
 *     being added to.
 *   - No ledger to grow inside the summary doc, and no ledger to seed for the
 *     summaries that already exist.
 * The cost is one read per activity in that guest-week per event (tens, not
 * thousands: one guest, one week).
 *
 * Logs ids and counts only. Activity data (medication details, notes) is PHI.
 */
import { logger } from 'firebase-functions';
import { FieldValue } from 'firebase-admin/firestore';
import {
  ActivityLike,
  WeekAggregate,
  aggregateWeek,
  resolveTimeZone,
  summaryDocId,
  toInstant,
  weekEndFor,
  weekStartFor,
  weekWindowUtc,
} from './weekSummaryMath';

type Firestore = FirebaseFirestore.Firestore;
type Data = Record<string, unknown>;

export const ACTIVITIES = 'activities';
export const WEEK_SUMMARIES = 'week-summaries';

export interface SummaryTarget {
  guestId: string;
  houseId: string;
  weekStart: string;
  timeZone: string;
}

/** The house's IANA zone, or the default when it is unset, invalid or gone. */
export async function houseTimeZone(db: Firestore, houseId: string): Promise<string> {
  const snap = houseId ? await db.collection('houses').doc(houseId).get() : undefined;
  const { timeZone, fallback } = resolveTimeZone(snap?.data()?.timezone);
  if (fallback) logger.warn('week_summary.timezone_fallback', { houseId, timeZone });
  return timeZone;
}

function sameAggregate(prev: Data, next: WeekAggregate, target: SummaryTarget): boolean {
  if (
    prev.houseId !== target.houseId ||
    prev.startDate !== target.weekStart ||
    prev.endDate !== weekEndFor(target.weekStart) ||
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
 * Rebuild one guest-week summary from its activities. Fields the summary
 * holds but this code does not own (e.g. phaseRequirementsMet) are kept.
 * `write: false` only reports whether it would change (backfill dry run).
 */
export async function recomputeWeekSummary(
  db: Firestore,
  target: SummaryTarget,
  { write = true }: { write?: boolean } = {},
): Promise<{ changed: boolean; activityCount: number }> {
  const { guestId, houseId, weekStart, timeZone } = target;
  const id = summaryDocId(guestId, weekStart);
  const { start, end } = weekWindowUtc(weekStart, timeZone);
  const summaryRef = db.collection(WEEK_SUMMARIES).doc(id);
  // Matches the existing (guestId ASC, timestamp DESC) composite index.
  const weekActivities = db
    .collection(ACTIVITIES)
    .where('guestId', '==', guestId)
    .where('timestamp', '>=', start)
    .where('timestamp', '<', end)
    .orderBy('timestamp', 'desc');

  return db.runTransaction(async (tx) => {
    const activities = await tx.get(weekActivities);
    const existing = await tx.get(summaryRef);
    const next = aggregateWeek(
      activities.docs.map((d) => d.data() as ActivityLike),
      weekStart,
      timeZone,
    );
    const prev = existing.exists ? (existing.data() as Data) : undefined;
    if (prev && sameAggregate(prev, next, target)) {
      return { changed: false, activityCount: next.activityCount };
    }
    if (!write) return { changed: true, activityCount: next.activityCount };

    tx.set(summaryRef, {
      ...(prev ?? {}),
      id,
      guestId,
      houseId,
      startDate: weekStart,
      endDate: weekEndFor(weekStart),
      stats: next.stats,
      dailyStats: next.dailyStats,
      activityCount: next.activityCount,
      lastUpdated: FieldValue.serverTimestamp(),
    });
    return { changed: true, activityCount: next.activityCount };
  });
}

/**
 * The fields that decide which summary an activity lands in and what it adds.
 * Two versions with the same key contribute identically, so a write that only
 * changes anything else (verified, verifiedBy, loggedAt, notes) is skipped.
 */
export function contributionKey(data: Data | undefined): string | null {
  if (!data) return null;
  const at = toInstant(data.timestamp);
  return JSON.stringify([
    data.guestId,
    data.houseId,
    at ? at.getTime() : null,
    data.status,
    data.type,
    (data.data as Data | null | undefined)?.hoursWorked ?? null,
  ]);
}

async function targetFor(db: Firestore, data: Data | undefined): Promise<SummaryTarget | null> {
  if (!data || typeof data.guestId !== 'string' || data.guestId === '') return null;
  const at = toInstant(data.timestamp);
  if (!at) return null;
  const houseId = typeof data.houseId === 'string' ? data.houseId : '';
  const timeZone = await houseTimeZone(db, houseId);
  return { guestId: data.guestId, houseId, weekStart: weekStartFor(at, timeZone), timeZone };
}

/**
 * Handle one activities/{activityId} write: recompute the summary the activity
 * was in before and the one it is in after (the same doc unless the timestamp
 * or guest changed). A failure is rethrown so the event is retried; the
 * recompute is safe to repeat.
 */
export async function syncWeekSummariesForActivityWrite(
  db: Firestore,
  activityId: string,
  before: Data | undefined,
  after: Data | undefined,
): Promise<{ recomputed: string[] }> {
  if (before && after && contributionKey(before) === contributionKey(after)) {
    return { recomputed: [] };
  }

  const targets = new Map<string, SummaryTarget>();
  // `after` first, so a summary both versions map to takes the current houseId.
  for (const data of [after, before]) {
    const t = await targetFor(db, data);
    const id = t && summaryDocId(t.guestId, t.weekStart);
    if (t && id && !targets.has(id)) targets.set(id, t);
  }

  const recomputed: string[] = [];
  for (const [summaryId, target] of targets) {
    try {
      const { changed, activityCount } = await recomputeWeekSummary(db, target);
      logger.info('week_summary.recomputed', { activityId, summaryId, changed, activityCount });
      recomputed.push(summaryId);
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
