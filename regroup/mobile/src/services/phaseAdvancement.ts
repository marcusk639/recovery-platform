/**
 * Phase Advancement Service
 *
 * Evaluates whether a guest qualifies for phase advancement based on
 * consecutive weeks of compliance with their current phase rules.
 * Advancement requires admin approval — this service only determines
 * eligibility, it does not auto-promote.
 */
import { firestore } from '../../firebase-setup';
import { Guest } from '../entities/Guest';
import { House } from '../entities/House';
import { PhaseConfiguration, Phases } from '../entities/Phase';
import { WeekSummary } from '../entities/WeekSummary';
import { checkPhaseCompliance } from '../util/compliance';
import { sortPhases } from '../util/house';
import { logException } from '../util/logging';

/** Minimum consecutive compliant weeks required for advancement */
const DEFAULT_REQUIRED_WEEKS = 4;

export interface AdvancementEligibility {
  eligible: boolean;
  guestId: string;
  guestName: string;
  currentPhase: string;
  nextPhase: string | null;
  compliantWeeks: number;
  requiredWeeks: number;
  /** true when the guest is already on the highest-order phase */
  isMaxPhase: boolean;
}

/**
 * Get the next phase in order for a given phase name.
 * Returns null if the guest is already on the highest phase.
 */
export function getNextPhase(
  currentPhaseName: string,
  phases: Phases,
): PhaseConfiguration | null {
  const sorted = sortPhases(phases);
  const currentIndex = sorted.findIndex(p => p.name === currentPhaseName);
  if (currentIndex === -1 || currentIndex >= sorted.length - 1) {
    return null;
  }
  return sorted[currentIndex + 1];
}

/**
 * Fetch the last N week summaries for a guest, ordered by startDate descending.
 */
async function getRecentWeekSummaries(
  guestId: string,
  limit: number,
): Promise<WeekSummary[]> {
  const snapshot = await firestore
    .collection('week-summaries')
    .where('guestId', '==', guestId)
    .orderBy('startDate', 'desc')
    .limit(limit)
    .get();
  return snapshot.docs.map(doc => doc.data() as WeekSummary);
}

/**
 * Count how many of the most recent weeks are fully compliant
 * with the given phase rules. Stops at the first non-compliant week.
 */
function countConsecutiveCompliantWeeks(
  summaries: WeekSummary[],
  phases: Phases,
  currentPhaseName: string,
): number {
  const phaseConfig = phases[currentPhaseName];
  if (!phaseConfig?.rules) return 0;

  let count = 0;
  for (const summary of summaries) {
    const result = checkPhaseCompliance(summary, phaseConfig.rules);
    if (!result.compliant) break;
    count++;
  }
  return count;
}

/**
 * Check whether a guest is eligible for phase advancement.
 *
 * A guest is eligible when:
 * 1. They have a valid current phase in the house configuration
 * 2. There is a next phase (they're not on the highest phase)
 * 3. They have been compliant for >= requiredWeeks consecutive weeks
 */
export async function checkAdvancementEligibility(
  guest: Guest,
  house: House,
  requiredWeeks: number = DEFAULT_REQUIRED_WEEKS,
): Promise<AdvancementEligibility> {
  const currentPhaseName = String(guest.phase);
  const nextPhase = getNextPhase(currentPhaseName, house.phases);
  const isMaxPhase = nextPhase === null;

  const base: AdvancementEligibility = {
    eligible: false,
    guestId: guest.id,
    guestName: guest.displayName || `${guest.firstName} ${guest.lastName}`,
    currentPhase: currentPhaseName,
    nextPhase: nextPhase?.name ?? null,
    compliantWeeks: 0,
    requiredWeeks,
    isMaxPhase,
  };

  if (isMaxPhase) return base;

  try {
    const summaries = await getRecentWeekSummaries(guest.id, requiredWeeks);
    const compliantWeeks = countConsecutiveCompliantWeeks(
      summaries,
      house.phases,
      currentPhaseName,
    );

    return {
      ...base,
      compliantWeeks,
      eligible: compliantWeeks >= requiredWeeks,
    };
  } catch (error) {
    logException(error);
    return base;
  }
}

/**
 * Advance a guest to the next phase. Called after admin approval.
 */
export async function advanceGuestPhase(
  guestId: string,
  nextPhaseName: string,
): Promise<void> {
  await firestore.collection('guests').doc(guestId).update({
    phase: nextPhaseName,
    updatedAt: new Date().toISOString(),
  });
}
