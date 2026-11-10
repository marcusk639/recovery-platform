/** Shared types and limits for rent charges. Amounts are integer cents unless named Dollars. */
import { Cents } from '../util/money';

export type RentFrequency = 'weekly' | 'monthly';

/** A house price above this is treated as a mistake (cents typed as dollars): charging is off. */
export const MAX_HOUSE_PRICE_DOLLARS = 10000;
/** The same guard for a weekly price, so $80/week typed as 8000 is caught too. */
export const MAX_WEEKLY_PRICE_DOLLARS = 2500;

/** The highest believable price, in dollars, for one period of `frequency`. */
export function maxPriceDollars(frequency: RentFrequency): number {
  return frequency === 'weekly' ? MAX_WEEKLY_PRICE_DOLLARS : MAX_HOUSE_PRICE_DOLLARS;
}

/** Most periods one call may charge, so a long outage catches up in bounded steps. */
export const MAX_PERIODS_PER_RUN = 12;

/** A house's charging settings, present only while charging is on. */
export interface RentSettings {
  frequency: RentFrequency;
  priceCents: Cents;
  timeZone: string;
  /** House-local date charging last turned on; null until the house trigger stamps it. */
  startDate: string | null;
  startedAtMs: number | null;
}

/** A manager-set rate for one resident, valid only while the house uses `frequency`. */
export interface CustomRent {
  amountCents: Cents;
  frequency: RentFrequency;
}

/** One period's charge: [from, through] inclusive, prorated over daysInPeriod. */
export interface PlannedCharge {
  from: string;
  through: string;
  daysCovered: number;
  daysInPeriod: number;
  amountCents: Cents;
}

/** What decides the first chargeable day of a resident. */
export interface ChargeFromFacts {
  /** House-local date charging turned on. */
  startDate: string;
  startedAtMs: number;
  /** When this record joined the house: its createTime, or the move time. */
  houseJoinedAtMs: number;
  /** House-local move-in date; null when the stored one can't be read (assumed earlier). */
  joinDate: string | null;
  /** House-local date the record joined the house (its createTime, or the move time). */
  recordedOn: string;
  /** House-local import date, for residents added by guest import. */
  importedOn: string | null;
  frequency: RentFrequency;
}

/** rentAccounts/{guestId}: server-only, so no client form can write an older chargedThrough back. */
export interface RentAccount {
  guestId: string;
  houseId: string;
  /** When this record joined its current house (createTime, or the move time). */
  houseJoinedAtMs: number;
  /** House-local date the resident joined the current house. */
  joinedOn: string | null;
  /** House-local date of the last re-activation after a discharge. */
  reactivatedOn: string | null;
  /** House-local date of the last discharge or move-out (guest-write trigger). */
  inactiveSince?: string | null;
  /** The house rentHouseStates startDate that chargeFrom was computed against. */
  anchoredTo: string;
  /** First chargeable day. Frozen once anchored, so a schedule switch never skips or doubles a day. */
  chargeFrom: string;
  /** Last day charged for; null before the first charge. */
  chargedThrough: string | null;
  /** The house that made the last charge. A move keeps chargedThrough but not this. */
  chargedHouseId?: string | null;
  updatedAtMs: number;
}

export type ChargeOutcome =
  | { status: 'charged'; totalCents: Cents; periods: number }
  | {
      status: 'skipped';
      reason:
        | 'paused'
        | 'missing'
        | 'inactive'
        | 'linked'
        | 'charging-off'
        | 'not-started'
        | 'not-due'
        | 'bad-rate'
        | 'bad-balance';
    };

/** rentHouseStates/{houseId}: server-only, so the app's whole-house writes never carry it. */
export interface RentHouseState {
  /** House-local date charging last turned on; null while it is off. */
  startDate: string | null;
  startedAtMs: number | null;
  /** When charging was last turned off, so a late 'on' event can't date the start earlier. */
  clearedAtMs?: number | null;
  updatedAtMs: number;
}
