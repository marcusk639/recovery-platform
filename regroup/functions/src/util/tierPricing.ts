import { SUBSCRIPTION_TIERS, HouseType, TierKey } from "../config";

// Capability flags that express the value ladder (justification §6b). Each maps
// to a real feature or a Phase-5 stub — never gate vaporware beyond a flag.
export type TierFeatureKey =
  | "automatedRentCollection"
  | "multiProperty"
  | "complianceExport"
  | "analytics"
  | "whiteLabel";

type TierFeatures = { [K in TierFeatureKey]: boolean };

interface TierConfig {
  priceEnvVar: string;
  annualPriceEnvVar?: string;
  amountCents: number;
  maxResidents: number | null;
  maxProperties: number | null;
  label: string;
  features: TierFeatures;
  // Absent ⇒ sellable. Set false to keep a tier defined but block checkout (P-8).
  availableForSale?: boolean;
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
    billingInterval === "year" ? config.annualPriceEnvVar : config.priceEnvVar;
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

// Whether a tier includes a given capability (value-ladder gate, P-7). Used to
// gate features at their real invocation site — compose with cap enforcement,
// do not replace it.
export const tierAllows = (
  houseType: HouseType,
  tier: TierKey,
  feature: TierFeatureKey,
): boolean => getTier(houseType, tier).features[feature];

// P-8: a tier with availableForSale === false is defined but not sellable.
// Absent flag ⇒ sellable.
export const isTierAvailableForSale = (
  houseType: HouseType,
  tier: TierKey,
): boolean => getTier(houseType, tier).availableForSale !== false;
