// updateSubscriptionHouses decides ownership from the REAL isPrimaryOwner
// (util/houseRoles) over an in-memory house-roles store, never houses.ownerId
// (#145 round 6, I6). subscriptions.test.ts mirrors ownerId in its mock.
jest.mock('firebase-admin', () => ({
  firestore: () => require('../helpers/memFirestore').memDb,
  auth: () => ({ getUser: async (uid: string) => ({ uid, customClaims: {} }) }),
}));
jest.mock('firebase-functions', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('firebase-functions/v2/https', () => ({
  ...jest.requireActual('firebase-functions/v2/https'),
  onCall: (_o: unknown, h?: unknown) => (typeof _o === 'function' ? _o : h),
}));
jest.mock('firebase-functions/params', () => ({ defineSecret: (name: string) => ({ name }) }));
jest.mock('stripe', () => jest.fn().mockImplementation(() => ({})));
jest.mock('../../api/stripe', () => ({}));
jest.mock('../../util/superAdminClaim', () => ({ grantPotentialSuperAdminClaim: jest.fn() }));
jest.mock('../../util/operatorSubscriptionWrite', () => ({ writeOperatorSubscription: jest.fn() }));
const mockUpdateUser = jest.fn();
jest.mock('../../api/firestore', () => ({
  getUser: async (id: string) => ({
    id,
    subscriptionMetadata: { tier: 'professional', maxProperties: 3, houses: {} },
  }),
  updateUser: (...a: unknown[]) => mockUpdateUser(...a),
  getHouse: async (id: string) => ({ id, ownerId: 'user-1' }),
  upsertSubscriptionDoc: jest.fn(),
}));

import { mem } from '../helpers/memFirestore';
import { updateSubscriptionHouses } from '../../callable/subscriptions';

const addHouse = (uid: string) =>
  (updateSubscriptionHouses as unknown as Function)({
    data: { ownerUserId: uid, action: 'add', houseIds: ['h'] },
    auth: { uid },
  });

beforeEach(() => {
  mem.reset();
  mockUpdateUser.mockReset();
  // houses.ownerId names user-1 (rewritten by a co-owner); the record names owner.
  mem.seed('houses/h', { id: 'h', ownerId: 'user-1' });
});

it('the ownerId named in the house doc cannot add a house whose primary record is someone else', async () => {
  mem.seed('house-roles/h_owner', { houseId: 'h', tier: 'owner', primary: true });
  await expect(addHouse('user-1')).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mockUpdateUser).not.toHaveBeenCalled();
});

it('the primary owner record holder may add the house, whatever ownerId says', async () => {
  mem.seed('house-roles/h_owner', { houseId: 'h', tier: 'owner', primary: true });
  await expect(addHouse('owner')).resolves.toBeDefined();
  expect(mockUpdateUser).toHaveBeenCalledWith('owner', expect.anything());
});

it('with no primary owner record nobody may add the house (fail closed)', async () => {
  mem.seed('house-roles/h_user-1', { houseId: 'h', tier: 'owner' }); // co-owner only
  await expect(addHouse('user-1')).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mockUpdateUser).not.toHaveBeenCalled();
});
