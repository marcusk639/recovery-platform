/**
 * The charge rule (spec §4.3): every charge covers from the later of the day after
 * chargedThrough and chargeFrom, to the end of that period, prorated by days.
 */
import { addDays } from '../activities/weekSummaryMath';
import { asCents, Cents } from '../util/money';
import { daysInclusive, maxDate, nextPeriodStart, periodFor } from './period';
import { ChargeFromFacts, MAX_PERIODS_PER_RUN, PlannedCharge, RentFrequency } from './types';

/**
 * The first day a resident can be charged for. Residents already in the house when
 * charging turned on, and imported residents, start at the next full period (spec §2);
 * everyone else from their move-in date, never before charging began.
 */
export function chargeFromFor(f: ChargeFromFacts): string {
  if (f.importedOn) return nextPeriodStart(maxDate(f.importedOn, f.startDate), f.frequency);
  if (f.houseJoinedAtMs < f.startedAtMs) return nextPeriodStart(f.startDate, f.frequency);
  return maxDate(f.joinDate, f.startDate);
}

export function nextChargeDay(a: { chargeFrom: string; chargedThrough: string | null }): string {
  return a.chargedThrough ? maxDate(addDays(a.chargedThrough, 1), a.chargeFrom) : a.chargeFrom;
}

/** Charges due on or before `today`, oldest first, at most `maxPeriods` of them. */
export function planCharges(p: {
  chargeFrom: string;
  chargedThrough: string | null;
  today: string;
  frequency: RentFrequency;
  rateCents: Cents;
  maxPeriods?: number;
}): PlannedCharge[] {
  const limit = p.maxPeriods ?? MAX_PERIODS_PER_RUN;
  const out: PlannedCharge[] = [];
  let day = nextChargeDay(p);
  while (day <= p.today && out.length < limit) {
    const period = periodFor(day, p.frequency);
    const daysCovered = daysInclusive(day, period.end);
    out.push({
      from: day,
      through: period.end,
      daysCovered,
      daysInPeriod: period.days,
      amountCents: asCents(Math.round((p.rateCents * daysCovered) / period.days)),
    });
    day = addDays(period.end, 1);
  }
  return out;
}
