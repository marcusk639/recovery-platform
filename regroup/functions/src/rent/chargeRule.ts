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
 * charging turned on, imported residents, and anyone entered after it whose move-in
 * date is before it, start at a full period (spec §2); everyone else from their
 * move-in date.
 */
export function chargeFromFor(f: ChargeFromFacts): string {
  if (f.importedOn) return nextPeriodStart(maxDate(f.importedOn, f.startDate), f.frequency);
  if (f.houseJoinedAtMs < f.startedAtMs) return nextPeriodStart(f.startDate, f.frequency);
  // Living there before charging began but entered after it (an import without its
  // marker, a late intake, or a move-in date that can't be read): like any resident
  // already there at turn-on, they start at a full period, after the day they were entered.
  if (f.joinDate === null || f.joinDate < f.startDate) {
    return nextPeriodStart(maxDate(f.recordedOn, f.startDate), f.frequency);
  }
  return f.joinDate;
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
