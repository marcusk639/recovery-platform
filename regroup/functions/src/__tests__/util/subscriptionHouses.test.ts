import {
  addHousesToSubscription,
  removeHouseFromSubscription,
} from '../../util/subscriptionHouses';

const NOW = new Date('2026-10-20T00:00:00Z');
const base = {
  tier: 'starter',
  houseType: 'traditional',
  maxProperties: 1,
  houses: {},
} as any;
const pro = {
  tier: 'professional',
  houseType: 'traditional',
  maxProperties: 3,
  houses: {},
} as any;

describe('addHousesToSubscription', () => {
  it('adds a first house with zero guests and stamps lastUpdatedAt', () => {
    const out = addHousesToSubscription(base, ['h1'], NOW);
    expect(out.houses).toEqual({ h1: { numberOfGuests: 0 } });
    expect(out.lastUpdatedAt).toBe(NOW.toISOString());
  });

  it('does not mutate the input metadata', () => {
    addHousesToSubscription(base, ['h1'], NOW);
    expect(base.houses).toEqual({});
  });

  it('rejects a second house on a tier without multiProperty', () => {
    expect(() =>
      addHousesToSubscription({ ...base, houses: { h1: { numberOfGuests: 2 } } }, ['h2']),
    ).toThrow('Your plan does not include multiple properties — upgrade to add more houses');
  });

  it('rejects a house past maxProperties on a multi-property tier', () => {
    const full = {
      ...pro,
      houses: {
        a: { numberOfGuests: 0 },
        b: { numberOfGuests: 0 },
        c: { numberOfGuests: 0 },
      },
    };
    expect(() => addHousesToSubscription(full, ['d'])).toThrow(
      'Property limit reached for your plan',
    );
  });

  it('rejects a batch that would exceed the cap partway through', () => {
    expect(() => addHousesToSubscription(pro, ['a', 'b', 'c', 'd'])).toThrow(
      'Property limit reached for your plan',
    );
  });

  it('treats an id already present as a no-op and keeps its guest count', () => {
    const out = addHousesToSubscription(
      { ...base, houses: { h1: { numberOfGuests: 4 } } },
      ['h1'],
      NOW,
    );
    expect(out.houses).toEqual({ h1: { numberOfGuests: 4 } });
  });

  it('denies multi-property when tierAllows throws (fail-closed)', () => {
    expect(() =>
      addHousesToSubscription(
        {
          ...base,
          houseType: 'bogus',
          houses: { h1: { numberOfGuests: 0 } },
        },
        ['h2'],
      ),
    ).toThrow('Your plan does not include multiple properties — upgrade to add more houses');
  });
});

describe('removeHouseFromSubscription', () => {
  it('removes the house and stamps lastUpdatedAt', () => {
    const out = removeHouseFromSubscription(
      { ...base, houses: { h1: { numberOfGuests: 1 }, h2: { numberOfGuests: 0 } } },
      'h1',
      NOW,
    );
    expect(out.houses).toEqual({ h2: { numberOfGuests: 0 } });
    expect(out.lastUpdatedAt).toBe(NOW.toISOString());
  });
});
