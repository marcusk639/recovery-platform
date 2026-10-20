// src/__tests__/callable/houses.test.ts

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

// In-memory Firestore with a recording transaction fake; see the helper.
jest.mock('../../api/firestore', () => require('./helpers/fakeTxFirestore').apiFirestoreMock());

const mockGrantHouseRoles = jest.fn();
jest.mock('../../util/claims', () => ({
  grantHouseRoles: (...args: unknown[]) => mockGrantHouseRoles(...args),
}));

const mockAddHousesToSubscription = jest.fn();
jest.mock('../../util/subscriptionHouses', () => ({
  addHousesToSubscription: (...args: unknown[]) => mockAddHousesToSubscription(...args),
}));

import { logger } from 'firebase-functions';
import { createHouses } from '../../callable/houses';
import { deriveHouseId } from '../../houses/houseId';
import {
  Doc,
  events,
  expectCode,
  resetFakeFirestore,
  runTransaction as mockRunTransaction,
  store,
  writeEvents as writes,
} from './helpers/fakeTxFirestore';

const handler = createHouses as unknown as (req: unknown) => Promise<any>;

const UID = 'operator-uid';
// Clients send requestKeys; house ids are server-derived from (uid, key).
const [K1, K2] = ['wizard-key-1', 'wizard-key-2'];
const H1 = deriveHouseId(UID, K1);
const H2 = deriveHouseId(UID, K2);
const house = (requestKey: string, extra: Doc = {}) => ({
  requestKey,
  name: `House ${requestKey}`,
  lat: 30.2672,
  lng: -97.7431,
  ...extra,
});
const call = (houses: Doc[], uid: string | null = UID) =>
  handler({ auth: uid ? { uid, token: {} } : undefined, data: { houses } });

const activeMeta = (extra: Doc = {}) => ({
  status: 'trialing',
  tier: 'starter',
  houseType: 'traditional',
  houses: {},
  ...extra,
});
const seedUser = (extra: Doc = {}) =>
  store.set(`users/${UID}`, {
    id: UID,
    email: 'Operator@Example.com',
    firstName: 'Op',
    lastName: 'Erator',
    adminId: '',
    housesOwned: [],
    subscriptionMetadata: activeMeta(),
    ...extra,
  });

beforeEach(() => {
  resetFakeFirestore();
  jest.clearAllMocks();
  mockGrantHouseRoles.mockImplementation(async () => {
    events.push({ op: 'grantHouseRoles', path: '' });
  });
  // Default: behave like the real helper for the shape these tests need.
  mockAddHousesToSubscription.mockImplementation((meta: Doc, ids: string[], now?: Date) => ({
    ...meta,
    houses: {
      ...(meta.houses ?? {}),
      ...Object.fromEntries(ids.map((id) => [id, { numberOfGuests: 0 }])),
    },
    lastUpdatedAt: (now ?? new Date()).toISOString(),
  }));
});

describe('createHouses', () => {
  it('rejects unauthenticated callers', async () => {
    await expectCode(call([house(K1)], null), 'unauthenticated');
    expect(mockRunTransaction).not.toHaveBeenCalled();
  });

  it.each([
    ['past_due', activeMeta({ status: 'past_due' })],
    ['canceled', activeMeta({ status: 'canceled' })],
    ['missing tier', activeMeta({ tier: undefined })],
    ['missing metadata', undefined],
  ])('denies without an active or trialing tier subscription (%s)', async (_label, meta) => {
    seedUser({ subscriptionMetadata: meta });
    await expectCode(
      call([house(K1)]),
      'failed-precondition',
      'An active subscription is required to create a house',
    );
    expect(writes()).toHaveLength(0);
    expect(mockGrantHouseRoles).not.toHaveBeenCalled();
  });

  it('rejects invalid input', async () => {
    seedUser();
    await expectCode(call([]), 'invalid-argument');
    await expectCode(call([house(K1), house(K1)]), 'invalid-argument');
    expect(writes()).toHaveLength(0);
  });

  it('creates houses, admin doc and user fields in one transaction', async () => {
    seedUser({ subscriptionMetadata: activeMeta({ status: 'active' }) });
    const res = await call([house(K1, { subscriptionStatus: 'canceled' }), house(K2)]);

    expect(mockRunTransaction).toHaveBeenCalledTimes(1);
    const creates = events.filter((e) => e.op === 'create');
    expect(creates.map((e) => e.path)).toEqual([`houses/${H1}`, `houses/${H2}`]);
    const adminId = res.admin.id;
    for (const c of creates) {
      expect(c.data).toMatchObject({
        ownerId: UID,
        superAdminId: UID,
        adminIds: [adminId],
        superAdminIds: [adminId],
        subscriptionStatus: 'active',
      });
    }

    const adminSets = events.filter((e) => e.op === 'set');
    expect(adminSets).toHaveLength(1);
    expect(adminSets[0].path).toBe(`admins/${adminId}`);
    expect(adminSets[0].data).toMatchObject({
      id: adminId,
      email: 'operator@example.com',
      firstName: 'Op',
      lastName: 'Erator',
      userId: UID,
      houseIds: [H1, H2],
      superAdmin: [H1, H2],
    });

    const userUpdates = events.filter((e) => e.op === 'update');
    expect(userUpdates).toHaveLength(1);
    expect(userUpdates[0].path).toBe(`users/${UID}`);
    expect(userUpdates[0].data).toMatchObject({
      orgSetupCompleted: true,
      isAdmin: true,
      isSuperAdmin: true,
      adminId,
      housesOwned: [H1, H2],
    });
    expect(Object.keys(userUpdates[0].data!.subscriptionMetadata.houses)).toEqual([H1, H2]);
    expect(mockAddHousesToSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'active' }),
      [H1, H2],
      expect.any(Date),
    );

    // All reads precede all writes (firebase-admin transaction requirement).
    const lastGet = events.map((e) => e.op).lastIndexOf('get');
    const firstWrite = events.findIndex((e) => ['create', 'set', 'update'].includes(e.op));
    expect(lastGet).toBeLessThan(firstWrite);

    expect(res.houseIds).toEqual([H1, H2]);
    expect(res.idMap).toEqual({ [K1]: H1, [K2]: H2 });
    expect(res.subscriptionMetadata.houses).toHaveProperty(H1);
    expect(store.get(`houses/${H1}`)).toBeDefined();
  });

  it('grants admin and superAdmin claims after the transaction', async () => {
    seedUser();
    await call([house(K1), house(K2)]);
    expect(mockGrantHouseRoles).toHaveBeenCalledWith(UID, [H1, H2]);
    const ops = events.map((e) => e.op);
    expect(ops.indexOf('grantHouseRoles')).toBeGreaterThan(ops.indexOf('commit'));
    expect(logger.info).toHaveBeenCalledWith('house.created', {
      uid: UID,
      houseIds: [H1, H2],
      status: 'trialing',
    });
  });

  it('extends an existing admin doc', async () => {
    seedUser({ adminId: 'admin-1', housesOwned: ['old'] });
    store.set('admins/admin-1', {
      id: 'admin-1',
      userId: UID,
      email: 'operator@example.com',
      phoneNumber: '555',
      houseIds: ['old'],
      superAdmin: ['old'],
    });
    const res = await call([house(K1)]);

    const sets = events.filter((e) => e.op === 'set');
    expect(sets).toHaveLength(1);
    expect(sets[0].path).toBe('admins/admin-1');
    expect(store.get('admins/admin-1')).toMatchObject({
      phoneNumber: '555',
      houseIds: ['old', H1],
      superAdmin: ['old', H1],
    });
    expect(res.admin.houseIds).toEqual(['old', H1]);
    expect(store.get(`users/${UID}`)!.housesOwned).toEqual(['old', H1]);
    expect(store.get(`houses/${H1}`)!.adminIds).toEqual(['admin-1']);
  });

  it('rejects an admin doc that belongs to another user', async () => {
    seedUser({ adminId: 'admin-x' });
    store.set('admins/admin-x', { id: 'admin-x', userId: 'someone-else', houseIds: [] });
    await expectCode(call([house(K1)]), 'permission-denied');
    expect(writes()).toHaveLength(0);
    expect(mockGrantHouseRoles).not.toHaveBeenCalled();
  });

  it('retrying with the same requestKeys re-grants claims without rewriting houses', async () => {
    seedUser();
    mockGrantHouseRoles.mockRejectedValueOnce(new Error('auth down'));
    await expectCode(call([house(K1)]), 'internal');
    const firstHouse = store.get(`houses/${H1}`);
    expect(firstHouse).toBeDefined();
    // The first attempt recorded the id in the server-owned subscription map,
    // which is what lets the retry treat the existing house as the caller's.
    expect(store.get(`users/${UID}`)!.subscriptionMetadata.houses).toHaveProperty(H1);

    events.length = 0;
    const res = await call([house(K1, { name: 'Renamed' })]);
    expect(events.filter((e) => e.op === 'create')).toHaveLength(0);
    expect(store.get(`houses/${H1}`)).toBe(firstHouse);
    expect(mockGrantHouseRoles).toHaveBeenLastCalledWith(UID, [H1]);
    expect(res.houseIds).toEqual([H1]);
    // The admin doc from the first call is reused, not duplicated.
    expect(store.get(`users/${UID}`)!.adminId).toBe(res.admin.id);
    expect(res.admin.houseIds).toEqual([H1]);
  });

  it("rejects a derived id that already holds another operator's house", async () => {
    seedUser();
    const theirs = { id: H1, ownerId: 'other-uid', name: 'Theirs' };
    store.set(`houses/${H1}`, theirs);
    await expectCode(call([house(K1)]), 'already-exists', 'A house with this id already exists');
    expect(writes()).toHaveLength(0);
    expect(store.get(`houses/${H1}`)).toBe(theirs);
    expect(mockGrantHouseRoles).not.toHaveBeenCalled();
  });

  it('rejects a house with ownerId === uid that is not in the subscription map', async () => {
    // ownerId is client-forgeable; only the server-owned map proves ownership.
    seedUser();
    const forged = { id: H1, ownerId: UID, name: 'Forged' };
    store.set(`houses/${H1}`, forged);
    await expectCode(call([house(K1)]), 'already-exists', 'A house with this id already exists');
    expect(writes()).toHaveLength(0);
    expect(store.get(`houses/${H1}`)).toBe(forged);
    expect(mockGrantHouseRoles).not.toHaveBeenCalled();
  });

  it('enforces the property cap', async () => {
    seedUser();
    const { HttpsError: RealHttpsError } = jest.requireActual('firebase-functions/v2/https');
    mockAddHousesToSubscription.mockImplementation(() => {
      throw new RealHttpsError('failed-precondition', 'Property limit reached for your plan');
    });
    await expectCode(
      call([house(K1)]),
      'failed-precondition',
      'Property limit reached for your plan',
    );
    expect(writes()).toHaveLength(0);
    expect(store.has(`houses/${H1}`)).toBe(false);
    expect(mockGrantHouseRoles).not.toHaveBeenCalled();
  });

  it('reports a claim-grant failure as retryable', async () => {
    seedUser();
    mockGrantHouseRoles.mockRejectedValueOnce(new Error('auth down'));
    await expectCode(
      call([house(K1)]),
      'internal',
      'Houses were created but access could not be granted. Try again.',
    );
    expect(store.get(`houses/${H1}`)).toBeDefined();
    expect(logger.error).toHaveBeenCalledWith(
      'createHouses: claim grant failed',
      expect.objectContaining({ uid: UID, houseIds: [H1] }),
    );
  });
});
