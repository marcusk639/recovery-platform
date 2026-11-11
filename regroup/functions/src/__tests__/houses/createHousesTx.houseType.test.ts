// The plan chosen at checkout sets the house type (owner decision, #225), so a
// new house takes its houseType from the operator's subscription, whatever the
// client sends.
jest.mock('firebase-functions', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));
jest.mock('../../api/firestore', () =>
  require('../callable/helpers/fakeTxFirestore').apiFirestoreMock(),
);

import { createHousesTx } from '../../houses/createHousesTx';
import { deriveHouseId } from '../../houses/houseId';
import { createHouseInputSchema } from '../../houses/houseInput';
import { resetFakeFirestore, runTransaction, store } from '../callable/helpers/fakeTxFirestore';

const UID = 'operator-uid';
const KEY = 'wizard-key-1';
const HOUSE = `houses/${deriveHouseId(UID, KEY)}`;

const seedOperator = (houseType: string, tier: string) =>
  store.set(`users/${UID}`, {
    id: UID,
    email: 'operator@example.com',
    adminId: '',
    subscriptionMetadata: { status: 'active', tier, houseType, maxProperties: 10, houses: {} },
  });
const create = (clientHouseType: string) =>
  runTransaction((tx) =>
    createHousesTx(
      tx as never,
      UID,
      [
        createHouseInputSchema.parse({
          requestKey: KEY,
          name: 'Main St House',
          lat: 30.2672,
          lng: -97.7431,
          houseType: clientHouseType,
        }),
      ],
      new Date(),
    ),
  );

beforeEach(() => {
  resetFakeFirestore();
  jest.clearAllMocks();
});

describe('createHousesTx: the plan sets the house type', () => {
  it('makes an Oxford house for an operator on an Oxford plan, whatever the client sends', async () => {
    seedOperator('oxford', 'standard');
    await create('traditional');
    expect(store.get(HOUSE)?.houseType).toBe('oxford');
  });

  it('makes a traditional house for an operator on a traditional plan, whatever the client sends', async () => {
    seedOperator('traditional', 'starter');
    await create('oxford');
    expect(store.get(HOUSE)?.houseType).toBe('traditional');
  });
});
