import { SUBSCRIPTION_TIERS, HouseType, TierKey } from "../config";

interface TierConfig {
  priceEnvVar: string;
  annualPriceEnvVar?: string;
  amountCents: number;
  maxResidents: number | null;
  maxProperties: number | null;
  label: string;
}

export type BillingInterval = "month" | "year";

export const getTier = (houseType: HouseType, tier: TierKey): TierConfig => {
  const map = SUBSCRIPTION_TIERS[houseType] as unknown as Record<
    string,
    TierConfig
  >;
  const config = map?.[tier];
  if (!config) {
    throw new Error(`Unknown tier "${tier}" for houseType "${houseType}"`);
  }
  return config;
};

export const getTierAmountCents = (
  houseType: HouseType,
  tier: TierKey,
): number => getTier(houseType, tier).amountCents;

export const resolveTierPriceId = (
  houseType: HouseType,
  tier: TierKey,
  billingInterval: BillingInterval = "month",
): string => {
  const config = getTier(houseType, tier);
  const envVar =
    billingInterval === "year"
      ? config.annualPriceEnvVar
      : config.priceEnvVar;
  if (!envVar) {
    throw new Error(
      `No ${billingInterval} price env var configured for tier "${tier}" (houseType "${houseType}")`,
    );
  }
  const priceId = process.env[envVar];
  if (!priceId) {
    throw new Error(`Price ID not configured for env var: ${envVar}`);
  }
  return priceId;
};
