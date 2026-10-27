/**
 * The append-only dispute decision log: activities/{id}/dispute-decisions.
 *
 * Owner decision: dispute decisions can be undone (REOPEN), but no decision
 * is ever lost. Every decision is logged by the onActivityWritten trigger,
 * from the event payload (a decision is a fact about that write):
 *   - decided_{disputeResolvedAt ms}: approved | rejected | kept (an old
 *     build's "keep") | deleted (an old build's "delete", or the doc removed
 *     by the Admin SDK), with who and when;
 *   - reopened_{reopenedAt ms}: reopened, by whom, when, and the outcome it
 *     undid (previousOutcome).
 * The rules let an admin REOPEN only once decided_{disputeResolvedAt ms}
 * exists, so the decision being undone is always logged first. The log is
 * written in the same transaction as the /disputes archive
 * (houseDisputeMirror). Clients can neither read nor write it.
 */
import { createHash } from 'crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { toInstant } from './weekSummaryMath';

type Data = Record<string, unknown>;

export const DECISIONS = 'dispute-decisions';

export type DecisionOutcome = 'approved' | 'rejected' | 'kept' | 'deleted';
export type DecisionEvent = DecisionOutcome | 'reopened';

export interface Decision {
  id: string;
  data: {
    event: DecisionEvent;
    by: string | null;
    at: Timestamp;
    previousOutcome: DecisionOutcome | null;
    disputeStamp: string;
  };
}

const stringOrNull = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

/** Milliseconds of a Firestore Timestamp (as the rules' toMillis()), Date or ISO string. */
export function millisOf(v: unknown): number | null {
  if (v && typeof (v as { toMillis?: unknown }).toMillis === 'function') {
    return (v as { toMillis: () => number }).toMillis();
  }
  return toInstant(v)?.getTime() ?? null;
}

export function leavesDispute(before: Data | undefined, after: Data | undefined): boolean {
  return before?.status === 'disputed' && after?.status !== 'disputed';
}

/** REOPEN: a decision (or an old build's "delete") back to `disputed`. */
export function isReopen(before: Data | undefined, after: Data | undefined): boolean {
  return (
    after?.status === 'disputed' && (before?.status === 'resolved' || before?.status === 'deleted')
  );
}

/** The outcome an activity's current state records. */
export function outcomeOf(activity: Data | undefined): DecisionOutcome {
  if (!activity || activity.status === 'deleted') return 'deleted';
  if (activity.disputed === 'successful' || activity.incomplete === true) return 'approved';
  if (activity.disputed === 'rejected') return 'rejected';
  return 'kept';
}

/**
 * Identifies one dispute on an activity: who raised it, why, and when
 * (disputedAt, which the rules pin to the server time of the entering write;
 * empty for older builds). A REOPEN changes none of the three, so a reopened
 * dispute keeps its stamp. A hash, so the reason text is not repeated.
 */
export function disputeStamp(activity: Data): string {
  const disputer =
    stringOrNull(activity.disputedBy) || stringOrNull(activity.disputeResolvedBy) || '';
  const reason = typeof activity.disputeReason === 'string' ? activity.disputeReason : '';
  const nonce = millisOf(activity.disputedAt) ?? '';
  return createHash('sha256').update(`${disputer}\n${reason}\n${nonce}`).digest('hex').slice(0, 16);
}

/** The decision a write that leaves `disputed` records (null for any other write). */
export function closingDecision(
  before: Data | undefined,
  after: Data | undefined,
  now: string,
): Decision | null {
  if (!before || !leavesDispute(before, after)) return null;
  const at = millisOf(after?.disputeResolvedAt) ?? Date.parse(now);
  return {
    id: `decided_${at}`,
    data: {
      event: outcomeOf(after),
      by: after ? stringOrNull(after.disputeResolvedBy) : null,
      at: Timestamp.fromMillis(at),
      previousOutcome: null,
      disputeStamp: disputeStamp(before),
    },
  };
}

/** The decision a REOPEN records (null for any other write). */
export function reopenDecision(
  before: Data | undefined,
  after: Data | undefined,
  now: string,
): Decision | null {
  if (!after || !isReopen(before, after)) return null;
  const at = millisOf(after.reopenedAt) ?? Date.parse(now);
  return {
    id: `reopened_${at}`,
    data: {
      event: 'reopened',
      by: stringOrNull(after.reopenedBy),
      at: Timestamp.fromMillis(at),
      previousOutcome: outcomeOf(before),
      disputeStamp: disputeStamp(after),
    },
  };
}
