import { onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { STRIPE_SECRET_KEY, SUBSCRIPTION_TIERS, HouseType, TierKey } from '../config';
import { stripe } from '../api/stripe';
import {
  getTier,
  resolveTierPriceId,
  isTierAvailableForSale,
  BillingInterval,
} from '../util/tierPricing';

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const BILLING_INTERVALS: BillingInterval[] = ['month', 'year'];

interface TierPrice {
  amountCents: number;
}

interface TierCatalogEntry {
  houseType: HouseType;
  tier: TierKey;
  label: string;
  maxResidents: number | null;
  maxProperties: number | null;
  features: {
    automatedRentCollection: boolean;
    multiProperty: boolean;
    complianceExport: boolean;
    analytics: boolean;
    whiteLabel: boolean;
  };
  availableForSale: boolean;
  prices: {
    month: TierPrice | null;
    year: TierPrice | null;
  };
}

export interface TierCatalogResponse {
  currency: 'usd';
  tiers: TierCatalogEntry[];
}

// Module-scope cache. Cold instances repopulate on their first invocation;
// TTL keeps warm instances from hitting Stripe on every request.
let cache: { data: TierCatalogResponse; expiresAt: number } | undefined;

/**
 * Resolves a single tier/interval price from Stripe. Never throws — a
 * missing env var or a failed Stripe lookup degrades that interval to
 * `null` rather than failing the whole catalog (e.g. an unconfigured
 * annual price must not take the monthly price down with it).
 */
async function resolvePrice(
  houseType: HouseType,
  tier: TierKey,
  interval: BillingInterval,
): Promise<TierPrice | null> {
  let priceId: string;
  try {
    priceId = resolveTierPriceId(houseType, tier, interval);
  } catch {
    logger.warn('getTierCatalog: no price id configured for interval', {
      houseType,
      tier,
      interval,
    });
    return null;
  }
  try {
    const price = await stripe.prices.retrieve(priceId);
    if (typeof price.unit_amount !== 'number') {
      logger.warn('getTierCatalog: Stripe price has no unit_amount', {
        houseType,
        tier,
        interval,
      });
      return null;
    }
    return { amountCents: price.unit_amount };
  } catch (err) {
    logger.error('getTierCatalog: failed to retrieve Stripe price', {
      houseType,
      tier,
      interval,
      error: err instanceof Error ? err.message : 'unknown error',
    });
    return null;
  }
}

async function buildCatalog(): Promise<TierCatalogResponse> {
  const tiers: TierCatalogEntry[] = [];
  const houseTypes = Object.keys(SUBSCRIPTION_TIERS) as HouseType[];
  for (const houseType of houseTypes) {
    const tierKeys = Object.keys(SUBSCRIPTION_TIERS[houseType]) as unknown as TierKey[];
    for (const tier of tierKeys) {
      const config = getTier(houseType, tier);
      const [month, year] = await Promise.all(
        BILLING_INTERVALS.map((interval) => resolvePrice(houseType, tier, interval)),
      );
      tiers.push({
        houseType,
        tier,
        label: config.label,
        maxResidents: config.maxResidents,
        maxProperties: config.maxProperties,
        features: { ...config.features },
        availableForSale: isTierAvailableForSale(houseType, tier),
        prices: { month, year },
      });
    }
  }
  return { currency: 'usd', tiers };
}

/**
 * Serves the public pricing catalog for the marketing/pricing page.
 *
 * Deliberately does NOT check `request.auth`, unlike every other callable in
 * this codebase: this is the same price list a logged-out visitor sees on
 * the public pricing page before creating an account, so there is no user
 * to authenticate. It returns only tier metadata and prices already
 * intended for public display — no user data, no Stripe price IDs, and no
 * secrets ever leave this function.
 */
export const getTierCatalog = onCall(
  { secrets: [STRIPE_SECRET_KEY] },
  async (): Promise<TierCatalogResponse> => {
    const now = Date.now();
    if (cache && cache.expiresAt > now) {
      return cache.data;
    }
    const data = await buildCatalog();
    cache = { data, expiresAt: now + CACHE_TTL_MS };
    return data;
  },
);
