// The house trigger that keeps house-listings/{houseId} in step with the house,
// against an in-memory store. It decides from the current house doc, not the event.
jest.mock('firebase-functions/v2', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: (_opts: unknown, handler: unknown) => handler,
}));
jest.mock('firebase-admin/firestore', () => ({
  FieldValue: require('../helpers/memFirestore').fieldValue,
}));
jest.mock('../../api/firestore', () => require('../helpers/memFirestore').apiFirestore);

import { mem, memDb } from '../helpers/memFirestore';
import { onHouseListingSync, syncHouseListing } from '../../triggers/firestore/houseListing';

const run = onHouseListingSync as unknown as (e: unknown) => Promise<void>;
const H = 'h1';
const house = (extra: Record<string, unknown> = {}) => ({
  id: H,
  name: 'E2E Test House',
  subscriptionStatus: 'active',
  geohash: '9v6kpmrz2',
  city: 'Austin',
  state: 'TX',
  street: '100 Test St',
  maximumCapacity: 10,
  currentCapacity: 2,
  rooms: { r1: { beds: { b1: { guestId: 'guest-a' } } } },
  ...extra,
});
const event = { params: { houseId: H } };
const listing = () => mem.get(`house-listings/${H}`);

beforeEach(() => mem.reset());

it('writes the listing when a listed house is written', async () => {
  mem.seed(`houses/${H}`, house());
  await run(event);
  expect(listing()).toMatchObject({ id: H, name: 'E2E Test House', city: 'Austin', openBeds: 8 });
  expect(listing()).not.toHaveProperty('street');
  expect(listing()).not.toHaveProperty('rooms');
  expect(listing()?.updatedAt).toBeTruthy();
});

it('follows the house as it changes', async () => {
  mem.seed(`houses/${H}`, house());
  await run(event);
  mem.seed(`houses/${H}`, house({ currentCapacity: 9 }));
  await run(event);
  expect(listing()).toMatchObject({ currentCapacity: 9, openBeds: 1 });
});

it('does not rewrite an unchanged listing (a resident edit elsewhere in the house)', async () => {
  mem.seed(`houses/${H}`, house());
  await run(event);
  const writes = mem.writes.length;
  mem.seed(`houses/${H}`, house({ complaints: { c1: { message: 'noise' } } }));
  expect(await syncHouseListing(H)).toBe('unchanged');
  expect(mem.writes.length).toBe(writes);
});

it('removes the listing when the subscription lapses', async () => {
  mem.seed(`houses/${H}`, house());
  await run(event);
  mem.seed(`houses/${H}`, house({ subscriptionStatus: 'canceled' }));
  await run(event);
  expect(listing()).toBeUndefined();
});

it('removes the listing when the house is deleted', async () => {
  mem.seed(`houses/${H}`, house());
  await run(event);
  await memDb.collection('houses').doc(H).delete();
  await run(event);
  expect(listing()).toBeUndefined();
});

it('removes the listing when the house becomes a demo house', async () => {
  mem.seed(`houses/${H}`, house());
  await run(event);
  mem.seed(`houses/${H}`, house({ isDemoHouse: true }));
  await run(event);
  expect(listing()).toBeUndefined();
});

it('removes the listing when the name or the location goes', async () => {
  mem.seed(`houses/${H}`, house());
  await run(event);
  mem.seed(`houses/${H}`, house({ name: '  ' }));
  await run(event);
  expect(listing()).toBeUndefined();
  mem.seed(`houses/${H}`, house());
  await run(event);
  mem.seed(`houses/${H}`, house({ geohash: 'unknown' }));
  await run(event);
  expect(listing()).toBeUndefined();
});

it('converges on a retry: a second run of the same event changes nothing', async () => {
  mem.seed(`houses/${H}`, house());
  expect(await syncHouseListing(H)).toBe('write');
  const writes = mem.writes.length;
  expect(await syncHouseListing(H)).toBe('unchanged');
  expect(mem.writes.length).toBe(writes);
});

it('lists nothing for a demo house', async () => {
  mem.seed(`houses/${H}`, house({ isDemoHouse: true }));
  expect(await syncHouseListing(H)).toBe('unchanged');
  expect(listing()).toBeUndefined();
});
