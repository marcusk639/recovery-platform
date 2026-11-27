import { httpsCallable } from '@react-native-firebase/functions';
import { functions } from '../../firebase-setup';
import { logException } from '../util/logging';
import { asCents, Cents, centsToDollars, formatCents } from '../util/money';

export type CatalogHouseType = 'traditional' | 'oxford';

export interface CatalogTierPrice {
  amountCents: number;
}

export interface CatalogTier {
  houseType: CatalogHouseType;
  tier: string;
  label: string;
  maxResidents: number | null;
  maxProperties: number | null;
  availableForSale: boolean;
  prices: { month: CatalogTierPrice | null; year: CatalogTierPrice | null };
}

/** The public getTierCatalog response (regroup/functions callable/getTierCatalog.ts). */
export interface TierCatalogResponse {
  currency: string;
  tiers: CatalogTier[];
  /** Free-trial days a new subscription gets (the server's TRIAL_PERIOD_DAYS). */
  trialDays: number;
  /** Whether new subscriptions can start (config/sales.open). */
  salesOpen: boolean;
}

const isCatalog = (data: unknown): data is TierCatalogResponse => {
  const d = data as Partial<TierCatalogResponse> | null;
  return (
    !!d &&
    Array.isArray(d.tiers) &&
    typeof d.trialDays === 'number' &&
    typeof d.salesOpen === 'boolean'
  );
};

/**
 * The prices, trial length and sales switch the web checkout uses, so the app
 * never shows numbers of its own. Null on any error or a malformed response:
 * callers then show no price and no trial length.
 */
export async function getTierCatalog(): Promise<TierCatalogResponse | null> {
  try {
    const result = await httpsCallable(functions, 'getTierCatalog')({});
    return isCatalog(result.data) ? result.data : null;
  } catch (error) {
    logException(error);
    return null;
  }
}

/** The cheapest monthly price among the for-sale tiers of a house type. */
export const lowestMonthlyCents = (
  catalog: TierCatalogResponse | null | undefined,
  houseType: CatalogHouseType,
): Cents | null => {
  const amounts = (catalog?.tiers ?? [])
    .filter((t) => t.houseType === houseType && t.availableForSale)
    .map((t) => t.prices.month?.amountCents)
    .filter((cents): cents is number => typeof cents === 'number' && cents > 0);
  return amounts.length ? asCents(Math.min(...amounts)) : null;
};

/** `$49` for whole dollars, `$49.50` otherwise (the web pricing page's format). */
export const formatPlanPrice = (cents: Cents): string => {
  const dollars = centsToDollars(cents);
  return Number.isInteger(dollars) ? `$${dollars}` : formatCents(cents);
};
