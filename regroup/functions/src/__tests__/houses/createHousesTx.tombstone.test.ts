// Delete-and-reclaim guard: a deleted house id (houseTombstones/{id}, written
// by the onHouseDeleted trigger) can never be created again by createHousesTx.
jest.mock('../../api/firestore', () =>
  require('../callable/helpers/fakeTxFirestore').apiFirestoreMock(),
);

import { createHousesTx } from '../../houses/createHousesTx';
import { createHouseInputSchema } from '../../houses/houseInput';
import {
  Doc,
  events,
  expectCode,
  resetFakeFirestore,
  runTransaction,
  store,
  writeEvents,
} from '../callable/helpers/fakeTxFirestore';

const UID = 'operator-uid';
const H1 = 'aaaaaaaaaaaaaaaaaaa1';
const H2 = 'aaaaaaaaaaaaaaaaaaa2';
const input = (id: string) =>
  createHouseInputSchema.parse({ id, name: `House ${id}`, lat: 30.2672, lng: -97.7431 });
const seedUser = (houses: Doc = {}) =>
  store.set(`users/${UID}`, {
    id: UID,
    adminId: '',
    subscriptionMetadata: {
      status: 'active',
      tier: 'professional',
      houseType: 'traditional',
      maxProperties: 10,
      houses,
    },
  });
const run = (ids: string[]) =>
  runTransaction((tx) => createHousesTx(tx as never, UID, ids.map(input), new Date()));
const tombstone = (id: string) =>
  store.set(`houseTombstones/${id}`, { deletedAt: '2026-10-20T00:00:00.000Z' });

beforeEach(() => resetFakeFirestore());

describe('createHousesTx — house tombstones', () => {
  it('reads the tombstone of every requested id before any write', async () => {
    seedUser();
    await run([H1, H2]);
    const gets = events.filter((e) => e.op === 'get').map((e) => e.path);
    expect(gets).toEqual(
      expect.arrayContaining([`houseTombstones/${H1}`, `houseTombstones/${H2}`]),
    );
    const ops = events.map((e) => e.op);
    expect(ops.lastIndexOf('get')).toBeLessThan(ops.indexOf('create'));
    expect(store.has(`houses/${H1}`)).toBe(true);
  });

  it('rejects a deleted id even though no house doc exists', async () => {
    seedUser();
    tombstone(H1);
    await expectCode(run([H2, H1]), 'already-exists', 'A house with this id already exists');
    expect(writeEvents()).toHaveLength(0);
    expect(store.has(`houses/${H1}`)).toBe(false);
    expect(store.has(`houses/${H2}`)).toBe(false);
  });

  it('rejects a deleted id even if it is still in the caller subscription map', async () => {
    seedUser({ [H1]: { numberOfGuests: 0 } });
    tombstone(H1);
    await expectCode(run([H1]), 'already-exists');
    expect(writeEvents()).toHaveLength(0);
  });
});
