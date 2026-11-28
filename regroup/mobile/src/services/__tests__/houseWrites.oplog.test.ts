/**
 * Server-owned house fields never leave the app (M1, 2026-11-27).
 *
 * Several services save a whole house object read earlier. The rules refuse any
 * client change to a server-owned field (firestore.rules, houses update), so a
 * copy holding an older stripeAccountId or subscriptionStatus than the server's
 * would make the whole save fail. Each whole-house write drops those names
 * first; Firestore keeps the server's values for anything an update omits.
 */
import * as fs from 'fs';
import * as path from 'path';

jest.mock('../../../firebase-setup', () => require('../../../__mocks__/firebase-modular/setup'));
jest.mock('@react-native-firebase/firestore', () => {
  const mock = require('../../../__mocks__/firebase-modular/firestore');
  return { ...mock, firebase: { firestore: mock.default } };
});
jest.mock('@react-native-firebase/functions', () =>
  require('../../../__mocks__/firebase-modular/functions'),
);
jest.mock('@react-native-firebase/storage', () =>
  require('../../../__mocks__/firebase-modular/storage'),
);
jest.mock('../../../google/timezone', () => ({ getTimezone: jest.fn(async () => 'UTC') }));
jest.mock('../../util/logging', () => ({ logException: jest.fn() }));

import { getOpLog, resetOpLog, seedDoc } from '../../../__mocks__/firebase-modular/log';
import { SERVER_OWNED_HOUSE_FIELDS, withoutServerOwnedHouseFields } from '../houseWrites';
import { finalizeHouseSetup, updateHouse } from '../house';
import { createGuest, customizePhase, deleteGuest } from '../guest';
import { updateDispute } from '../dispute';

const SERVER_OWNED_VALUES = {
  subscriptionStatus: 'trialing',
  guestGraceEndsAt: '2026-11-01T00:00:00.000Z',
  stripeAccountApi: 'v1',
  superAdminId: 'u1',
  houseType: 'traditional',
  ownerId: 'u1',
  rentChargesStartDate: '2026-11-01',
  rentChargesStartedAtMs: 1,
  stripeAccountId: 'acct_old',
  stripeStatus: 'not_connected',
};

const staleHouse = () => ({
  id: 'h1',
  name: 'Oak',
  currentCapacity: 2,
  phases: {},
  rooms: {},
  ...SERVER_OWNED_VALUES,
});

function houseWrites() {
  return getOpLog().filter(
    (e) => e.path === 'houses/h1' && (e.op === 'update' || e.op === 'batch.update'),
  );
}

function expectNoServerOwnedField() {
  const writes = houseWrites();
  expect(writes.length).toBeGreaterThan(0);
  for (const write of writes) {
    for (const field of SERVER_OWNED_HOUSE_FIELDS) {
      expect(write.data).not.toHaveProperty(field);
    }
  }
}

beforeEach(() => {
  resetOpLog();
});

describe('withoutServerOwnedHouseFields', () => {
  it('drops every server-owned field, keeps the rest, and leaves its input as it was', () => {
    const input = staleHouse();
    const out = withoutServerOwnedHouseFields(input);

    expect(out).toEqual({ id: 'h1', name: 'Oak', currentCapacity: 2, phases: {}, rooms: {} });
    expect(input).toEqual(staleHouse());
  });

  it('names exactly the fields the houses update rule refuses to clients', () => {
    const rules = fs.readFileSync(
      path.resolve(__dirname, '../../../firebase/firestore.rules'),
      'utf8',
    );
    const rule = rules.match(
      /allow update: if isDemoScopedHouses\(\[houseId\]\) &&\s*!request\.resource\.data\.diff\(resource\.data\)\.affectedKeys\(\)\s*\.hasAny\(\[([^\]]*)\]\)/,
    );
    expect(rule).not.toBeNull();
    const fromRules = [...rule![1].matchAll(/'([A-Za-z]+)'/g)].map((m) => m[1]).sort();

    expect([...SERVER_OWNED_HOUSE_FIELDS].sort()).toEqual(fromRules);
  });
});

describe('whole-house saves send no server-owned field', () => {
  it('updateHouse', async () => {
    seedDoc('houses/h1', staleHouse());
    await updateHouse('h1', staleHouse() as any);
    expectNoServerOwnedField();
    expect(houseWrites()[0].data).toEqual(expect.objectContaining({ id: 'h1', name: 'Oak' }));
  });

  it('finalizeHouseSetup', async () => {
    seedDoc('houses/h1', staleHouse());
    await finalizeHouseSetup('h1', staleHouse() as any);
    expectNoServerOwnedField();
    expect(houseWrites()[0].data).toEqual(expect.objectContaining({ setupComplete: true }));
  });

  it('createGuest', async () => {
    seedDoc('houses/h1', staleHouse());
    await createGuest({ id: 'g1', houseId: 'h1' } as any);
    expectNoServerOwnedField();
    expect(houseWrites()[0].data).toEqual(expect.objectContaining({ currentCapacity: 3 }));
  });

  it('deleteGuest', async () => {
    seedDoc('houses/h1', staleHouse());
    seedDoc('guests/g1', { id: 'g1', houseId: 'h1' });
    await deleteGuest({ id: 'g1', houseId: 'h1' } as any, staleHouse() as any);
    expectNoServerOwnedField();
    expect(houseWrites()[0].data).toEqual(expect.objectContaining({ currentCapacity: 1 }));
  });

  it('customizePhase', async () => {
    seedDoc('houses/h1', staleHouse());
    seedDoc('guests/g1', { id: 'g1', houseId: 'h1' });
    await customizePhase({ id: 'g1', phase: 'p' } as any, staleHouse() as any);
    expectNoServerOwnedField();
  });

  it('updateDispute', async () => {
    seedDoc('houses/h1', staleHouse());
    await updateDispute(staleHouse() as any);
    expectNoServerOwnedField();
  });
});
