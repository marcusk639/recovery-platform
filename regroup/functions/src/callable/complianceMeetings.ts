/**
 * Meeting-attendance rows for the court compliance export (RG-SPEC-09).
 *
 * Every logged meeting is listed (deleted ones excepted: those were withdrawn),
 * with a Dispute column a court reader can act on, and with Counted and
 * Verified following the program's counting rule (countsTowardSummary):
 *
 *   Dispute "None"                          counted
 *   Dispute "Pending - counted until decided" counted
 *   Dispute "Rejected - counted"            counted
 *   Dispute "Successfully disputed - residents report not completed (not counted)"
 *                                           an APPROVED dispute: NOT counted,
 *                                           never shown Verified
 *   Dispute "Resolved - counted"            counted (records resolved before
 *                                           the approve/reject model)
 *   Dispute "Successfully disputed (before approve/reject) - residents report not completed (not counted)"
 *                                           a dispute upheld by the old
 *                                           "delete" resolution
 *
 * Only the resident's own records are listed, by the same trust rule as the
 * weekly summaries: the activity's house is the resident's house and it was
 * logged by the resident or a house admin. Dates are the house-local date
 * (the house's `timezone`, default as week summaries), not the UTC date.
 */
import {
  HouseAdminCheck,
  trustedActivities,
  trustedGuestFrom,
} from '../activities/activityTrust';
import { countsTowardSummary, localDateString, toInstant } from '../activities/weekSummaryMath';

type Data = Record<string, unknown>;

export interface MeetingRow {
  /** YYYY-MM-DD in the house's time zone. */
  date: string;
  meetingName: string;
  meetingType: string;
  duration: string | number;
  verified: boolean;
  counted: boolean;
  dispute: string;
  /** A note when an earlier dispute decision was undone (REOPEN); '' otherwise. */
  disputeHistory: string;
}

/**
 * A dispute upheld the old way: resolveDispute('delete') (before the
 * approve/reject model) set status deleted and wrote disputeResolvedAt and
 * loggedAt in the same write, so they are equal, and set no disputed /
 * incomplete. Anything else that is deleted — e.g. a resident deleting an
 * activity after a dispute was rejected, approved, or kept the old way, which
 * moves loggedAt on — is a withdrawal, not an upheld dispute, and is left out.
 * This label goes to courts, so it must not be applied by guesswork.
 */
const legacyUpheld = (m: Data) => {
  if (m.status !== 'deleted' || m.disputed !== undefined || m.incomplete !== undefined) return false;
  const resolvedAt = toInstant(m.disputeResolvedAt);
  const loggedAt = toInstant(m.loggedAt);
  return !!resolvedAt && !!loggedAt && resolvedAt.getTime() === loggedAt.getTime();
};

/**
 * Whether it is counted comes from the counting rule (countsTowardSummary),
 * never from `disputed` alone. A pending dispute, including one reopened by
 * an admin undoing a decision, counts until decided. An older build's "keep"
 * (resolved with no outcome) counts like a REJECT.
 */
export function disputeLabel(m: Data): string {
  if (legacyUpheld(m)) return 'Successfully disputed (before approve/reject) - residents report not completed (not counted)';
  if (m.status === 'disputed') return 'Pending - counted until decided';
  if (m.status !== 'resolved') return 'None';
  if (!countsTowardSummary(m)) return 'Successfully disputed - residents report not completed (not counted)';
  if (m.disputed === 'rejected') return 'Rejected - counted';
  if (m.disputed == null && m.disputeResult == null) return 'Rejected (kept) - counted';
  return 'Resolved - counted';
}

/**
 * The decision-history note for the export, from the server-written decision
 * log (activities/{id}/dispute-decisions, the trusted record; /disputes is a
 * client-writable legacy collection): the decisions an admin undid, if any.
 */
export function disputeHistoryNote(decisions: Data[]): string {
  const reopens = decisions
    .filter((d) => d.event === 'reopened')
    .map((d) => ({ at: toInstant(d.at), undid: typeof d.previousOutcome === 'string' ? d.previousOutcome : 'decision' }))
    .sort((a, b) => (a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0));
  if (reopens.length === 0) return '';
  const last = reopens[reopens.length - 1].at;
  // No commas: the cell stays unquoted in the CSV.
  const undone = reopens.map((r) => r.undid).join(' then ');
  return `Earlier decision${reopens.length > 1 ? 's' : ''} undone (${undone})${
    last ? `; last on ${last.toISOString().slice(0, 10)}` : ''
  }; the dispute was reopened`;
}

const hasDecisions = (m: Data) =>
  m.status === 'disputed' || m.status === 'resolved' || legacyUpheld(m) || m.reopenedBy != null;

export async function meetingRowsFor(
  resident: Data,
  residentId: string,
  meetings: Data[],
  opts: {
    timeZone: string;
    startDate?: string;
    endDate?: string;
    isHouseAdmin: HouseAdminCheck;
    /** Reads an activity's decision log (for the Dispute History column). */
    decisionsFor?: (activityId: string) => Promise<Data[]>;
  },
): Promise<MeetingRow[]> {
  const guest = trustedGuestFrom(residentId, resident);
  if (!guest) return [];
  const { trusted } = await trustedActivities(
    meetings,
    guest,
    opts.isHouseAdmin,
    // Deleted activities were withdrawn and are not listed, except disputes
    // upheld the old way (status deleted by resolveDispute, which also set
    // disputeResolvedAt): the court should see that record and its outcome.
    (a) => a.status !== 'deleted' || legacyUpheld(a),
  );

  const rows: Array<MeetingRow & { at: number }> = [];
  for (const m of trusted) {
    const at = toInstant(m.timestamp) ?? toInstant(m.loggedAt);
    if (!at) continue;
    const date = localDateString(at, opts.timeZone);
    if (opts.startDate && date < opts.startDate) continue;
    if (opts.endDate && date > opts.endDate) continue;
    const data = (m.data ?? {}) as Data;
    const counted = countsTowardSummary(m);
    const decisions =
      opts.decisionsFor && typeof m.id === 'string' && hasDecisions(m) ? await opts.decisionsFor(m.id) : [];
    rows.push({
      at: at.getTime(),
      date,
      meetingName: typeof data.meetingName === 'string' ? data.meetingName : '',
      meetingType: typeof data.meetingType === 'string' ? data.meetingType : '',
      duration: typeof data.duration === 'number' || typeof data.duration === 'string' ? data.duration : '',
      verified: counted && m.verified === true,
      counted,
      dispute: disputeLabel(m),
      disputeHistory: disputeHistoryNote(decisions),
    });
  }
  return rows.sort((a, b) => a.at - b.at).map(({ at: _at, ...row }) => row);
}
