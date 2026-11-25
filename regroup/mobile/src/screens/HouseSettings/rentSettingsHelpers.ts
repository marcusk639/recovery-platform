/**
 * Rent settings (rent spec §4.1, §4.2). house.weeklyRent / house.monthlyRent are
 * DOLLARS; a resident's customRent.amountCents and every charge are CENTS. Convert
 * only through util/money.
 */
import { centsToDollars, Cents, Dollars, parseDollarsField } from '../../util/money';
import type { House } from '../../entities/House';

/** 'off' is the house's rentFrequency 'both': charging is off. */
export type RentSchedule = 'weekly' | 'monthly' | 'off';

/** The rules' and the server's limits, in dollars (firestore.rules houses, rent/types.ts). */
export const MAX_RENT_DOLLARS = { weekly: 2500, monthly: 10000 } as const;

type HouseRent = Partial<Pick<House, 'rentFrequency' | 'weeklyRent' | 'monthlyRent'>>;

export function scheduleOf(house: HouseRent): RentSchedule {
  return house.rentFrequency === 'weekly' || house.rentFrequency === 'monthly'
    ? house.rentFrequency
    : 'off';
}

const priceField = (schedule: 'weekly' | 'monthly') =>
  schedule === 'weekly' ? 'weeklyRent' : 'monthlyRent';

/** The stored price for the schedule, as the text the price field starts with. */
export function initialPriceText(house: HouseRent, schedule: RentSchedule): string {
  if (schedule === 'off') return '';
  const stored = house[priceField(schedule)];
  return typeof stored === 'number' && stored > 0 ? String(stored) : '';
}

export type ParsedRentPrice =
  { ok: true; dollars: Dollars; cents: Cents } | { ok: false; message: string };

export function parseRentPrice(raw: string, schedule: 'weekly' | 'monthly'): ParsedRentPrice {
  const parsed = parseDollarsField(raw);
  if (!parsed.ok) {
    return {
      ok: false,
      message: parsed.reason === 'blank' ? 'Enter a price' : 'Enter a price like 175 or 175.50',
    };
  }
  if (parsed.cents <= 0) return { ok: false, message: 'Enter a price above $0' };
  const max = MAX_RENT_DOLLARS[schedule];
  if (parsed.cents > max * 100) {
    return {
      ok: false,
      message: `A ${schedule} price can be at most $${max.toLocaleString('en-US')}`,
    };
  }
  return { ok: true, dollars: centsToDollars(parsed.cents), cents: parsed.cents };
}

/** The house fields one save writes. Off keeps the prices, so turning back on restores them. */
export function rentUpdateFor(schedule: RentSchedule, dollars?: Dollars): Partial<House> {
  if (schedule === 'off' || dollars === undefined) return { rentFrequency: 'both' };
  return { rentFrequency: schedule, [priceField(schedule)]: dollars };
}

type GuestRent = {
  id?: string;
  firstName?: string;
  lastName?: string;
  status?: string;
  moveOutDate?: string;
  customRent?: { amountCents: number; frequency: 'weekly' | 'monthly' } | null;
};

export interface StaleCustomRate {
  guestId: string;
  label: string;
  amountCents: number;
  frequency: 'weekly' | 'monthly';
}

// Who the charge job charges: functions util/guestMembership isActiveGuestDoc.
const isChargeable = (g: GuestRent) =>
  !g.moveOutDate && (g.status === undefined || g.status === 'active');

/**
 * Active residents whose own rate was set for the other schedule: it is not used
 * while the house charges on `schedule` (rent spec §4.2), so the manager can set it
 * again. Nobody's while charging is off.
 */
export function staleCustomRates(
  guests: Record<string, GuestRent>,
  schedule: RentSchedule,
): StaleCustomRate[] {
  if (schedule === 'off') return [];
  return Object.entries(guests)
    .filter(([, g]) => isChargeable(g) && !!g.customRent && g.customRent.frequency !== schedule)
    .map(([id, g]) => ({
      guestId: g.id || id,
      label: [g.firstName, g.lastName].filter(Boolean).join(' ') || 'Resident',
      amountCents: g.customRent!.amountCents,
      frequency: g.customRent!.frequency,
    }));
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Mon, Nov 23" for a house-local YYYY-MM-DD, read as a calendar date (no zone shift). */
export function formatRentDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WEEKDAYS[weekday]}, ${MONTHS[m - 1]} ${d}`;
}
