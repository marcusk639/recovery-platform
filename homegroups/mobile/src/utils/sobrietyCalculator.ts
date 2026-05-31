/**
 * sobrietyCalculator.ts
 * Pure calculation utility — no Firebase, fully unit-testable.
 */

export interface SobrietyStats {
  totalDays: number;
  years: number;
  months: number;
  days: number;
  nextChipDays: number; // threshold of the next chip (e.g. 90)
  nextChipDate: Date; // calendar date when the next chip is earned
  daysUntilNextChip: number;
  pastChips: ChipRecord[]; // all chips already earned based on totalDays
}

export interface ChipRecord {
  days: number; // threshold
  label: string; // e.g. "90 Days" or "1 Year"
  earnedDate: Date;
}

export const CHIP_THRESHOLDS = [30, 60, 90, 180, 270, 365];
// After 365, next chip is at 730, 1095, 1460... (multiples of 365)

/**
 * Returns all chip thresholds up to and including any yearly milestones
 * needed given totalDays.
 */
export function getAllChipThresholds(totalDays: number): number[] {
  const base = [...CHIP_THRESHOLDS];
  // Add yearly milestones beyond 365
  let years = 2;
  while (years * 365 <= totalDays + 365) {
    base.push(years * 365);
    years++;
  }
  // Always include the next upcoming one
  if (!base.includes(totalDays + 1)) {
    let nextYearly = 730;
    while (nextYearly <= totalDays) {
      nextYearly += 365;
    }
    if (!base.includes(nextYearly)) {
      base.push(nextYearly);
    }
  }
  return base.sort((a, b) => a - b);
}

/**
 * Returns the threshold of the next chip the user will earn.
 */
export function getNextChipThreshold(totalDays: number): number {
  const thresholds = getAllChipThresholds(totalDays);
  const next = thresholds.find(t => t > totalDays);
  if (next !== undefined) return next;
  // Beyond all defined thresholds — next yearly
  const nextYear = Math.ceil((totalDays + 1) / 365) * 365;
  return nextYear;
}

/**
 * Formats a chip threshold into a human-readable label.
 */
export function formatChipLabel(days: number): string {
  if (days < 365) {
    return `${days} Days`;
  }
  const years = Math.round(days / 365);
  return years === 1 ? '1 Year' : `${years} Years`;
}

/**
 * Calculates all sobriety statistics from a given sobriety date.
 *
 * @param sobrietyDate - The date the person became sober
 * @param asOf - The reference date to calculate from (defaults to now)
 */
export function calculateSobrietyStats(
  sobrietyDate: Date,
  asOf?: Date,
): SobrietyStats {
  const reference = asOf || new Date();

  // Normalize to midnight to avoid timezone drift
  const start = new Date(
    Date.UTC(
      sobrietyDate.getFullYear(),
      sobrietyDate.getMonth(),
      sobrietyDate.getDate(),
    ),
  );
  const end = new Date(
    Date.UTC(
      reference.getFullYear(),
      reference.getMonth(),
      reference.getDate(),
    ),
  );

  const msPerDay = 1000 * 60 * 60 * 24;
  const totalDays = Math.max(
    0,
    Math.floor((end.getTime() - start.getTime()) / msPerDay),
  );

  // Break down into years, months, days
  const years = Math.floor(totalDays / 365);
  const remainingAfterYears = totalDays % 365;
  const months = Math.floor(remainingAfterYears / 30);
  const days = remainingAfterYears % 30;

  // Compute past chips earned
  const allThresholds = getAllChipThresholds(totalDays);
  const pastChips: ChipRecord[] = allThresholds
    .filter(t => t <= totalDays)
    .map(t => ({
      days: t,
      label: formatChipLabel(t),
      earnedDate: new Date(start.getTime() + t * msPerDay),
    }));

  // Next chip
  const nextChipDays = getNextChipThreshold(totalDays);
  const nextChipDate = new Date(start.getTime() + nextChipDays * msPerDay);
  const daysUntilNextChip = nextChipDays - totalDays;

  return {
    totalDays,
    years,
    months,
    days,
    nextChipDays,
    nextChipDate,
    daysUntilNextChip,
    pastChips,
  };
}
