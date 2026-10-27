// src/__tests__/callable/houses.setupFlags.test.ts
//
// The onboarding flags (orgSetupCompleted/isAdmin/isSuperAdmin) move an
// operator past setup. createHouses writes them only AFTER the house claims are
// granted, so a failed grant cannot leave an operator past onboarding with no
// claims; the retry (existing houses) writes them once the grant succeeds.

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

import { logger } from 'firebase-functions';
import { createHouses, OPERATOR_SETUP_FIELDS } from '../../callable/houses';
import { deriveHouseId } from '../../houses/houseId';
import {
  events,
  expectCode,
  failNextUpdate,
  resetFakeFirestore,
  store,
} from './helpers/fakeTxFirestore';

const handler = createHouses as unknown as (req: unknown) => Promise<any>;

const UID = 'operator-uid';
const K1 = 'wizard-key-1';
const H1 = deriveHouseId(UID, K1);
const call = () =>
  handler({
    auth: { uid: UID, token: {} },
    data: { houses: [{ requestKey: K1, name: 'House', lat: 30.2, lng: -97.7 }] },
  });
const seedUser = () =>
  store.set(`users/${UID}`, {
    id: UID,
    email: 'op@example.com',
    adminId: '',
    housesOwned: [],
    orgSetupCompleted: false,
    subscriptionMetadata: {
      status: 'active',
      tier: 'professional',
      houseType: 'traditional',
      maxProperties: 10,
      houses: {},
    },
  });
const user = () => store.get(`users/${UID}`)!;

beforeEach(() => {
  resetFakeFirestore();
  jest.clearAllMocks();
  mockGrantHouseRoles.mockImplementation(async () => {
    events.push({ op: 'grantHouseRoles', path: '' });
  });
});

describe('createHouses — onboarding flags follow the claim grant', () => {
  it('a claim-grant failure does not write orgSetupCompleted', async () => {
    seedUser();
    const grantErr = Object.assign(new Error('auth down'), { code: 'auth/internal-error' });
    mockGrantHouseRoles.mockRejectedValueOnce(grantErr);

    await expectCode(call(), 'internal');

    expect(store.has(`houses/${H1}`)).toBe(true);
    expect(user().orgSetupCompleted).toBe(false);
    expect(user().isSuperAdmin).toBeUndefined();
    expect(user().isAdmin).toBeUndefined();
    expect(events.some((e) => e.op === 'directUpdate')).toBe(false);
    expect(logger.error).toHaveBeenCalledWith('createHouses: claim grant failed', {
      uid: UID,
      houseIds: [H1],
      code: 'auth/internal-error',
      err: grantErr,
    });
  });

  it('on success writes the flags after the grant', async () => {
    seedUser();
    await call();

    expect(user()).toMatchObject(OPERATOR_SETUP_FIELDS);
    const ops = events.map((e) => e.op);
    expect(ops.indexOf('directUpdate')).toBeGreaterThan(ops.indexOf('grantHouseRoles'));
    expect(ops.indexOf('grantHouseRoles')).toBeGreaterThan(ops.indexOf('commit'));
    expect(events.find((e) => e.op === 'directUpdate')).toEqual({
      op: 'directUpdate',
      path: `users/${UID}`,
      data: { orgSetupCompleted: true, isAdmin: true, isSuperAdmin: true },
    });
  });

  it('a retry after a failed grant writes the flags', async () => {
    seedUser();
    mockGrantHouseRoles.mockRejectedValueOnce(new Error('auth down'));
    await expectCode(call(), 'internal');
    expect(user().orgSetupCompleted).toBe(false);

    events.length = 0;
    await call();
    expect(events.filter((e) => e.op === 'create')).toHaveLength(0);
    expect(user()).toMatchObject(OPERATOR_SETUP_FIELDS);
    const ops = events.map((e) => e.op);
    expect(ops.indexOf('directUpdate')).toBeGreaterThan(ops.indexOf('grantHouseRoles'));
  });

  it('a failed flag update is reported as retryable', async () => {
    seedUser();
    failNextUpdate(new Error('firestore down'));
    await expectCode(
      call(),
      'internal',
      'Houses were created but setup could not finish. Try again.',
    );
    expect(mockGrantHouseRoles).toHaveBeenCalledWith(UID, [H1]);
    expect(user().orgSetupCompleted).toBe(false);
    expect(logger.error).toHaveBeenCalledWith(
      'createHouses: onboarding flags update failed',
      expect.objectContaining({ uid: UID, houseIds: [H1] }),
    );
  });
});
