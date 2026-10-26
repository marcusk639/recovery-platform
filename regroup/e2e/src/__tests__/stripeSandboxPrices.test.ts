import { ensureCatalog } from '../stripeSandbox';
import { makeStripe } from './helpers/mockStripe';

describe('ensureCatalog archived prices', () => {
  it('fails loudly when an archived price already holds the lookup_key, creating nothing for it', async () => {
    const { mock, stripe, prices } = makeStripe();
    prices['regroup_tier_trad_starter_monthly'] = {
      id: 'price_archived',
      lookup_key: 'regroup_tier_trad_starter_monthly',
      active: false,
      unit_amount: 6900,
      recurring: { interval: 'month' },
      product: 'regroup_tier_trad_starter',
    };
    await expect(ensureCatalog(stripe)).rejects.toThrow(
      /archived.*regroup_tier_trad_starter_monthly|regroup_tier_trad_starter_monthly.*archived/,
    );
    const createdKeys = mock.prices.create.mock.calls.map((c: any) => c[0].lookup_key);
    expect(createdKeys).not.toContain('regroup_tier_trad_starter_monthly');
  });

  it('asks Stripe for archived prices explicitly, not via the list default', async () => {
    const { mock, stripe } = makeStripe();
    await ensureCatalog(stripe);
    const actives = mock.prices.list.mock.calls.map((c: any) => c[0].active);
    expect(actives).toContain(false);
    expect(actives).toContain(true);
  });
});
