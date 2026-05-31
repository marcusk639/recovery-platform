import {
  ChartCondition,
  CharterComplianceSummary,
  ChartConditionStatus,
  CHARTER_THRESHOLDS,
} from '../../entities/oxford/CharterCompliance';
import { Vote } from '../../entities/oxford/Vote';
import { BusinessMeeting } from '../../entities/oxford/BusinessMeeting';
import { FinancialRecord } from '../../entities/oxford/FinancialRecord';
import { DrugTest } from '../../entities/DrugTest';
import { EESRecord } from './ees';

// ─── Condition 1: Democratic Self-Governance ──────────────────────────────────

/**
 * Computes whether the house meets the democratic self-governance condition.
 *
 * Eligible-voter count per vote:
 * - If the vote has a matching meeting, use meeting.attendees.length.
 * - Otherwise use activeResidentCount.
 * Anonymous votes use sum of vote.results values as numerator.
 */
export function computeDemocraticCondition(
  votes: Vote[],
  meetings: BusinessMeeting[],
  activeResidentCount: number,
  now: Date = new Date(),
): ChartCondition {
  const windowMs =
    CHARTER_THRESHOLDS.recentVotesWindowDays * 24 * 60 * 60 * 1000;
  const cutoff = new Date(now.getTime() - windowMs);

  const closedVotes = votes.filter(v => {
    if (!v.closedAt) return false;
    return new Date(v.closedAt) >= cutoff;
  });

  if (closedVotes.length < CHARTER_THRESHOLDS.minVotesRequired) {
    return {
      status: 'insufficient_data',
      metric: null,
      threshold: CHARTER_THRESHOLDS.democratic,
      detail: `Only ${closedVotes.length} of the ${CHARTER_THRESHOLDS.minVotesRequired} required recent votes found to compute participation.`,
    };
  }

  const meetingMap = new Map<string, BusinessMeeting>(
    meetings.map(m => [m.id, m]),
  );

  const participationRates: number[] = [];
  for (const vote of closedVotes) {
    let eligibleCount = activeResidentCount;
    if (vote.meetingId) {
      const meeting = meetingMap.get(vote.meetingId);
      if (meeting && meeting.attendees.length > 0) {
        eligibleCount = meeting.attendees.length;
      }
    }
    if (eligibleCount === 0) continue;

    let voterCount: number;
    if (vote.isAnonymous) {
      voterCount = Object.values(vote.results).reduce((s, n) => s + n, 0);
    } else {
      voterCount = Object.keys(vote.individualVotes ?? {}).length;
    }
    participationRates.push(voterCount / eligibleCount);
  }

  if (participationRates.length === 0) {
    return {
      status: 'insufficient_data',
      metric: null,
      threshold: CHARTER_THRESHOLDS.democratic,
      detail: 'Could not determine eligible voter counts for recent votes.',
    };
  }

  const avgRate =
    participationRates.reduce((s, r) => s + r, 0) / participationRates.length;
  const status: ChartConditionStatus =
    avgRate >= CHARTER_THRESHOLDS.democratic ? 'pass' : 'fail';
  const pct = Math.round(avgRate * 100);

  return {
    status,
    metric: avgRate,
    threshold: CHARTER_THRESHOLDS.democratic,
    detail:
      status === 'pass'
        ? `Average participation is ${pct}% across ${participationRates.length} recent votes.`
        : `Average participation is ${pct}% — below the required ${Math.round(
            CHARTER_THRESHOLDS.democratic * 100,
          )}%.`,
  };
}

// ─── Condition 2: Financial Self-Sufficiency ──────────────────────────────────

/**
 * Computes whether the house meets the financial self-sufficiency condition.
 *
 * Passes when:
 *   - EES collection rate across recent weeks >= 90%, AND
 *   - The latest financial record has endingCheckingBalance >= 0
 *
 * Returns insufficient_data when there are no EES records AND no financial record.
 */
export function computeFinancialCondition(
  recentEesRecords: (EESRecord & { id: string })[],
  latestFinancialRecord: FinancialRecord | null | undefined,
): ChartCondition {
  const hasEes = recentEesRecords.length > 0;
  const hasFinancial = !!latestFinancialRecord;

  if (!hasEes && !hasFinancial) {
    return {
      status: 'insufficient_data',
      metric: null,
      threshold: CHARTER_THRESHOLDS.financial,
      detail: 'No EES records or financial report found for recent weeks.',
    };
  }

  let eesRate: number | null = null;
  if (hasEes) {
    const paid = recentEesRecords.filter(r => r.paid).length;
    eesRate = paid / recentEesRecords.length;
  }

  const balanceCovered =
    !hasFinancial || (latestFinancialRecord?.endingCheckingBalance ?? 0) >= 0;

  const eesOk = eesRate === null || eesRate >= CHARTER_THRESHOLDS.financial;

  if (!hasEes && hasFinancial) {
    const status: ChartConditionStatus = balanceCovered ? 'pass' : 'fail';
    return {
      status,
      metric: null,
      threshold: CHARTER_THRESHOLDS.financial,
      detail:
        status === 'pass'
          ? 'Checking balance is non-negative.'
          : 'Checking balance is negative — house may not be covering expenses.',
    };
  }

  const status: ChartConditionStatus =
    eesOk && balanceCovered ? 'pass' : 'fail';
  const pct = eesRate !== null ? Math.round(eesRate * 100) : null;

  let detail: string;
  if (status === 'pass') {
    detail = `EES collection is ${pct}% and the checking balance is non-negative.`;
  } else if (!eesOk && !balanceCovered) {
    detail = `EES collection is ${pct}% (needs ${Math.round(
      CHARTER_THRESHOLDS.financial * 100,
    )}%) and the checking balance is negative.`;
  } else if (!eesOk) {
    detail = `EES collection is ${pct}% — below the required ${Math.round(
      CHARTER_THRESHOLDS.financial * 100,
    )}%.`;
  } else {
    detail =
      'Checking balance is negative — house may not be covering expenses.';
  }

  return {
    status,
    metric: eesRate,
    threshold: CHARTER_THRESHOLDS.financial,
    detail,
  };
}

// ─── Condition 3: Zero Tolerance ──────────────────────────────────────────────

/**
 * Computes whether all positive/refused drug tests in the past 30 days have a
 * corresponding expulsion vote initiated within the grace period.
 *
 * A drug test is "addressed" if there is an expulsion-type vote created within
 * `CHARTER_THRESHOLDS.expulsionGraceDays` days AFTER the test date, for the
 * same house. Tests on guests no longer in the house (not in inHouseGuestIds)
 * are skipped.
 */
export function computeZeroToleranceCondition(
  drugTests: DrugTest[],
  votes: Vote[],
  inHouseGuestIds: Set<string>,
  now: Date = new Date(),
): ChartCondition {
  const windowMs = CHARTER_THRESHOLDS.drugTestWindowDays * 24 * 60 * 60 * 1000;
  const cutoff = new Date(now.getTime() - windowMs);
  const graceMs = CHARTER_THRESHOLDS.expulsionGraceDays * 24 * 60 * 60 * 1000;

  const flaggedTests = drugTests.filter(t => {
    if (t.result !== 'positive' && t.result !== 'refused') return false;
    if (!inHouseGuestIds.has(t.guestId)) return false;
    return new Date(t.testDate) >= cutoff;
  });

  if (flaggedTests.length === 0) {
    return {
      status: 'pass',
      metric: 0,
      threshold: 0,
      detail: 'No positive or refused drug tests in the past 30 days.',
    };
  }

  const expulsionVotes = votes.filter(v => v.type === 'expulsion');

  const unaddressedTests = flaggedTests.filter(test => {
    const testDate = new Date(test.testDate);
    return !expulsionVotes.some(v => {
      const voteDate = new Date(v.createdAt);
      return (
        voteDate >= testDate &&
        voteDate.getTime() - testDate.getTime() <= graceMs
      );
    });
  });

  const status: ChartConditionStatus =
    unaddressedTests.length === 0 ? 'pass' : 'fail';

  return {
    status,
    metric: unaddressedTests.length,
    threshold: 0,
    detail:
      status === 'pass'
        ? `${flaggedTests.length} flagged test(s) each have a pending expulsion vote within ${CHARTER_THRESHOLDS.expulsionGraceDays} days.`
        : `${unaddressedTests.length} positive/refused drug test(s) lack an expulsion vote within ${CHARTER_THRESHOLDS.expulsionGraceDays} days.`,
  };
}

// ─── Aggregator ───────────────────────────────────────────────────────────────

export interface CharterComplianceInputs {
  votes: Vote[];
  meetings: BusinessMeeting[];
  activeResidentCount: number;
  recentEesRecords: (EESRecord & { id: string })[];
  latestFinancialRecord: FinancialRecord | null | undefined;
  drugTests: DrugTest[];
  inHouseGuestIds: Set<string>;
  now?: Date;
}

export function computeCharterCompliance(
  inputs: CharterComplianceInputs,
): CharterComplianceSummary {
  const now = inputs.now ?? new Date();

  const democratic = computeDemocraticCondition(
    inputs.votes,
    inputs.meetings,
    inputs.activeResidentCount,
    now,
  );
  const financial = computeFinancialCondition(
    inputs.recentEesRecords,
    inputs.latestFinancialRecord,
  );
  const zeroTolerance = computeZeroToleranceCondition(
    inputs.drugTests,
    inputs.votes,
    inputs.inHouseGuestIds,
    now,
  );

  const conditions = [democratic, financial, zeroTolerance];
  let overall: ChartConditionStatus;
  if (conditions.some(c => c.status === 'fail')) {
    overall = 'fail';
  } else if (conditions.every(c => c.status === 'pass')) {
    overall = 'pass';
  } else {
    overall = 'insufficient_data';
  }

  return {
    overall,
    democratic,
    financial,
    zeroTolerance,
    computedAt: now.toISOString(),
  };
}
