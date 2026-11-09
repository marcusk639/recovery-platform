/** Shared types and limits for rent charges. Amounts are integer cents unless named Dollars. */

export type RentFrequency = 'weekly' | 'monthly';

/** A house price above this is treated as a mistake (cents typed as dollars): charging is off. */
export const MAX_HOUSE_PRICE_DOLLARS = 10000;

/** Most periods one call may charge, so a long outage catches up in bounded steps. */
export const MAX_PERIODS_PER_RUN = 12;
