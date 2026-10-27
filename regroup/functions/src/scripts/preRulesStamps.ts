/**
 * The pre-rules part of backfillDisputeIdentity (--verify-stamps, or
 * --rules-live-at <ISO>): which activities to re-check, the strict cutoff,
 * and the report.
 *
 * Cutoff. Rules take up to ~10 minutes to propagate after `firebase deploy`
 * returns, so the safe cutoff is the time the backfill STARTS, run at least
 * 10 minutes after the merged ruleset deploy finished: --verify-stamps uses
 * exactly that ("now"). A later cutoff is safe: an activity created between
 * the rules going live and the backfill was created under the new rules
 * (any stamp checked against the guest doc), so re-deriving it finds a match
 * (left alone) or an empty stamp to fill; with #145's rules a guest's userId
 * never changes once set, so a correct stamp never "differs". An explicit
 * --rules-live-at must be ISO 8601 with Z or an offset, not in the future,
 * and not before 2026-10-01 (nothing of this deploy existed earlier).
 *
 * Decisions. dispute-decisions entries dated before the cutoff and not
 * backfilled were logged by the server from client writes made under the old
 * rules, so they are no more trusted than backfilled ones. The logs are
 * write-once and are not rewritten or flagged: they are listed in the report
 * (activity/decision ids) for the owner, and documented as such.
 */
import { millisOf } from '../activities/disputeDecisions';
import { hasDisputeHistory } from '../activities/residentStamp';
import { verifyStamp } from '../activities/stampVerification';

type Firestore = FirebaseFirestore.Firestore;
type Data = Record<string, unknown>;

export const CUTOFF_FLOOR = new Date('2026-10-01T00:00:00Z');
const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;

/** Parses an explicit --rules-live-at strictly; throws with the reason. */
export function parseCutoff(value: string, now: Date = new Date()): Date {
  if (!ISO_WITH_ZONE.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error('--rules-live-at must be ISO 8601 with Z or an explicit offset');
  }
  const at = new Date(value);
  if (at.getTime() > now.getTime()) throw new Error('--rules-live-at is in the future');
  if (at.getTime() < CUTOFF_FLOOR.getTime()) {
    throw new Error(`--rules-live-at is before ${CUTOFF_FLOOR.toISOString()}`);
  }
  return at;
}

export interface PreRulesReport {
  checked: number;
  restamped: string[];
  flagged: string[];
  skipped: string[];
  guestMissing: string[];
  preRulesDecisions: string[];
}

export const emptyPreRulesReport = (): PreRulesReport => ({
  checked: 0,
  restamped: [],
  flagged: [],
  skipped: [],
  guestMissing: [],
  preRulesDecisions: [],
});

/** Whether the activity was created before the cutoff (unknown counts as before). */
export function createdBefore(createTimeMs: number | undefined, data: Data, cutoff: Date): boolean {
  const created = createTimeMs ?? millisOf(data.loggedAt);
  return created === null || created < cutoff.getTime();
}

/** Re-checks one activity's stamp and lists its pre-cutoff decisions. */
export async function checkPreRules(
  db: Firestore,
  id: string,
  data: Data,
  cutoff: Date,
  apply: boolean,
  report: PreRulesReport,
): Promise<void> {
  report.checked++;
  const check = await verifyStamp(db, id, data, apply);
  if (check === 'restamped' || check === 'filled') report.restamped.push(id);
  if (check === 'flagged') report.flagged.push(id);
  if (check === 'skipped') report.skipped.push(id);
  if (check === 'guestMissing') report.guestMissing.push(id);
  if (!hasDisputeHistory(data)) return;
  const log = await db.collection('activities').doc(id).collection('dispute-decisions').get();
  for (const d of log.docs) {
    const e = d.data() as Data;
    const at = millisOf(e.at);
    if (e.backfilled !== true && at !== null && at < cutoff.getTime()) {
      report.preRulesDecisions.push(`${id}/${d.id}`);
    }
  }
}

export function printPreRulesReport(report: PreRulesReport, apply: boolean): void {
  const list = (ids: string[]) => ids.join(', ') || '(none)';
  console.log(`${apply ? 'Re-stamped' : 'Would re-stamp'} (pre-rules): ${list(report.restamped)}`);
  console.log(
    `Stamp differs on a disputed activity, ${apply ? 'flagged' : 'would flag'} for the owner's review: ${list(report.flagged)}`,
  );
  console.log(`Skipped (guest changed or activity gone meanwhile): ${list(report.skipped)}`);
  console.log(`Pre-rules activities with no guest doc: ${list(report.guestMissing)}`);
  console.log(
    `Decisions logged before the cutoff, not backfilled (as trusted as backfilled ones): ${list(report.preRulesDecisions)}`,
  );
}
