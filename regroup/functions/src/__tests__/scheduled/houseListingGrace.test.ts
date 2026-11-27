// The hourly sweep that takes a past-due house out of signed-out search once
// its guest grace ends (owner decision 2026-11-27). No house write happens
// when the grace runs out, so the listing trigger alone would keep it listed.
jest.mock('firebase-functions/v2', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: (_opts: unknown, handler: unknown) => handler,
}));
jest.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (_opts: unknown, handler: unknown) => handler,
}));
jest.mock('firebase-admin/firestore', () => ({
  FieldValue: require('../helpers/memFirestore').fieldValue,
}));
jest.mock('../../api/firestore', () => require('../helpers/memFirestore').apiFirestore);

import { logger } from 'firebase-functions/v2';
import { mem } from '../helpers/memFirestore';
import { onHouseListingSync } from '../../triggers/firestore/houseListing';
import { houseListingGraceSweep, resyncPastDueListings } from '../../scheduled/houseListingGrace';

const NOW = Date.parse('2026-12-01T12:00:00Z');
const BEFORE = '2026-12-01T11:00:00Z';
const AFTER = '2026-12-01T13:00:00Z';
const house = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: `House ${id}`,
  subscriptionStatus: 'active',
  geohash: '9v6kpmrz2',
  city: 'Austin',
  state: 'TX',
  ...extra,
});
const pastDue = (id: string, guestGraceEndsAt: string) =>
  house(id, { subscriptionStatus: 'past_due', guestGraceEndsAt });
const listing = (id: string) => mem.get(`house-listings/${id}`);
const trigger = onHouseListingSync as unknown as (e: unknown) => Promise<void>;

/** Seed a house and the listing its trigger would have written while it was listed. */
async function seedListed(id: string, data: Record<string, unknown>): Promise<void> {
  mem.seed(`houses/${id}`, { ...data, subscriptionStatus: 'active' });
  await trigger({ params: { houseId: id } });
  mem.seed(`houses/${id}`, data);
}

beforeEach(() => {
  mem.reset();
  jest.clearAllMocks();
});

it('keeps a past-due house listed while its guest grace runs, without re-planning it', async () => {
  await seedListed('h1', pastDue('h1', AFTER));
  const writes = mem.writes.length;
  expect(await resyncPastDueListings(NOW)).toEqual({
    checked: 1,
    resynced: 0,
    written: 0,
    deleted: 0,
    unchanged: 0,
    failed: 0,
  });
  expect(listing('h1')).toMatchObject({ id: 'h1' });
  expect(mem.writes.length).toBe(writes);
});

it('delists a past-due house once its guest grace has ended', async () => {
  await seedListed('h1', pastDue('h1', BEFORE));
  expect(await resyncPastDueListings(NOW)).toMatchObject({ checked: 1, resynced: 1, deleted: 1 });
  expect(listing('h1')).toBeUndefined();
});

// Owner decision 2026-11-27: a house set past_due with no deadline (by
// setOperatorHousesStatus or the status migration) leaves search at once, as
// the paywall denies it.
it('delists a past-due house that never had a grace deadline', async () => {
  await seedListed('h1', house('h1', { subscriptionStatus: 'past_due' }));
  expect(await resyncPastDueListings(NOW)).toMatchObject({ checked: 1, resynced: 1, deleted: 1 });
  expect(listing('h1')).toBeUndefined();
});

it('lists the house again when it becomes active (the house write triggers it)', async () => {
  await seedListed('h1', pastDue('h1', BEFORE));
  await resyncPastDueListings(NOW);
  expect(listing('h1')).toBeUndefined();
  mem.seed('houses/h1', house('h1'));
  await trigger({ params: { houseId: 'h1' } });
  expect(listing('h1')).toMatchObject({ id: 'h1' });
});

it('writes nothing when nothing changed, and skips houses already delisted', async () => {
  await seedListed('h1', pastDue('h1', AFTER));
  mem.seed('houses/h2', pastDue('h2', BEFORE)); // already delisted: no listing
  mem.seed('houses/h3', house('h3'));
  const writes = mem.writes.length;
  expect(await resyncPastDueListings(NOW)).toEqual({
    checked: 2,
    resynced: 0,
    written: 0,
    deleted: 0,
    unchanged: 0,
    failed: 0,
  });
  expect(mem.writes.length).toBe(writes);
});

it('reads only past-due houses, and only their grace deadline', async () => {
  mem.seed('houses/h1', house('h1'));
  mem.seed('houses/h2', pastDue('h2', AFTER));
  expect(await resyncPastDueListings(NOW)).toMatchObject({ checked: 1 });
  expect(mem.selects).toEqual([['houses', ['guestGraceEndsAt']]]);
});

it('sweeps many houses in one run', async () => {
  for (let i = 0; i < 150; i++) {
    const id = `p${String(i).padStart(3, '0')}`;
    await seedListed(id, pastDue(id, i % 3 === 0 ? BEFORE : AFTER));
  }
  for (let i = 0; i < 15; i++) await seedListed(`a${i}`, house(`a${i}`));
  expect(await resyncPastDueListings(NOW)).toEqual({
    checked: 150,
    resynced: 50,
    written: 0,
    deleted: 50,
    unchanged: 0,
    failed: 0,
  });
  expect(mem.paths('house-listings/p').length).toBe(100);
  expect(mem.paths('house-listings/a').length).toBe(15);
  expect(listing('p000')).toBeUndefined();
  expect(listing('p001')).toMatchObject({ id: 'p001' });
});

it('the scheduled run fails after sweeping the rest when a house fails, logging ids only', async () => {
  // The scheduled run uses the real clock, so these deadlines are long past.
  await seedListed('h1', pastDue('h1', '2020-01-01T00:00:00Z'));
  await seedListed('h2', pastDue('h2', '2020-01-01T00:00:00Z'));
  // h1's listing delete fails: the sweep deletes inside the sync's transaction.
  const { ratsFirestore } = jest.requireMock('../../api/firestore');
  const realTxn = ratsFirestore.runTransaction;
  type Tx = { delete: (ref: { path: string }) => unknown };
  const spy = jest
    .spyOn(ratsFirestore, 'runTransaction')
    .mockImplementation((...args: unknown[]) => {
      const fn = args[0] as (tx: Tx) => Promise<unknown>;
      return realTxn((tx: Tx) =>
        fn({
          ...tx,
          delete: (ref) => {
            if (ref.path === 'house-listings/h1') throw new Error('unavailable');
            return tx.delete(ref);
          },
        }),
      );
    });
  try {
    await expect((houseListingGraceSweep as unknown as () => Promise<void>)()).rejects.toThrow(
      'house_listing_grace.failed',
    );
  } finally {
    spy.mockRestore();
  }
  expect(listing('h1')).toBeDefined();
  expect(listing('h2')).toBeUndefined();

  // Only the house id and the error: never a name, email or phone.
  const errors = (logger.error as jest.Mock).mock.calls;
  expect(errors).toHaveLength(1);
  expect(errors[0][0]).toBe('house_listing_grace.house_failed');
  expect(Object.keys(errors[0][1]).sort()).toEqual(['error', 'houseId']);
  expect(errors[0][1].houseId).toBe('h1');
  expect(errors[0][1].error).toBeInstanceOf(Error);
  // The run's summary is counts only.
  const [event, summary] = (logger.info as jest.Mock).mock.calls.find(
    ([name]) => name === 'house_listing_grace.swept',
  );
  expect(event).toBe('house_listing_grace.swept');
  expect(summary).toEqual({
    checked: 2,
    resynced: 2,
    written: 0,
    deleted: 1,
    unchanged: 0,
    failed: 1,
  });
});
