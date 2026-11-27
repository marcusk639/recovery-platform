export type HouseType = 'traditional' | 'oxford';

export type BillingInterval = 'month' | 'year';

export interface TierPrice {
  amountCents: number;
}

export interface TierFeatures {
  automatedRentCollection: boolean;
  multiProperty: boolean;
  complianceExport: boolean;
  analytics: boolean;
  whiteLabel: boolean;
}

export interface TierCatalogEntry {
  houseType: HouseType;
  tier: string;
  label: string;
  maxResidents: number | null;
  maxProperties: number | null;
  features: TierFeatures;
  availableForSale: boolean;
  prices: {
    month: TierPrice | null;
    year: TierPrice | null;
  };
}

export interface TierCatalog {
  currency: string;
  tiers: TierCatalogEntry[];
  /** Free-trial days a new subscription gets (the server's TRIAL_PERIOD_DAYS). */
  trialDays: number;
  /** Whether new subscriptions can start (the server's config/sales.open). */
  salesOpen: boolean;
}

/** Query params `/signup` reads to pre-select a tier. */
export interface TierSelection {
  houseType: HouseType;
  tier: string;
  period: BillingInterval;
}
