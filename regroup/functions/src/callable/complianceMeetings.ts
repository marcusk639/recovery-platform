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
 *   Dispute "Approved - not counted"        NOT counted, never shown Verified
 *   Dispute "Resolved - counted"            counted (records resolved before
 *                                           the approve/reject model)
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
}

export function disputeLabel(m: Data): string {
  if (m.incomplete === true || m.disputed === 'successful') return 'Approved - not counted';
  if (m.disputed === 'rejected') return 'Rejected - counted';
  if (m.status === 'disputed') return 'Pending - counted until decided';
  if (m.status === 'resolved') return 'Resolved - counted';
  return 'None';
}

export async function meetingRowsFor(
  resident: Data,
  residentId: string,
  meetings: Data[],
  opts: {
    timeZone: string;
    startDate?: string;
    endDate?: string;
    isHouseAdmin: HouseAdminCheck;
  },
): Promise<MeetingRow[]> {
  const guest = trustedGuestFrom(residentId, resident);
  if (!guest) return [];
  const { trusted } = await trustedActivities(
    meetings,
    guest,
    opts.isHouseAdmin,
    (a) => a.status !== 'deleted',
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
    rows.push({
      at: at.getTime(),
      date,
      meetingName: typeof data.meetingName === 'string' ? data.meetingName : '',
      meetingType: typeof data.meetingType === 'string' ? data.meetingType : '',
      duration: typeof data.duration === 'number' || typeof data.duration === 'string' ? data.duration : '',
      verified: counted && m.verified === true,
      counted,
      dispute: disputeLabel(m),
    });
  }
  return rows.sort((a, b) => a.at - b.at).map(({ at: _at, ...row }) => row);
}
