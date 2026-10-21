// src/__tests__/callable/finishOperatorSetup.test.ts
//
// finishOperatorSetup recovers an operator whose houses exist but whose claim
// grant / onboarding-flags write never completed (app restarted before a
// retry). It grants roles only on houses the caller provably owns — candidate
// ids from housesOwned and the (server-written) subscription map whose house
// doc has ownerId === uid — and writes the flags only after the grant succeeds.

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
import { OPERATOR_SETUP_FIELDS } from '../../houses/operatorSetup';
import {
  events,
  expectCode,
  failNextUpdate,
  getAll,
  resetFakeFirestore,
  store,
} from './helpers/fakeTxFirestore';

const handler = finishOperatorSetup as unknown as (req: unknown) => Promise<any>;

const UID = 'operator-uid';
const call = (data: unknown = undefined, token: Record<string, unknown> = {}) =>
  handler({ auth: { uid: UID, token }, data });
const roles = (ids: string[]) => Object.fromEntries(ids.map((id) => [id, true]));
const grantedToken = (ids: string[]) => ({ admin: roles(ids), superAdmin: roles(ids) });
const user = () => store.get(`users/${UID}`)!;

const seedUser = (houses: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  store.set(`users/${UID}`, {
    id: UID,
    adminId: 'admin-1',
    housesOwned: Object.keys(houses),
    orgSetupCompleted: false,
    potentialSuperAdmin: true,
    subscriptionMetadata: { status: 'active', tier: 'starter', maxProperties: 1, houses },
    ...extra,
  });
const seedHouse = (id: string, ownerId: string = UID) =>
  store.set(`houses/${id}`, { id, name: 'House', ownerId });

const writes = () => events.filter((e) => e.op === 'directUpdate');

beforeEach(() => {
  resetFakeFirestore();
  jest.clearAllMocks();
  mockGrantHouseRoles.mockImplementation(async () => {
    events.push({ op: 'grantHouseRoles', path: '' });
  });
});

describe('finishOperatorSetup', () => {
  it('rejects an unauthenticated caller', async () => {
    await expectCode(handler({ data: {} }), 'unauthenticated');
    expect(mockGrantHouseRoles).not.toHaveBeenCalled();
  });

  it('returns completed:false and grants nothing when the caller owns no houses', async () => {
    seedUser({});
    await expect(call()).resolves.toEqual({ completed: false });
    expect(mockGrantHouseRoles).not.toHaveBeenCalled();
    expect(writes()).toHaveLength(0);
    expect(user().orgSetupCompleted).toBe(false);
  });

  it('returns completed:false when the user doc does not exist', async () => {
    await expect(call()).resolves.toEqual({ completed: false });
    expect(mockGrantHouseRoles).not.toHaveBeenCalled();
  });

  it('grants exactly the owned houses, then writes the flags', async () => {
    seedUser({ h1: { addedAt: 'x' }, h2: { addedAt: 'x' } });
    seedHouse('h1');
    seedHouse('h2');

    await expect(call()).resolves.toEqual({ completed: true, houseIds: ['h1', 'h2'] });

    expect(mockGrantHouseRoles).toHaveBeenCalledTimes(1);
    expect(mockGrantHouseRoles).toHaveBeenCalledWith(UID, ['h1', 'h2']);
    expect(writes()).toEqual([
      { op: 'directUpdate', path: `users/${UID}`, data: { ...OPERATOR_SETUP_FIELDS } },
    ]);
    const ops = events.map((e) => e.op);
    expect(ops.indexOf('directUpdate')).toBeGreaterThan(ops.indexOf('grantHouseRoles'));
    expect(user()).toMatchObject(OPERATOR_SETUP_FIELDS);
    expect(user().adminId).toBe('admin-1');
  });

  it('excludes houses owned by someone else or whose doc is missing', async () => {
    seedUser({ mine: {}, theirs: {}, gone: {} });
    seedHouse('mine');
    seedHouse('theirs', 'other-uid');

    await expect(call()).resolves.toEqual({ completed: true, houseIds: ['mine'] });
    expect(mockGrantHouseRoles).toHaveBeenCalledWith(UID, ['mine']);
  });

  it('returns completed:false when no house in the map is provably owned', async () => {
    seedUser({ theirs: {}, gone: {} });
    seedHouse('theirs', 'other-uid');

    await expect(call()).resolves.toEqual({ completed: false });
    expect(mockGrantHouseRoles).not.toHaveBeenCalled();
    expect(writes()).toHaveLength(0);
  });

  it('ignores client input entirely', async () => {
    seedUser({ mine: {} });
    seedHouse('mine');
    seedHouse('theirs', 'other-uid');

    await call({ houseIds: ['theirs'], houses: { theirs: {} } });
    expect(mockGrantHouseRoles).toHaveBeenCalledWith(UID, ['mine']);
  });

  it('recovers a housesOwned entry missing from the subscription map only if ownerId === uid', async () => {
    seedUser({}, { housesOwned: ['mine', 'theirs'] });
    seedHouse('mine');
    seedHouse('theirs', 'other-uid');

    await expect(call()).resolves.toEqual({ completed: true, houseIds: ['mine'] });
    expect(mockGrantHouseRoles).toHaveBeenCalledWith(UID, ['mine']);
  });

  it('ignores housesOwned entries whose house is not owned by the caller', async () => {
    seedUser({}, { housesOwned: ['theirs', 'gone'] });
    seedHouse('theirs', 'other-uid');

    await expect(call()).resolves.toEqual({ completed: false });
    expect(mockGrantHouseRoles).not.toHaveBeenCalled();
  });

  it('puts housesOwned ids ahead of subscription-map keys, deduped, within the cap', async () => {
    const mapIds = Array.from({ length: 30 }, (_, i) => `m${String(i).padStart(2, '0')}`);
    // 'm05' is in both sources: it must be read once.
    seedUser(Object.fromEntries(mapIds.map((id) => [id, {}])), {
      housesOwned: ['owned-a', 'm05', 'owned-b'],
    });
    seedHouse('owned-a');
    seedHouse('owned-b');
    mapIds.forEach((id) => seedHouse(id, 'other-uid'));

    await expect(call()).resolves.toEqual({
      completed: true,
      houseIds: ['owned-a', 'owned-b'],
    });
    const candidates = getAll.mock.calls[0].map((ref: { id: string }) => ref.id);
    expect(candidates).toHaveLength(MAX_CANDIDATE_HOUSES);
    expect(candidates.slice(0, 3)).toEqual(['owned-a', 'm05', 'owned-b']);
    expect(new Set(candidates).size).toBe(candidates.length);
  });

  it('logs a PII-free warning when it returns completed:false', async () => {
    seedUser({ theirs: {} }, { housesOwned: ['theirs'], email: 'op@example.com' });
    seedHouse('theirs', 'other-uid');

    await expect(call()).resolves.toEqual({ completed: false });
    expect(logger.warn).toHaveBeenCalledWith('finishOperatorSetup: no owned houses found', {
      uid: UID,
      candidateCount: 1,
      ownedCount: 0,
      truncated: false,
    });
    expect(JSON.stringify((logger.warn as jest.Mock).mock.calls)).not.toContain('example.com');
  });

  it('flags truncated in the warning when candidates exceed the cap', async () => {
    const ids = Array.from({ length: 30 }, (_, i) => `t${i}`);
    seedUser(Object.fromEntries(ids.map((id) => [id, {}])));
    ids.forEach((id) => seedHouse(id, 'other-uid'));

    await expect(call()).resolves.toEqual({ completed: false });
    expect(logger.warn).toHaveBeenCalledWith('finishOperatorSetup: no owned houses found', {
      uid: UID,
      candidateCount: MAX_CANDIDATE_HOUSES,
      ownedCount: 0,
      truncated: true,
    });
  });

  it('a grant failure is a retryable internal error and writes no flags', async () => {
    seedUser({ h1: {} });
    seedHouse('h1');
    mockGrantHouseRoles.mockRejectedValueOnce(
      Object.assign(new Error('auth down op@example.com'), { code: 'auth/internal-error' }),
    );

    await expectCode(
      call(),
      'internal',
      'Houses were created but access could not be granted. Try again.',
    );
    expect(writes()).toHaveLength(0);
    expect(user().orgSetupCompleted).toBe(false);
    // uid / ids / code only: never the raw error (its message may carry PII).
    expect(logger.error).toHaveBeenCalledWith('finishOperatorSetup: claim grant failed', {
      uid: UID,
      houseIds: ['h1'],
      code: 'auth/internal-error',
    });
  });

  it('a flags write failure is a retryable internal error', async () => {
    seedUser({ h1: {} });
    seedHouse('h1');
    failNextUpdate(Object.assign(new Error('firestore down'), { code: 'unavailable' }));

    await expectCode(
      call(),
      'internal',
      'Houses were created but setup could not finish. Try again.',
    );
    expect(mockGrantHouseRoles).toHaveBeenCalledWith(UID, ['h1']);
    expect(user().orgSetupCompleted).toBe(false);
    expect(logger.error).toHaveBeenCalledWith(
      'finishOperatorSetup: onboarding flags update failed',
      { uid: UID, houseIds: ['h1'], code: 'unavailable' },
    );
  });

  it('is idempotent: a second call completes without re-granting and leaves the flags set', async () => {
    seedUser({ h1: {} });
    seedHouse('h1');

    const first = await call();
    const afterFirst = { ...user() };
    const second = await call(undefined, grantedToken(['h1']));

    expect(first).toEqual({ completed: true, houseIds: ['h1'] });
    expect(second).toEqual({ completed: true, houseIds: [] });
    expect(mockGrantHouseRoles).toHaveBeenCalledTimes(1);
    expect(user()).toEqual(afterFirst);
  });

  it('returns completed with no grant, reads or writes for an already-completed operator', async () => {
    seedUser({ h1: {} }, { orgSetupCompleted: true });
    seedHouse('h1');

    await expect(call(undefined, grantedToken(['h1']))).resolves.toEqual({
      completed: true,
      houseIds: [],
    });
    expect(mockGrantHouseRoles).not.toHaveBeenCalled();
    expect(getAll).not.toHaveBeenCalled();
    expect(events.filter((e) => e.op === 'directGet').map((e) => e.path)).toEqual([`users/${UID}`]);
    expect(writes()).toHaveLength(0);
  });

  it(`reads at most ${MAX_CANDIDATE_HOUSES} candidate houses in one getAll and grants only owned ones`, async () => {
    const ids = Array.from({ length: 40 }, (_, i) => `h${String(i).padStart(2, '0')}`);
    seedUser(Object.fromEntries(ids.map((id) => [id, {}])));
    // Owned: h00, h10, h20 (inside the cap) and h30 (beyond it).
    ids.forEach((id, i) => seedHouse(id, i % 10 === 0 ? UID : 'other-uid'));

    await expect(call()).resolves.toEqual({ completed: true, houseIds: ['h00', 'h10', 'h20'] });

    expect(getAll).toHaveBeenCalledTimes(1);
    expect(getAll.mock.calls[0]).toHaveLength(MAX_CANDIDATE_HOUSES);
    const houseReads = events.filter((e) => e.op === 'directGet' && e.path.startsWith('houses/'));
    expect(houseReads).toHaveLength(MAX_CANDIDATE_HOUSES);
    expect(mockGrantHouseRoles).toHaveBeenCalledWith(UID, ['h00', 'h10', 'h20']);
    // h30 is owned but beyond the cap: not recovered, and the truncation is logged.
    expect(logger.info).toHaveBeenCalledWith('operator.setup.finished', {
      uid: UID,
      houseIds: ['h00', 'h10', 'h20'],
      truncated: true,
    });
  });

  it('a retry after a failed grant completes setup', async () => {
    seedUser({ h1: {} });
    seedHouse('h1');
    mockGrantHouseRoles.mockRejectedValueOnce(new Error('auth down'));

    await expectCode(call(), 'internal');
    await expect(call()).resolves.toEqual({ completed: true, houseIds: ['h1'] });
    expect(user()).toMatchObject(OPERATOR_SETUP_FIELDS);
  });
});
