// addAdminAuthorization with the REAL claims helpers (util/claims): an admin
// grant and a superAdmin grant in one call both land, and every claim the
// account already held is kept. (It used to spread two createClaims results
// built from the same snapshot, so the superAdmin result's stale admin map
// overwrote the new admin grant.)
const users: Record<string, Record<string, unknown>> = {};
jest.mock('firebase-admin', () => ({
  firestore: () => require('../helpers/memFirestore').memDb,
  auth: () => ({
    getUser: async (uid: string) => ({ uid, customClaims: users[uid] ?? {} }),
    setCustomUserClaims: async (uid: string, c: Record<string, unknown>) => {
      users[uid] = JSON.parse(JSON.stringify(c));
    },
  }),
}));
jest.mock('firebase-functions', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('firebase-functions/v2/https', () => ({
  ...jest.requireActual('firebase-functions/v2/https'),
  onCall: (_o: unknown, h?: unknown) => (typeof _o === 'function' ? _o : h),
}));
jest.mock('../../util/authGuard', () => ({ assertCanGrantClaimForHouses: jest.fn() }));
jest.mock('../../api/firestore', () => require('../helpers/memFirestore').apiFirestore);
jest.mock('../../util/user', () => ({ getGuestsAsUsers: jest.fn(), _verifyUserEmail: jest.fn() }));

import { mem } from '../helpers/memFirestore';
import { addAdminAuthorization } from '../../callable/auth';

beforeEach(() => {
  mem.reset();
  for (const k of Object.keys(users)) delete users[k];
  mem.seed('houses/h1', { id: 'h1', ownerId: 'owner' });
  mem.seed('houses/h2', { id: 'h2', ownerId: 'owner' });
  mem.seed('house-roles/h1_owner', { tier: 'owner', primary: true });
  mem.seed('house-roles/h2_owner', { tier: 'owner', primary: true });
});

it('grants admin and superAdmin together, keeping existing claims', async () => {
  users.u1 = { guest: { g: true }, admin: { old: true }, potentialSuperAdmin: true };

  await (addAdminAuthorization as unknown as Function)({
    data: { userId: 'u1', houseIds: ['h1'], superAdmin: ['h2'] },
    auth: { uid: 'owner', token: {} },
  });

  expect(users.u1).toEqual({
    guest: { g: true },
    admin: { old: true, h1: true },
    superAdmin: { h2: true },
    potentialSuperAdmin: true,
  });
  expect(mem.get('house-roles/h1_u1')).toMatchObject({ tier: 'manager' });
  expect(mem.get('house-roles/h2_u1')).toMatchObject({ tier: 'owner' });
});
