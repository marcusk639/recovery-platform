import { SUBSCRIPTION_TIERS, HouseType, TierKey } from "../config";

interface TierConfig {
  priceEnvVar: string;
  amountCents: number;
  maxResidents: number | null;
  maxProperties: number | null;
  label: string;
}

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
): string => {
  const { priceEnvVar } = getTier(houseType, tier);
  const priceId = process.env[priceEnvVar];
  if (!priceId) {
    throw new Error(`Price ID not configured for env var: ${priceEnvVar}`);
  }
  return priceId;
};
