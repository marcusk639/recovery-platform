/** Shared types and limits for rent charges. Amounts are integer cents unless named Dollars. */
import { Cents } from '../util/money';

export type RentFrequency = 'weekly' | 'monthly';

/** A house price above this is treated as a mistake (cents typed as dollars): charging is off. */
export const MAX_HOUSE_PRICE_DOLLARS = 10000;

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
