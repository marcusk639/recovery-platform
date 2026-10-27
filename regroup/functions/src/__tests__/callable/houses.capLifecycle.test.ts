// src/__tests__/callable/houses.capLifecycle.test.ts
//
// The property-cap slot lifecycle across createHouses and the onHouseDeleted
// trigger, with the real cap logic on the shared fake Firestore.
// updateSubscriptionHouses can no longer free a slot for a live house, so the
// trigger is the only path that frees one: at the cap, deleting a house must
// let the operator create another, and a tombstoned id must stay refused.

jest.mock('firebase-functions/v2/https', () => {
  const actual = jest.requireActual('firebase-functions/v2/https');
  return {
    ...actual,
    onCall: (_opts: any, handler?: Function) => (typeof _opts === 'function' ? _opts : handler),
  };
});

jest.mock('firebase-functions/v2/firestore', () => ({
  onDocumentDeleted: (_opts: unknown, handler: unknown) => handler,
}));

jest.mock('firebase-functions', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock('../../api/firestore', () => require('./helpers/fakeTxFirestore').apiFirestoreMock());

const mockGrantHouseRoles = jest.fn();
jest.mock('../../util/claims', () => ({
  grantHouseRoles: (...args: unknown[]) => mockGrantHouseRoles(...args),
}));

import { createHouses } from '../../callable/houses';
import { deriveHouseId } from '../../houses/houseId';
import { onHouseDeleted } from '../../triggers/firestore/houseTombstone';
import { expectCode, resetFakeFirestore, store } from './helpers/fakeTxFirestore';

const handler = createHouses as unknown as (req: unknown) => Promise<any>;
const trigger = onHouseDeleted as unknown as (event: unknown) => Promise<void>;

const UID = 'operator-uid';
const [K1, K2] = ['wizard-key-1', 'wizard-key-2'];
const H1 = deriveHouseId(UID, K1);
const H2 = deriveHouseId(UID, K2);
const call = (keys: string[]) =>
  handler({
    auth: { uid: UID, token: {} },
    data: {
      houses: keys.map((requestKey) => ({
        requestKey,
        name: `House ${requestKey}`,
        lat: 30.2672,
        lng: -97.7431,
      })),
    },
  });
const mapIds = () => Object.keys(store.get(`users/${UID}`)!.subscriptionMetadata.houses);

/** Deletes the house doc, then delivers the delete event the trigger would get. */
const deleteHouse = async (id: string) => {
  const data = store.get(`houses/${id}`);
  store.delete(`houses/${id}`);
  await trigger({
    params: { houseId: id },
    time: '2026-10-21T00:00:00.000Z',
    data: { data: () => data },
  });
};

beforeEach(() => {
  resetFakeFirestore();
  jest.clearAllMocks();
  mockGrantHouseRoles.mockResolvedValue(undefined);
  store.set(`users/${UID}`, {
    id: UID,
    email: 'op@example.com',
    adminId: '',
    housesOwned: [],
    subscriptionMetadata: {
      status: 'active',
      houseType: 'traditional',
      tier: 'starter',
      maxProperties: 1,
      houses: {},
    },
  });
});

describe('property-cap slot lifecycle', () => {
  it('at the cap, deleting a house frees its slot for a new one', async () => {
    await call([K1]);
    await expectCode(call([K2]), 'failed-precondition');

    await deleteHouse(H1);
    expect(mapIds()).toEqual([]);

    const res = await call([K2]);
    expect(res.houseIds).toEqual([H2]);
    expect(mapIds()).toEqual([H2]);
  });

  it('refuses to recreate the deleted id, even with its slot freed', async () => {
    await call([K1]);
    await deleteHouse(H1);
    await expectCode(call([K1]), 'already-exists');
    expect(store.has(`houses/${H1}`)).toBe(false);
  });

  it('a redelivered delete event frees nothing more', async () => {
    await call([K1]);
    await deleteHouse(H1);
    await call([K2]);
    await trigger({
      params: { houseId: H1 },
      time: '2026-10-21T00:00:00.000Z',
      data: { data: () => ({ ownerId: UID }) },
    });
    expect(mapIds()).toEqual([H2]);
  });
});
