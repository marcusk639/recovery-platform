/**
 * tierCatalog.ts against the normalized Firebase operation log.
 *
 * Launch P5 Task 12: the app reads prices, the trial length and the sales
 * switch from the getTierCatalog callable, and returns null on any failure so
 * no screen shows a number the server didn't give. Prices are integer cents.
 */
jest.mock('../../../firebase-setup', () => require('../../../__mocks__/firebase-modular/setup'));
jest.mock('@react-native-firebase/functions', () =>
  require('../../../__mocks__/firebase-modular/functions'),
);
const mockLogException = jest.fn();
jest.mock('../../util/logging', () => ({
  logException: (...args: unknown[]) => mockLogException(...args),
}));

import { failNext, getOpLog, resetOpLog, seedCall } from '../../../__mocks__/firebase-modular/log';
import {
  formatPlanPrice,
  getTierCatalog,
  lowestMonthlyCents,
  TierCatalogResponse,
} from '../tierCatalog';
import { asCents } from '../../util/money';

const tier = (
  houseType: 'traditional' | 'oxford',
  name: string,
  monthCents: number | null,
  availableForSale = true,
) => ({
  houseType,
  tier: name,
  label: name,
  maxResidents: 15,
  maxProperties: 1,
  availableForSale,
  prices: { month: monthCents === null ? null : { amountCents: monthCents }, year: null },
});

const catalog: TierCatalogResponse = {
  currency: 'usd',
  tiers: [
    tier('traditional', 'starter', 6900),
    tier('oxford', 'plus', 8900),
    tier('oxford', 'standard', 4900),
    tier('oxford', 'network', 2900, false),
  ],
  trialDays: 7,
  salesOpen: true,
};

beforeEach(() => {
  resetOpLog();
  mockLogException.mockClear();
});

describe('getTierCatalog', () => {
  it('calls getTierCatalog with an empty payload and returns the response', async () => {
    seedCall('getTierCatalog', catalog);

    await expect(getTierCatalog()).resolves.toEqual(catalog);
    expect(getOpLog()).toEqual([{ op: 'call', path: 'getTierCatalog', data: {} }]);
  });

  it('returns null, and reports it, when the callable fails', async () => {
    failNext('call', new Error('unavailable'), 'getTierCatalog');

    await expect(getTierCatalog()).resolves.toBeNull();
    expect(mockLogException).toHaveBeenCalledTimes(1);
  });

  it('returns null for a response without trialDays or salesOpen', async () => {
    seedCall('getTierCatalog', { currency: 'usd', tiers: [] });

    await expect(getTierCatalog()).resolves.toBeNull();
  });
});

describe('lowestMonthlyCents', () => {
  it('is the cheapest for-sale monthly price of the house type, in cents', () => {
    expect(lowestMonthlyCents(catalog, 'oxford')).toBe(4900);
    expect(lowestMonthlyCents(catalog, 'traditional')).toBe(6900);
  });

  it('skips tiers not for sale and tiers with no monthly price', () => {
    const onlyUnpriced = {
      ...catalog,
      tiers: [tier('oxford', 'standard', null), tier('oxford', 'network', 2900, false)],
    };
    expect(lowestMonthlyCents(onlyUnpriced, 'oxford')).toBeNull();
  });

  it('is null without a catalog', () => {
    expect(lowestMonthlyCents(null, 'oxford')).toBeNull();
  });
});

describe('formatPlanPrice', () => {
  it('drops the cents for whole dollars and keeps them otherwise', () => {
    expect(formatPlanPrice(asCents(4900))).toBe('$49');
    expect(formatPlanPrice(asCents(4950))).toBe('$49.50');
  });
});
