// House-roles backfill, #145 round 9: the stale pass's recent-grant window
// (verifier B1, review S-1), settling a primary (S-4, non-transactional
// update) and exit code 3 for unverifiable primaries (S-3).
// In-memory Firestore, fake Auth.
jest.mock('../../scripts/scriptBootstrap', () => ({}));
jest.mock('firebase-admin', () => ({ firestore: jest.fn(), auth: jest.fn() }));

import { mem, memDb } from '../helpers/memFirestore';
import { backfillHouseRoles, RECENT_GRANT_MS } from '../../scripts/backfillHouseRoles';
import { exitCodeFor } from '../../scripts/backfillHouseRolesReport';

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
const NOW = new Date('2026-10-27T12:00:00.000Z');
const at = (ms: number) => new Date(NOW.getTime() + ms).toISOString();
const run = (db: any = memDb, primaryChoices?: Record<string, string>) =>
  backfillHouseRoles(db, authClient, { apply: true, now: NOW, primaryChoices });

beforeEach(() => {
  mem.reset();
  for (const k of Object.keys(claims)) delete claims[k];
  claims.owner = { ...SUPER };
  mem.seed(`houses/${H}`, { id: H, ownerId: 'owner', superAdminId: 'owner' });
  mem.seed('users/owner', { subscriptionMetadata: { status: 'active', houses: { [H]: {} } } });
});

it('Y3: step 5a three minutes after step 1 still lowers a backfill record whose claim the old code removed (B1)', async () => {
  // Step 1 recorded M as manager; the old code then removed M's admin claim.
  mem.seed(`house-roles/${H}_m`, {
    houseId: H,
    tier: 'manager',
    grantedBy: 'backfill',
    via: 'backfill',
    grantedAt: at(-3 * 60_000),
  });
  claims.m = { guest: { [H]: true } };
  // A callable grant two minutes ago whose claims are still in flight.
  mem.seed(`house-roles/${H}_fresh`, {
    houseId: H,
    tier: 'manager',
    via: 'addAdminAuthorization',
    grantedAt: at(-2 * 60_000),
  });
  claims.fresh = {};
  const report = await run();
  expect(mem.get(`house-roles/${H}_m`)).toMatchObject({ tier: 'resident' });
  expect(mem.get(`house-roles/${H}_fresh`)).toMatchObject({ tier: 'manager' });
  expect(report.recentSkipped).toBe(1);
});

it('the window boundary: now - window + 1s is skipped, now - window - 1s is processed (S-1)', async () => {
  const seed = (uid: string, ms: number) =>
    mem.seed(`house-roles/${H}_${uid}`, {
      houseId: H,
      tier: 'manager',
      via: 'addAdminAuthorization',
      grantedAt: at(ms),
    });
  seed('inside', -RECENT_GRANT_MS + 1000);
  seed('outside', -RECENT_GRANT_MS - 1000);
  claims.inside = {};
  claims.outside = {};
  const report = await run();
  expect(mem.get(`house-roles/${H}_inside`)).toMatchObject({ tier: 'manager' });
  expect(mem.get(`house-roles/${H}_outside`)).toBeUndefined();
  expect(report.recentSkipped).toBe(1);
});

it('--primary on an existing primary whose tier is not owner is reported as malformed, not settled (S-4)', async () => {
  mem.seed(`house-roles/${H}_owner`, { houseId: H, tier: 'manager', primary: true });
  const report = await run(memDb, { [H]: 'owner' });
  expect(report.primaryContradicted).toEqual([
    expect.objectContaining({ uid: 'owner', reason: expect.stringMatching(/^malformed/) }),
  ]);
  expect(mem.get(`house-roles/${H}_owner`)).not.toHaveProperty('chosen');
  expect(exitCodeFor(report)).toBe(3);
});

it('a primary record that changes during the run is reported, the run goes on', async () => {
  delete claims.owner; // unverifiable
  claims.owner2 = {};
  mem.seed(`house-roles/${H}_owner`, { houseId: H, tier: 'owner', primary: true });
  const racing: any = {
    ...memDb,
    collection: (name: string) => {
      const col = memDb.collection(name);
      if (name !== 'house-roles') return col;
      return {
        ...col,
        doc: (id: string) => ({
          ...col.doc(id),
          update: async () => {
            throw Object.assign(new Error('gone'), { code: 5 });
          },
        }),
      };
    },
  };
  claims.owner = {};
  const report = await run(racing, { [H]: 'owner' });
  expect(report.primaryContradicted).toEqual([
    expect.objectContaining({ reason: expect.stringMatching(/changed during the run/) }),
  ]);
  expect(report.owners).toEqual([]);
});

it('an unverifiable primary exits 3 (S-3)', async () => {
  delete claims.owner;
  claims.other = { ...SUPER };
  mem.seed(`house-roles/${H}_owner`, { houseId: H, tier: 'owner', primary: true });
  const report = await run();
  expect(report.primaryUnverifiable).toHaveLength(1);
  expect(exitCodeFor(report)).toBe(3);
});
