// The house-listings backfill against an in-memory store: dry run writes
// nothing, apply writes listings for listed houses, removes listings of
// unlisted or deleted houses, and leaves unchanged ones alone.
jest.mock('../../scripts/scriptBootstrap', () => ({}));
jest.mock('firebase-admin', () => ({
  firestore: Object.assign(() => require('../helpers/memFirestore').memDb, {
    FieldValue: require('../helpers/memFirestore').fieldValue,
  }),
}));

import { mem, memDb } from '../helpers/memFirestore';
import { run } from '../../scripts/backfillHouseListings';
import { LISTING_SOURCE_FIELDS, toHouseListing } from '../../houses/houseListing';

const listed = (extra: Record<string, unknown> = {}) => ({
  name: 'A House',
  subscriptionStatus: 'active',
  geohash: '9v6kpmrz2',
  city: 'Austin',
  street: '1 Main St',
  ...extra,
});

beforeEach(() => {
  mem.reset();
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

const seedAll = () => {
  mem.seed('houses/new', listed());
  mem.seed('houses/same', listed());
  mem.seed(
    'house-listings/same',
    toHouseListing('same', listed()) as unknown as Record<string, unknown>,
  );
  mem.seed('houses/lapsed', listed({ subscriptionStatus: 'canceled' }));
  mem.seed('house-listings/lapsed', { id: 'lapsed', name: 'A House' });
  mem.seed('house-listings/gone', { id: 'gone', name: 'Old House' });
};

it('reports without writing in a dry run', async () => {
  seedAll();
  const counts = await run(memDb, false);
  expect(counts).toEqual({ houses: 3, write: 1, delete: 1, unchanged: 1, orphans: 1 });
  expect(mem.get('house-listings/new')).toBeUndefined();
  expect(mem.get('house-listings/gone')).toBeDefined();
});

it('writes, removes and leaves alone on --apply', async () => {
  seedAll();
  await run(memDb, true);
  expect(mem.get('house-listings/new')).toMatchObject({ id: 'new', city: 'Austin' });
  expect(mem.get('house-listings/new')).not.toHaveProperty('street');
  expect(mem.get('house-listings/lapsed')).toBeUndefined();
  expect(mem.get('house-listings/gone')).toBeUndefined();
  expect(mem.writes.filter((w) => w.path === 'house-listings/same')).toHaveLength(0);
});

// Owner decision 2026-11-27: a past-due house is listed only while its guest
// grace runs, in the backfill as in the trigger.
it('lists a past-due house whose grace runs and drops one whose grace ended', async () => {
  const running = new Date(Date.now() + 86400000).toISOString();
  mem.seed('houses/running', listed({ subscriptionStatus: 'past_due', guestGraceEndsAt: running }));
  mem.seed(
    'houses/ended',
    listed({ subscriptionStatus: 'past_due', guestGraceEndsAt: '2020-01-01T00:00:00Z' }),
  );
  mem.seed('house-listings/ended', { id: 'ended', name: 'A House' });
  await run(memDb, true);
  expect(mem.get('house-listings/running')).toMatchObject({ id: 'running' });
  expect(mem.get('house-listings/running')).not.toHaveProperty('guestGraceEndsAt');
  expect(mem.get('house-listings/ended')).toBeUndefined();
});

it('reads only the fields a listing is made from', async () => {
  seedAll();
  await run(memDb, false);
  expect(mem.selects).toEqual([['houses', LISTING_SOURCE_FIELDS]]);
  expect(LISTING_SOURCE_FIELDS).not.toContain('street');
  expect(LISTING_SOURCE_FIELDS).not.toContain('complaints');
});

it('logs house ids, never a house field', async () => {
  seedAll();
  await run(memDb, true);
  const logged = JSON.stringify((console.log as jest.Mock).mock.calls);
  expect(logged).not.toContain('1 Main St');
  expect(logged).not.toContain('Austin');
});
