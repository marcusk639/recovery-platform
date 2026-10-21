// src/__tests__/callable/finishOperatorSetup.completed.test.ts
//
// finishOperatorSetup for an operator whose setup already completed: a house
// added later (createHouses) can commit and hold a cap slot while its claim
// grant fails. The callable grants only owned houses missing from the caller's
// ID-token claims; a fully granted operator costs no house reads.

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

import { logger } from 'firebase-functions';
import { finishOperatorSetup, MAX_CANDIDATE_HOUSES } from '../../callable/finishOperatorSetup';
import { events, expectCode, getAll, resetFakeFirestore, store } from './helpers/fakeTxFirestore';

const handler = finishOperatorSetup as unknown as (req: unknown) => Promise<any>;

const UID = 'operator-uid';
const roles = (ids: string[]) => Object.fromEntries(ids.map((id) => [id, true]));
const call = (token: Record<string, unknown>) => handler({ auth: { uid: UID, token }, data: {} });
const user = () => store.get(`users/${UID}`)!;

const seedCompletedOperator = (houseIds: string[]) =>
  store.set(`users/${UID}`, {
    id: UID,
    housesOwned: houseIds,
    orgSetupCompleted: true,
    isAdmin: true,
    isSuperAdmin: true,
    subscriptionMetadata: {
      status: 'active',
      tier: 'professional',
      maxProperties: 3,
      houses: Object.fromEntries(houseIds.map((id) => [id, { numberOfGuests: 0 }])),
    },
  });
const seedHouse = (id: string, ownerId: string = UID) =>
  store.set(`houses/${id}`, { id, name: 'House', ownerId });

const writes = () => events.filter((e) => e.op === 'directUpdate');

beforeEach(() => {
  resetFakeFirestore();
  jest.clearAllMocks();
  mockGrantHouseRoles.mockResolvedValue(undefined);
});

describe('finishOperatorSetup for a completed operator', () => {
  it('grants an added house whose claim grant failed, and nothing else', async () => {
    seedCompletedOperator(['h1', 'h2']);
    seedHouse('h1');
    seedHouse('h2');

    await expect(call({ admin: roles(['h1']), superAdmin: roles(['h1']) })).resolves.toEqual({
      completed: true,
      houseIds: ['h2'],
    });
    expect(mockGrantHouseRoles).toHaveBeenCalledWith(UID, ['h2']);
    expect(getAll.mock.calls[0]).toHaveLength(1);
    expect(writes()).toHaveLength(0);
    expect(user().orgSetupCompleted).toBe(true);
    expect(logger.info).toHaveBeenCalledWith('operator.setup.claims_repaired', {
      uid: UID,
      houseIds: ['h2'],
      truncated: false,
    });
  });

  it('treats a house with admin but no superAdmin claim as ungranted', async () => {
    seedCompletedOperator(['h1']);
    seedHouse('h1');

    await expect(call({ admin: roles(['h1']) })).resolves.toEqual({
      completed: true,
      houseIds: ['h1'],
    });
    expect(mockGrantHouseRoles).toHaveBeenCalledWith(UID, ['h1']);
  });

  it('does not grant an ungranted candidate the caller does not own', async () => {
    seedCompletedOperator(['h1', 'theirs']);
    seedHouse('h1');
    seedHouse('theirs', 'other-uid');

    await expect(call({ admin: roles(['h1']), superAdmin: roles(['h1']) })).resolves.toEqual({
      completed: true,
      houseIds: [],
    });
    expect(mockGrantHouseRoles).not.toHaveBeenCalled();
  });

  it('a grant failure is a retryable internal error', async () => {
    seedCompletedOperator(['h1']);
    seedHouse('h1');
    mockGrantHouseRoles.mockRejectedValueOnce(new Error('auth down'));

    await expectCode(call({}), 'internal');
    await expect(call({})).resolves.toEqual({ completed: true, houseIds: ['h1'] });
  });

  it('checks subscription-map houses before housesOwned, so junk ids cannot crowd out the real one', async () => {
    const junk = Array.from({ length: MAX_CANDIDATE_HOUSES + 5 }, (_, i) => `junk${i}`);
    seedCompletedOperator(['real']);
    store.set(`users/${UID}`, { ...user(), housesOwned: [...junk, 'real'] });
    seedHouse('real');

    await expect(call({})).resolves.toEqual({ completed: true, houseIds: ['real'] });
    expect(mockGrantHouseRoles).toHaveBeenCalledWith(UID, ['real']);
    expect(logger.info).toHaveBeenCalledWith('operator.setup.claims_repaired', {
      uid: UID,
      houseIds: ['real'],
      truncated: true,
    });
  });

  it('logs a PII-free warning when ungranted candidates exist but none is owned', async () => {
    seedCompletedOperator(['theirs']);
    seedHouse('theirs', 'other-uid');

    await expect(call({})).resolves.toEqual({ completed: true, houseIds: [] });
    expect(mockGrantHouseRoles).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith('operator.setup.claims_repair_nothing_owned', {
      uid: UID,
      ungrantedCount: 1,
      truncated: false,
    });
  });
});
