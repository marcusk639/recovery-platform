// src/__tests__/callable/houses.serverIds.test.ts
//
// createHouses derives every house id on the server from (uid, requestKey).
// These tests pin that the client can no longer choose an id, which is what
// closes delete-and-reclaim of another operator's (or a deleted) house id.

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
import { Doc, events, expectCode, resetFakeFirestore, store } from './helpers/fakeTxFirestore';

const handler = createHouses as unknown as (req: unknown) => Promise<any>;

const UID = 'operator-uid';
const OTHER = 'other-operator-uid';
const house = (requestKey: string, extra: Doc = {}) => ({
  requestKey,
  name: `House ${requestKey}`,
  lat: 30.2672,
  lng: -97.7431,
  ...extra,
});
const call = (houses: Doc[], uid = UID) => handler({ auth: { uid, token: {} }, data: { houses } });
const seedUser = (uid: string) =>
  store.set(`users/${uid}`, {
    id: uid,
    email: `${uid}@example.com`,
    adminId: '',
    housesOwned: [],
    subscriptionMetadata: {
      status: 'active',
      tier: 'professional',
      houseType: 'traditional',
      maxProperties: 10,
      houses: {},
    },
  });

beforeEach(() => {
  resetFakeFirestore();
  jest.clearAllMocks();
  mockGrantHouseRoles.mockResolvedValue(undefined);
});

describe('createHouses — server-derived house ids', () => {
  it('client cannot choose the house id', async () => {
    seedUser(UID);
    const chosen = 'aaaaaaaaaaaaaaaaaaa1';
    const res = await call([house('key-1', { id: chosen })]);

    const derived = deriveHouseId(UID, 'key-1');
    expect(derived).not.toBe(chosen);
    expect(res.houseIds).toEqual([derived]);
    expect(res.idMap).toEqual({ 'key-1': derived });
    expect(store.has(`houses/${chosen}`)).toBe(false);
    expect(store.get(`houses/${derived}`)).toMatchObject({ id: derived, ownerId: UID });
    expect(store.get(`houses/${derived}`)).not.toHaveProperty('requestKey');
    expect(mockGrantHouseRoles).toHaveBeenCalledWith(UID, [derived]);
  });

  it('retry with the same requestKey is idempotent', async () => {
    seedUser(UID);
    const first = await call([house('key-1')]);
    const created = store.get(`houses/${first.houseIds[0]}`);

    events.length = 0;
    const second = await call([house('key-1', { name: 'Renamed' })]);
    expect(second.idMap).toEqual(first.idMap);
    expect(events.filter((e) => e.op === 'create')).toHaveLength(0);
    expect(store.get(`houses/${first.houseIds[0]}`)).toBe(created);
    expect(second.admin.id).toBe(first.admin.id);
    expect(store.get(`users/${UID}`)!.housesOwned).toEqual(first.houseIds);
    expect(mockGrantHouseRoles).toHaveBeenLastCalledWith(UID, first.houseIds);
  });

  it('different callers with the same requestKey get different ids', async () => {
    seedUser(UID);
    seedUser(OTHER);
    const mine = await call([house('shared-key')]);
    const theirs = await call([house('shared-key')], OTHER);

    expect(theirs.idMap['shared-key']).not.toBe(mine.idMap['shared-key']);
    expect(store.get(`houses/${mine.houseIds[0]}`)!.ownerId).toBe(UID);
    expect(store.get(`houses/${theirs.houseIds[0]}`)!.ownerId).toBe(OTHER);
  });

  it('rejects duplicate requestKeys and invalid keys before any write', async () => {
    seedUser(UID);
    await expectCode(call([house('k'), house('k')]), 'invalid-argument');
    await expectCode(call([house('../users/x')]), 'invalid-argument');
    await expectCode(call([{ ...house('k'), requestKey: undefined }]), 'invalid-argument');
    expect(events.filter((e) => ['create', 'set', 'update'].includes(e.op))).toHaveLength(0);
  });

  it('cannot re-create a deleted house of another operator', async () => {
    // The victim's deleted id is derived from the victim's uid; no requestKey
    // the attacker sends can derive it, tombstone or not.
    seedUser(OTHER);
    const victimId = deriveHouseId(UID, 'key-1');
    const res = await call([house('key-1'), house(victimId)], OTHER);
    expect(res.houseIds).not.toContain(victimId);
    expect(store.has(`houses/${victimId}`)).toBe(false);
    // Claims are granted on exactly the caller-derived ids, never the victim's.
    expect(mockGrantHouseRoles).toHaveBeenCalledTimes(1);
    expect(mockGrantHouseRoles).toHaveBeenCalledWith(OTHER, [
      deriveHouseId(OTHER, 'key-1'),
      deriveHouseId(OTHER, victimId),
    ]);
  });
});
