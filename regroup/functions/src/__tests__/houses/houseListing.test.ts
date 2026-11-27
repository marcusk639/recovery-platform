// A house's public listing (EMU-009, owner decision 2026-11-27): what a
// signed-out visitor may see of a house, and nothing else.
import { planHouseListing, toHouseListing } from '../../houses/houseListing';

const house = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'h1',
  name: 'E2E Test House',
  subscriptionStatus: 'active',
  isDemoHouse: false,
  geohash: '9v6kpmrz2',
  lat: 30.2672,
  lng: -97.7431,
  street: '100 Test St',
  city: 'Austin',
  state: 'TX',
  zip: '78701',
  gender: 'male',
  houseType: 'traditional',
  certified: true,
  baths: 2,
  wifi: true,
  maximumCapacity: 10,
  currentCapacity: 7,
  monthlyRent: 800,
  weeklyRent: 200,
  rentFrequency: 'both',
  phoneNumber: '512-555-0100',
  phases: { Default: { name: 'Default' }, Two: { name: 'Two' } },
  rooms: {
    r1: { name: 'Room 1', beds: { b1: { guestId: 'guest-a' }, b2: {} } },
    r2: { name: 'Room 2', beds: { b3: { guestId: 'guest-b' } } },
  },
  health: { 'guest-a': 80 },
  chores: { Kitchen: { name: 'Kitchen' } },
  disputes: { d1: {} },
  complaints: { c1: { message: 'secret' } },
  issues: { i1: {} },
  applications: { a1: {} },
  code: 'JOIN-123',
  ownerId: 'owner-uid',
  superAdminId: 'owner-uid',
  adminIds: ['admin-1'],
  superAdminIds: ['admin-1'],
  stripeAccountId: 'acct_123',
  stripeStatus: 'active',
  guestGraceEndsAt: '2026-12-01',
  awaitingVerification: [{ uid: 'x' }],
  ...extra,
});

describe('toHouseListing', () => {
  it('copies only the public fields, with counts in place of rooms and phases', () => {
    expect(toHouseListing('h1', house())).toEqual({
      id: 'h1',
      name: 'E2E Test House',
      geohash: '9v6kpm',
      city: 'Austin',
      state: 'TX',
      zip: '78701',
      gender: 'male',
      houseType: 'traditional',
      certified: true,
      baths: 2,
      wifi: true,
      phoneNumber: '512-555-0100',
      maximumCapacity: 10,
      currentCapacity: 7,
      openBeds: 3,
      monthlyRent: 800,
      weeklyRent: 200,
      rentFrequency: 'both',
      phaseCount: 2,
      roomCount: 2,
      bedCount: 3,
    });
  });

  it('never carries the address, coordinates, residents, staff, codes or billing', () => {
    const listing = JSON.stringify(toHouseListing('h1', house()));
    for (const secret of [
      '100 Test St',
      '30.2672',
      'guest-a',
      'guest-b',
      'JOIN-123',
      'owner-uid',
      'admin-1',
      'acct_123',
      'secret',
      'subscriptionStatus',
      'stripe',
      'Kitchen',
      'Room 1',
    ]) {
      expect(listing).not.toContain(secret);
    }
  });

  it('cuts the geohash to about a kilometre', () => {
    expect(toHouseListing('h1', house())?.geohash).toHaveLength(6);
  });

  it.each([
    ['a demo house', { isDemoHouse: true }],
    ['a lapsed subscription', { subscriptionStatus: 'canceled' }],
    // A past-due house is listed (owner, 2026-11-27); an unpaid one is not.
    ['an unpaid subscription', { subscriptionStatus: 'unpaid' }],
    ['no subscription status', { subscriptionStatus: '' }],
    ['no name', { name: '  ' }],
    ['no location', { geohash: 'unknown' }],
    ['a short geohash', { geohash: '9v6' }],
  ])('lists nothing for %s', (_label, extra) => {
    expect(toHouseListing('h1', house(extra))).toBeNull();
  });

  it('lists a trialing house', () => {
    expect(toHouseListing('h1', house({ subscriptionStatus: 'trialing' }))).not.toBeNull();
  });

  it('drops a field of the wrong type instead of copying it', () => {
    const listing = toHouseListing(
      'h1',
      house({ city: { evil: true }, monthlyRent: '800', wifi: 'yes' }),
    );
    expect(listing).not.toHaveProperty('city');
    expect(listing).not.toHaveProperty('monthlyRent');
    expect(listing).not.toHaveProperty('wifi');
  });

  // Free text an operator typed is public here, so it is capped.
  it('caps the free-text fields', () => {
    const listing = toHouseListing(
      'h1',
      house({ depositsAndFees: 'x'.repeat(5000), phoneNumber: '5'.repeat(100), name: 'N'.repeat(500) }),
    );
    expect(listing?.depositsAndFees).toHaveLength(500);
    expect(listing?.phoneNumber).toHaveLength(30);
    expect(listing?.name).toHaveLength(200);
  });

  it('copies the house phone and deposits text', () => {
    const listing = toHouseListing('h1', house({ depositsAndFees: '$200 deposit' }));
    expect(listing).toMatchObject({ phoneNumber: '512-555-0100', depositsAndFees: '$200 deposit' });
  });

  it('never reports negative open beds', () => {
    expect(toHouseListing('h1', house({ currentCapacity: 12 }))?.openBeds).toBe(0);
  });
});

describe('planHouseListing', () => {
  it('writes a listing for a listed house with none yet', () => {
    expect(planHouseListing('h1', house(), undefined).kind).toBe('write');
  });

  it('leaves an identical listing alone, whatever its updatedAt', () => {
    const listing = { ...toHouseListing('h1', house()), updatedAt: 'then' };
    expect(planHouseListing('h1', house(), listing).kind).toBe('unchanged');
  });

  it('rewrites a listing that differs', () => {
    const stale = { ...toHouseListing('h1', house()), currentCapacity: 1 };
    expect(planHouseListing('h1', house(), stale).kind).toBe('write');
  });

  it('deletes the listing of a house that is gone or no longer listed', () => {
    const listing = toHouseListing('h1', house()) as unknown as Record<string, unknown>;
    expect(planHouseListing('h1', undefined, listing).kind).toBe('delete');
    expect(planHouseListing('h1', house({ subscriptionStatus: 'canceled' }), listing).kind).toBe(
      'delete',
    );
  });

  it('does nothing for an unlisted house with no listing', () => {
    expect(planHouseListing('h1', house({ isDemoHouse: true }), undefined).kind).toBe('unchanged');
  });
});
