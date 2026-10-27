// Pass 1 of the house-roles backfill (scripts/backfillHouseOwners): a primary
// owner only when server-written evidence agrees with both house fields
// (#145 round 6 verifier, C1 and break 3). In-memory Firestore, fake Auth.
jest.mock('../../scripts/scriptBootstrap', () => ({}));
jest.mock('firebase-admin', () => ({ firestore: jest.fn(), auth: jest.fn() }));

import { mem, memDb } from '../helpers/memFirestore';
import { backfillHouseRoles } from '../../scripts/backfillHouseRoles';
import { parsePrimaryChoices } from '../../scripts/backfillHouseOwners';

const H = 'h';
const SUPER = { admin: { [H]: true }, superAdmin: { [H]: true } };
const claims: Record<string, Record<string, unknown>> = {};
const authClient = {
  getUser: async (uid: string) => {
    if (!(uid in claims))
      throw Object.assign(new Error('no user'), { code: 'auth/user-not-found' });
    return { customClaims: claims[uid] };
  },
  listUsers: async () => ({
    users: Object.entries(claims).map(([uid, customClaims]) => ({ uid, customClaims })),
  }),
};
const subscription = (uid: string, status = 'active') =>
  mem.seed(`users/${uid}`, { subscriptionMetadata: { status, houses: { [H]: {} } } });
const primaries = () =>
  mem.paths('house-roles/').filter((p) => (mem.get(p) as { primary?: boolean }).primary === true);
const run = (primaryChoices?: Record<string, string>) =>
  backfillHouseRoles(memDb, authClient, { apply: true, primaryChoices });

beforeEach(() => {
  mem.reset();
  for (const k of Object.keys(claims)) delete claims[k];
  claims.owner = { ...SUPER };
  claims.co = { ...SUPER };
});

it('a co-owner who rewrote BOTH superAdminId and ownerId is not crowned: the subscription names the owner', async () => {
  mem.seed(`houses/${H}`, { id: H, ownerId: 'co', superAdminId: 'co' });
  subscription('owner');
  const report = await run();
  expect(primaries()).toEqual([]);
  expect(report.ownerReview).toEqual([
    {
      houseId: H,
      reason: expect.stringMatching(
        /no subscription of that account alone.*subscription=\[owner\]/,
      ),
    },
  ]);
  // Both still get a co-owner record (pass 3), so neither is locked out.
  expect(mem.get(`house-roles/${H}_owner`)).toMatchObject({ tier: 'owner' });
});

it.each([
  [
    'two subscriptions list the house',
    () => {
      subscription('owner');
      subscription('co');
    },
  ],
  ['no subscription lists it', () => undefined],
  ['only a client-created (empty status) record lists it', () => subscription('owner', '')],
  [
    'the account holds no superAdmin claim',
    () => {
      subscription('owner');
      delete claims.owner;
    },
  ],
])('equal fields but %s: no primary, listed', async (_label, setup) => {
  mem.seed(`houses/${H}`, { id: H, ownerId: 'owner', superAdminId: 'owner' });
  setup();
  const report = await run();
  expect(primaries()).toEqual([]);
  expect(report.ownerReview).toHaveLength(1);
});

it('--primary houseId=uid settles a listed house to any account, even one neither field names', async () => {
  mem.seed(`houses/${H}`, { id: H, ownerId: 'co', superAdminId: 'co' });
  claims.real = { ...SUPER };
  await run();
  const report = await run(parsePrimaryChoices(['--apply', '--primary', `${H}=real`]));
  expect(primaries()).toEqual([`house-roles/${H}_real`]);
  expect(report.ownerReview).toEqual([]);
});

it('an existing primary the evidence contradicts is reported, never changed; the real owner still gets a record (break 3)', async () => {
  mem.seed(`houses/${H}`, { id: H, ownerId: 'owner', superAdminId: 'owner' });
  subscription('owner');
  mem.seed(`house-roles/${H}_co`, { houseId: H, tier: 'owner', primary: true, via: 'backfill' });
  const report = await run();
  expect(report.primaryMismatch).toEqual([
    { houseId: H, uid: 'co', reason: 'evidence names owner' },
  ]);
  expect(primaries()).toEqual([`house-roles/${H}_co`]);
  expect(report.owners).toEqual([]);
  // Pass 3 does not skip the real owner: a co-owner record, not primary.
  expect(mem.get(`house-roles/${H}_owner`)).toMatchObject({ tier: 'owner', via: 'backfill' });
  expect(mem.get(`house-roles/${H}_owner`)).not.toHaveProperty('primary');
});

it('an existing primary the evidence supports is not reported', async () => {
  mem.seed(`houses/${H}`, { id: H, ownerId: 'owner', superAdminId: 'owner' });
  subscription('owner');
  mem.seed(`house-roles/${H}_owner`, { houseId: H, tier: 'owner', primary: true });
  const report = await run();
  expect(report.primaryMismatch).toEqual([]);
  expect(report.owners).toEqual([]);
});
