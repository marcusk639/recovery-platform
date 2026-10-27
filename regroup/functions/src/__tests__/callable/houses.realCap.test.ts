// src/__tests__/callable/houses.realCap.test.ts
//
// createHouses with the REAL addHousesToSubscription (houses.test.ts mocks it):
// pins that the property cap / multiProperty gate is enforced inside the
// transaction and that only newly-created ids count against it. Also covers
// mixed batches where one requested id is unusable: the whole batch is refused.

// Owner role records (util/houseRoles) are covered in narrTiers.test.ts.
jest.mock('../../util/houseRoles', () => ({ recordOwnerRoles: jest.fn(async () => undefined) }));
jest.mock('firebase-functions/v2/https', () => {
  const actual = jest.requireActual('firebase-functions/v2/https');
  return {
    ...actual,
    onCall: (_opts: any, handler?: Function) => (typeof _opts === 'function' ? _opts : handler),
  };
});

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
import {
  Doc,
  events,
  expectCode,
  resetFakeFirestore,
  store,
  writeEvents,
} from './helpers/fakeTxFirestore';

const handler = createHouses as unknown as (req: unknown) => Promise<any>;

const UID = 'operator-uid';
const [K1, K2] = ['wizard-key-1', 'wizard-key-2'];
const H1 = deriveHouseId(UID, K1);
const H2 = deriveHouseId(UID, K2);
const house = (requestKey: string) => ({
  requestKey,
  name: `House ${requestKey}`,
  lat: 30.2672,
  lng: -97.7431,
});
const call = (keys: string[]) =>
  handler({ auth: { uid: UID, token: {} }, data: { houses: keys.map(house) } });

const seedUser = (meta: Doc) =>
  store.set(`users/${UID}`, {
    id: UID,
    email: 'op@example.com',
    adminId: '',
    housesOwned: [],
    subscriptionMetadata: { status: 'active', houseType: 'traditional', houses: {}, ...meta },
  });
const starter = (houses: Doc = {}) => ({ tier: 'starter', maxProperties: 1, houses });
const professional = (maxProperties: number, houses: Doc = {}) => ({
  tier: 'professional',
  maxProperties,
  houses,
});

beforeEach(() => {
  resetFakeFirestore();
  jest.clearAllMocks();
  mockGrantHouseRoles.mockResolvedValue(undefined);
});

describe('createHouses — real property cap', () => {
  it('denies a starter operator creating 2 houses in one call', async () => {
    seedUser(starter());
    await expectCode(call([K1, K2]), 'failed-precondition');
    expect(writeEvents()).toHaveLength(0);
    expect(store.has(`houses/${H1}`)).toBe(false);
    expect(mockGrantHouseRoles).not.toHaveBeenCalled();
  });

  it('a retry at the cap succeeds when every id is already in the map', async () => {
    seedUser(starter());
    await call([K1]);
    // The starter operator is now at the cap (1 of 1).
    events.length = 0;
    const res = await call([K1]);
    expect(res.houseIds).toEqual([H1]);
    expect(events.filter((e) => e.op === 'create')).toHaveLength(0);
    expect(Object.keys(store.get(`users/${UID}`)!.subscriptionMetadata.houses)).toEqual([H1]);
    expect(mockGrantHouseRoles).toHaveBeenLastCalledWith(UID, [H1]);
  });

  it('one existing + one new house counts only the new one against the cap', async () => {
    seedUser(professional(2));
    await call([K1]);
    events.length = 0;
    // Map holds H1 (1 of 2); adding H2 fits only if H1 is not counted again.
    const res = await call([K1, K2]);
    expect(res.houseIds).toEqual([H1, H2]);
    expect(events.filter((e) => e.op === 'create').map((e) => e.path)).toEqual([`houses/${H2}`]);
    expect(Object.keys(store.get(`users/${UID}`)!.subscriptionMetadata.houses)).toEqual([H1, H2]);
  });

  it('denies a new house past the cap even alongside an existing one', async () => {
    seedUser(professional(1));
    await call([K1]);
    events.length = 0;
    await expectCode(call([K1, K2]), 'failed-precondition');
    expect(writeEvents()).toHaveLength(0);
    expect(store.has(`houses/${H2}`)).toBe(false);
  });
});

describe('createHouses — mixed batches are refused whole', () => {
  it("[fresh K1, K2 colliding with another operator's house] → already-exists", async () => {
    seedUser(professional(10));
    store.set(`houses/${H2}`, { id: H2, ownerId: 'someone-else' });
    await expectCode(call([K1, K2]), 'already-exists');
    expect(writeEvents()).toHaveLength(0);
    expect(store.has(`houses/${H1}`)).toBe(false);
    expect(mockGrantHouseRoles).not.toHaveBeenCalled();
  });

  it('[fresh K1, K2 with our ownerId but not in the map] → already-exists', async () => {
    seedUser(professional(10));
    store.set(`houses/${H2}`, { id: H2, ownerId: UID });
    await expectCode(call([K1, K2]), 'already-exists');
    expect(writeEvents()).toHaveLength(0);
    expect(store.has(`houses/${H1}`)).toBe(false);
    expect(mockGrantHouseRoles).not.toHaveBeenCalled();
  });
});
