// createHousesTx refusals (already-exists / permission-denied) reach the
// client as a generic message, so the server must log each one with the uid
// (and no PII) for support to trace it.
jest.mock('firebase-functions', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));
jest.mock('../../api/firestore', () =>
  require('../callable/helpers/fakeTxFirestore').apiFirestoreMock(),
);

import { logger } from 'firebase-functions';
import { createHousesTx } from '../../houses/createHousesTx';
import { deriveHouseId } from '../../houses/houseId';
import { createHouseInputSchema } from '../../houses/houseInput';
import {
  Doc,
  expectCode,
  resetFakeFirestore,
  runTransaction,
  store,
} from '../callable/helpers/fakeTxFirestore';

const UID = 'operator-uid';
const K1 = 'wizard-key-1';
const H1 = deriveHouseId(UID, K1);
const EMAIL = 'operator@example.com';
const input = (requestKey: string) =>
  createHouseInputSchema.parse({ requestKey, name: 'Main St House', lat: 30.2672, lng: -97.7431 });
const seedUser = (extra: Doc = {}) =>
  store.set(`users/${UID}`, {
    id: UID,
    email: EMAIL,
    adminId: '',
    subscriptionMetadata: {
      status: 'active',
      tier: 'professional',
      houseType: 'traditional',
      maxProperties: 10,
      houses: {},
    },
    ...extra,
  });
const run = () => runTransaction((tx) => createHousesTx(tx as never, UID, [input(K1)], new Date()));
const warnCalls = () => (logger.warn as jest.Mock).mock.calls;

beforeEach(() => {
  resetFakeFirestore();
  jest.clearAllMocks();
});

describe('createHousesTx — refusals are logged with uid, without PII', () => {
  it('logs a tombstoned id', async () => {
    seedUser();
    store.set(`houseTombstones/${H1}`, { deletedAt: '2026-10-20T00:00:00.000Z' });
    await expectCode(run(), 'already-exists');
    expect(logger.warn).toHaveBeenCalledWith('createHouses: refused', {
      uid: UID,
      houseIds: [H1],
      reason: 'tombstoned',
    });
  });

  it("logs an existing house that is not the caller's", async () => {
    seedUser();
    store.set(`houses/${H1}`, { id: H1, ownerId: 'other-uid', name: 'Theirs' });
    await expectCode(run(), 'already-exists');
    expect(logger.warn).toHaveBeenCalledWith('createHouses: refused', {
      uid: UID,
      houseIds: [H1],
      reason: 'existing-house-not-owned',
    });
  });

  it('logs an admin doc that belongs to another user', async () => {
    seedUser({ adminId: 'admin-x' });
    store.set('admins/admin-x', { id: 'admin-x', userId: 'someone-else', houseIds: [] });
    await expectCode(run(), 'permission-denied');
    expect(logger.warn).toHaveBeenCalledWith('createHouses: refused', {
      uid: UID,
      adminId: 'admin-x',
      reason: 'admin-not-owned',
    });
    expect(JSON.stringify(warnCalls())).not.toContain(EMAIL);
    expect(JSON.stringify(warnCalls())).not.toContain('Main St');
  });
});
