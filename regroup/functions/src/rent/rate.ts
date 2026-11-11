/** A house's rent settings and a resident's rate, read defensively from raw docs. */
import { resolveTimeZone } from '../activities/weekSummaryMath';
import { asCents, asDollars, Cents, dollarsToCents } from '../util/money';
import { maxPriceDollars, RentFrequency, RentSettings } from './types';

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isFrequency(v: unknown): v is RentFrequency {
  return v === 'weekly' || v === 'monthly';
}

/**
 * Null means charging is off: an Oxford house, no weekly/monthly schedule, or that
 * schedule's price is not a finite number in (0, maxPriceDollars(frequency)]. A string or
 * a cents-sized value is off, never charged. The start stamp comes from the house's
 * server-only state doc (rentHouseStates/{houseId}).
 */
export function rentSettingsOf(
  house: Record<string, unknown>,
  state?: Record<string, unknown> | null,
): RentSettings | null {
  // Oxford houses pay the equal expense share their members set (ees-records), never
  // a manager's price, so price-based charging is always off there.
  if (house.houseType === 'oxford') return null;
  const frequency = house.rentFrequency;
  if (!isFrequency(frequency)) return null;
  const raw = frequency === 'weekly' ? house.weeklyRent : house.monthlyRent;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  if (raw <= 0 || raw > maxPriceDollars(frequency)) return null;
  const startDate = state?.startDate;
  const startedAtMs = state?.startedAtMs;
  return {
    frequency,
    priceCents: dollarsToCents(asDollars(raw)),
    timeZone: resolveTimeZone(house.timezone).timeZone,
    startDate: typeof startDate === 'string' && CALENDAR_DATE.test(startDate) ? startDate : null,
    startedAtMs:
      typeof startedAtMs === 'number' && Number.isFinite(startedAtMs) ? startedAtMs : null,
  };
}

/**
 * The resident's custom rate when it is well formed and set for the current schedule,
 * else the house price. Null when the custom rate is above that schedule's price limit:
 * the caller skips the resident rather than guess.
 */
export function residentRate(
  guest: Record<string, unknown>,
  settings: RentSettings,
): { rateCents: Cents; source: 'house' | 'custom' } | null {
  const custom = guest.customRent as { amountCents?: unknown; frequency?: unknown } | null;
  if (
    custom &&
    typeof custom === 'object' &&
    custom.frequency === settings.frequency &&
    typeof custom.amountCents === 'number' &&
    Number.isInteger(custom.amountCents) &&
    custom.amountCents >= 0
  ) {
    if (custom.amountCents > maxPriceDollars(settings.frequency) * 100) return null;
    return { rateCents: asCents(custom.amountCents), source: 'custom' };
  }
  return { rateCents: settings.priceCents, source: 'house' };
}
