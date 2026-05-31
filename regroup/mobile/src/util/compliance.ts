import type { WeekSummary } from '../entities/WeekSummary';
import type { PhaseRule } from '../entities/Phase';
import type { Guest } from '../entities/Guest';
import type { House } from '../entities/House';

/**
 * Detailed result of a phase compliance check for a single week.
 */
export interface ComplianceResult {
  compliant: boolean;
  requirements: {
    meetings: { required: number; actual: number; met: boolean };
    hoursWorked: { required: number; actual: number; met: boolean };
    choresCompleted: { required: number; actual: number; met: boolean };
    medicationTaken: { required: boolean; actual: boolean; met: boolean };
    primarySupporterMet: { required: boolean; actual: boolean; met: boolean };
  };
}

/**
 * Determine whether a guest took their medication this week.
 *
 * When medication is required, at least one MEDICATION activity must have
 * been logged during the week (medicationTaken >= 1).
 *
 * @param weekSummary - The pre-aggregated weekly stats for the guest
 * @param phaseRules  - The rules of the phase the guest is on
 * @returns true when the medication requirement is satisfied
 */
export function checkMedicationCompliance(
  weekSummary: WeekSummary,
  phaseRules: PhaseRule,
): boolean {
  if (!phaseRules.medications) {
    // Not required — always compliant
    return true;
  }
  return weekSummary.stats.medicationTaken >= 1;
}

/**
 * Check a guest's full phase compliance for the given week.
 *
 * Each requirement is evaluated independently so callers can surface exactly
 * which rules were not met.
 *
 * @param weekSummary - The pre-aggregated weekly stats for the guest
 * @param phase       - The phase rules to check against
 * @returns A `ComplianceResult` with per-requirement detail
 */
export function checkPhaseCompliance(
  weekSummary: WeekSummary,
  phase: PhaseRule,
): ComplianceResult {
  const stats = weekSummary.stats;

  const meetingsMet = stats.meetingsAttended >= phase.meetings;
  const hoursWorkedMet = stats.hoursWorked >= phase.work;
  // chore is a boolean flag: if required, at least one chore must be logged
  const choresRequired = phase.chore ? 1 : 0;
  const choresCompleted = stats.choresCompleted;
  const choresCompletedMet =
    choresRequired === 0 || choresCompleted >= choresRequired;

  // medication: required = phaseRules.medications; actual = at least one taken
  const medicationRequired = phase.medications;
  const medicationActual = stats.medicationTaken >= 1;
  const medicationMet = !medicationRequired || medicationActual;

  // supporter: required = phase.supporter; actual = at least one meeting
  const supporterRequired = phase.supporter;
  const supporterActual = stats.primarySupporterMet >= 1;
  const supporterMet = !supporterRequired || supporterActual;

  const compliant =
    meetingsMet &&
    hoursWorkedMet &&
    choresCompletedMet &&
    medicationMet &&
    supporterMet;

  return {
    compliant,
    requirements: {
      meetings: {
        required: phase.meetings,
        actual: stats.meetingsAttended,
        met: meetingsMet,
      },
      hoursWorked: {
        required: phase.work,
        actual: stats.hoursWorked,
        met: hoursWorkedMet,
      },
      choresCompleted: {
        required: choresRequired,
        actual: choresCompleted,
        met: choresCompletedMet,
      },
      medicationTaken: {
        required: medicationRequired,
        actual: medicationActual,
        met: medicationMet,
      },
      primarySupporterMet: {
        required: supporterRequired,
        actual: supporterActual,
        met: supporterMet,
      },
    },
  };
}

/**
 * Resolve a guest's current phase rules from the house phase configuration.
 *
 * A guest's `phase` field holds the name key into the house's `phases` map
 * (e.g. "Entry", "Normal").  Returns `null` when the phase cannot be found.
 */
function resolveGuestPhaseRules(guest: Guest, house: House): PhaseRule | null {
  const phaseName = String(guest.phase);
  const phaseConfig = house.phases?.[phaseName];
  return phaseConfig?.rules ?? null;
}

/**
 * High-level compliance status for display / flagging purposes.
 *
 * Returns:
 * - `'incomplete-data'` – week summary is missing or the guest's phase is not
 *   found in the house configuration (can't evaluate)
 * - `'compliant'`       – all phase requirements are met
 * - `'non-compliant'`   – at least one phase requirement is not met
 */
export function getComplianceStatus(
  guest: Guest,
  weekSummary: WeekSummary | null | undefined,
  house: House,
): 'compliant' | 'non-compliant' | 'incomplete-data' {
  if (!weekSummary) {
    return 'incomplete-data';
  }

  const phaseRules = resolveGuestPhaseRules(guest, house);
  if (!phaseRules) {
    return 'incomplete-data';
  }

  const result = checkPhaseCompliance(weekSummary, phaseRules);
  return result.compliant ? 'compliant' : 'non-compliant';
}
