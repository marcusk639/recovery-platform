// myHouseTiers with the real tier helpers (util/houseRoles), over in-memory role
// records and claims: the portal uses it to tell a manager from a peer leader.
const users: Record<string, Record<string, unknown>> = {};
jest.mock('firebase-admin', () => ({
  firestore: () => require('../helpers/memFirestore').memDb,
  auth: () => ({
    getUser: async (uid: string) => ({ uid, customClaims: users[uid] ?? {} }),
  }),
}));
jest.mock('firebase-functions', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('firebase-functions/v2/https', () => ({
  ...jest.requireActual('firebase-functions/v2/https'),
  onCall: (_o: unknown, h?: unknown) => (typeof _o === 'function' ? _o : h),
}));
jest.mock('../../api/firestore', () => require('../helpers/memFirestore').apiFirestore);

import { mem } from '../helpers/memFirestore';
import { myHouseTiers } from '../../callable/myHouseTiers';

const call = (request: object) => (myHouseTiers as unknown as Function)(request);
const setClaims = (uid: string, claims: Record<string, unknown>) => {
  users[uid] = claims;
};
const setRecord = (id: string, record: Record<string, unknown>) => mem.seed(`house-roles/${id}`, record);

beforeEach(() => {
  mem.reset();
  for (const k of Object.keys(users)) delete users[k];
});

it('refuses a caller who is not signed in', async () => {
  await expect(call({ auth: undefined })).rejects.toMatchObject({ code: 'unauthenticated' });
});

it('reports each staff house with its tier', async () => {
  setClaims('u1', { superAdmin: { h1: true }, admin: { h1: true, h2: true, h3: true, h4: true } });
  setRecord('h2_u1', { tier: 'manager' });
  setRecord('h3_u1', { tier: 'peerLeader' });
  await expect(call({ auth: { uid: 'u1' } })).resolves.toEqual({
    tiers: { h1: 'owner', h2: 'manager', h3: 'peerLeader', h4: 'peerLeader' },
  });
});

it('leaves out a house where the caller is only a resident', async () => {
  setClaims('u1', { guest: { h1: true }, admin: { h2: true } });
  const { tiers } = await call({ auth: { uid: 'u1' } });
  expect(Object.keys(tiers)).toEqual(['h2']);
});

it('reads live claims, so a house just removed is not reported', async () => {
  setClaims('u1', {});
  const result = await call({ auth: { uid: 'u1', token: { admin: { h1: true } } } });
  expect(result).toEqual({ tiers: {} });
});

it('ignores input, so it cannot report on another account', async () => {
  setClaims('u1', { admin: { h1: true } });
  setClaims('u2', { superAdmin: { h9: true } });
  const { tiers } = await call({ auth: { uid: 'u1' }, data: { uid: 'u2' } });
  expect(Object.keys(tiers)).toEqual(['h1']);
});

it('tolerates the legacy array shape of claims', async () => {
  setClaims('u1', { admin: ['h1'] });
  const { tiers } = await call({ auth: { uid: 'u1' } });
  expect(tiers).toEqual({ h1: 'peerLeader' });
});
