export type ChartConditionStatus = 'pass' | 'fail' | 'insufficient_data';

export interface ChartCondition {
  status: ChartConditionStatus;
  /** Computed ratio (0–1) or count, depending on condition. */
  metric: number | null;
  /** Required threshold (e.g. 0.8 for 80%). */
  threshold: number;
  /** Human-readable explanation of the result. */
  detail: string;
}

export interface CharterComplianceSummary {
  overall: ChartConditionStatus;
  democratic: ChartCondition;
  financial: ChartCondition;
  zeroTolerance: ChartCondition;
  computedAt: string; // ISO timestamp
}

/** Immutable thresholds referenced by compute logic and detail UI. */
export const CHARTER_THRESHOLDS = {
  /** Minimum voting participation rate (80%). */
  democratic: 0.8,
  /** Minimum EES collection rate (90%). */
  financial: 0.9,
  /** Minimum closed votes required to compute participation. */
  minVotesRequired: 3,
  /** Window of past days to include closed votes. */
  recentVotesWindowDays: 90,
  /** Number of recent EES weeks to evaluate. */
  recentEesWeeks: 4,
  /** Window of past days to flag positive/refused drug tests. */
  drugTestWindowDays: 30,
  /** Days after a positive test within which an expulsion vote counts as "in progress". */
  expulsionGraceDays: 14,
} as const;
