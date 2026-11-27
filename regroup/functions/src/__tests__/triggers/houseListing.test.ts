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

// Owner decision 2026-11-27: a live house is listed, a past-due one too
// (its grace period), and a house that isn't live is not.
for (const status of ['active', 'trialing', 'past_due']) {
  it(`lists a house whose subscription is ${status}`, async () => {
    mem.seed(`houses/${H}`, house({ subscriptionStatus: status }));
    await run(event);
    expect(listing()).toMatchObject({ id: H });
  });
}

for (const status of ['canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused', '']) {
  it(`lists no house whose subscription is ${status || 'missing'}`, async () => {
    mem.seed(`houses/${H}`, house());
    await run(event);
    mem.seed(`houses/${H}`, house({ subscriptionStatus: status }));
    await run(event);
    expect(listing()).toBeUndefined();
  });
}

// Owner decision 2026-11-27: the house phone is public, for applicants to call.
it('includes the house phone in the listing', async () => {
  mem.seed(`houses/${H}`, house({ phoneNumber: '512-555-0100' }));
  await run(event);
  expect(listing()).toMatchObject({ phoneNumber: '512-555-0100' });
});

it('lists nothing for a demo house', async () => {
  mem.seed(`houses/${H}`, house({ isDemoHouse: true }));
  expect(await syncHouseListing(H)).toBe('unchanged');
  expect(listing()).toBeUndefined();
});

// Two writes to a house close together: the older event's handler reads the
// house, the newer write lands and its handler syncs, then the older handler
// writes. Reading and writing in one transaction makes the older handler see
// the newer house instead of writing a listing for a house that is gone.
it('does not restore a stale listing when the house changes mid-sync', async () => {
  const api = require('../helpers/memFirestore').apiFirestore;
  const realDoc = api.houseCollection.doc;
  mem.seed(`houses/${H}`, house());
  await syncHouseListing(H);
  // The older event: a resident moved in, so its handler has a listing to write.
  mem.seed(`houses/${H}`, house({ currentCapacity: 3 }));
  let raced = false;
  api.houseCollection.doc = (id: string) => {
    const ref = realDoc(id);
    return {
      ...ref,
      get: async () => {
        const snap = await ref.get();
        if (!raced) {
          raced = true;
          // The subscription lapses after this handler read the house.
          mem.seed(`houses/${H}`, house({ subscriptionStatus: 'canceled' }));
          await syncHouseListing(H);
        }
        return snap;
      },
    };
  };
  try {
    await syncHouseListing(H);
  } finally {
    api.houseCollection.doc = realDoc;
  }
  expect(raced).toBe(true);
  expect(listing()).toBeUndefined();
});
