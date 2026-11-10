export type HouseType = 'traditional' | 'oxford';
export type BillingInterval = 'month' | 'year';

export interface OperatorPlan {
  houseType: HouseType;
  tier: string;
  interval: BillingInterval;
}

// Source: regroup/functions/src/config.ts SUBSCRIPTION_TIERS, without the tiers marked
// availableForSale: false. A test keeps the two in step.
export const PLANS_FOR_SALE: Readonly<Record<HouseType, readonly string[]>> = {
  traditional: ['starter', 'professional', 'enterprise'],
  oxford: ['standard', 'plus'],
};

const HOUSE_TYPES = Object.keys(PLANS_FOR_SALE) as HouseType[];
const INTERVALS: readonly BillingInterval[] = ['month', 'year'];
const FLAGS = ['--house-type', '--tier', '--interval'] as const;

export const USAGE =
  'Usage: npm run e2e:staging-operator -- --house-type <traditional|oxford> --tier <tier> [--interval <month|year>]';

const refuse = (message: string): never => {
  throw new Error(`${message}\n${USAGE}`);
};

export function parseOperatorArgs(argv: readonly string[]): OperatorPlan {
  const values: Partial<Record<(typeof FLAGS)[number], string>> = {};
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i] as (typeof FLAGS)[number];
    if (!FLAGS.includes(flag)) refuse(`Unknown argument ${argv[i]}.`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) refuse(`${flag} needs a value.`);
    values[flag] = value;
  }

  const houseType = values['--house-type'];
  if (!houseType) return refuse('--house-type is required.');
  if (!HOUSE_TYPES.includes(houseType as HouseType)) {
    refuse(`Unknown house type ${houseType}. Choose one of: ${HOUSE_TYPES.join(', ')}.`);
  }
  const tiers = PLANS_FOR_SALE[houseType as HouseType];

  const tier = values['--tier'];
  if (!tier) return refuse(`--tier is required. For ${houseType}: ${tiers.join(', ')}.`);
  if (!tiers.includes(tier)) {
    refuse(`${tier} is not a ${houseType} plan for sale. Choose one of: ${tiers.join(', ')}.`);
  }

  const interval = values['--interval'] ?? 'month';
  if (!INTERVALS.includes(interval as BillingInterval)) {
    refuse(`Unknown interval ${interval}. Choose one of: ${INTERVALS.join(', ')}.`);
  }

  return { houseType: houseType as HouseType, tier, interval: interval as BillingInterval };
}
