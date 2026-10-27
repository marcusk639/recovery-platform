// Pass 1 of the house-roles backfill (scripts/backfillHouseOwners): a primary
// owner only when server-written evidence agrees with both house fields
// (#145 round 6 verifier, C1 and break 3). In-memory Firestore, fake Auth.
jest.mock('../../scripts/scriptBootstrap', () => ({}));
jest.mock('firebase-admin', () => ({ firestore: jest.fn(), auth: jest.fn() }));

import { mem, memDb } from '../helpers/memFirestore';
import { backfillHouseRoles } from '../../scripts/backfillHouseRoles';
import { parsePrimaryChoices } from '../../scripts/backfillHouseOwners';
import { exitCodeFor, printRoleReport } from '../../scripts/backfillHouseRolesReport';

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
  claims.co = { admin: { [H]: true } }; // a superAdmin co-owner where a test says so
});

it('a co-owner who rewrote BOTH superAdminId and ownerId is not crowned: the subscription names the owner', async () => {
  claims.co = { ...SUPER };
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
  expect(exitCodeFor(report)).toBe(3);
});

it('a co-owner who also listed the house on their own subscription is not crowned while another account holds a superAdmin claim (verifier N-A)', async () => {
  // superAdminId set before #103; ownerId and the subscription map through
  // main's ownerId-only updateSubscriptionHouses. The owner's subscription
  // does not list the house.
  claims.co = { ...SUPER };
  claims.co2 = { ...SUPER };
  mem.seed(`houses/${H}`, { id: H, ownerId: 'co', superAdminId: 'co' });
  subscription('co');
  const report = await run();
  expect(primaries()).toEqual([]);
  expect(report.ownerReview).toEqual([
    {
      houseId: H,
      reason: expect.stringMatching(/^more than one account holds a superAdmin claim here/),
    },
  ]);
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
  [
    'another account holds a superAdmin claim too',
    () => {
      subscription('owner');
      claims.co = { ...SUPER };
    },
  ],
])('equal fields but %s: no primary, listed', async (_label, setup) => {
  mem.seed(`houses/${H}`, { id: H, ownerId: 'owner', superAdminId: 'owner' });
  setup();
  const report = await run();
  expect(primaries()).toEqual([]);
  expect(report.ownerReview).toHaveLength(1);
});

it('--primary houseId=uid settles a listed house to any account, marked chosen; a re-run reports nothing (I1)', async () => {
  claims.co = { ...SUPER };
  mem.seed(`houses/${H}`, { id: H, ownerId: 'co', superAdminId: 'co' });
  claims.real = { ...SUPER };
  await run();
  const report = await run(parsePrimaryChoices(['--apply', '--primary', `${H}=real`]));
  expect(primaries()).toEqual([`house-roles/${H}_real`]);
  expect(mem.get(`house-roles/${H}_real`)).toMatchObject({
    chosen: true,
    chosenAt: expect.any(String),
  });
  expect(report.ownerReview).toEqual([]);
  const again = await run();
  expect(again.primaryContradicted).toEqual([]);
  expect(again.primaryUnverifiable).toEqual([]);
  expect(exitCodeFor(again)).toBe(0);
});

it('an existing primary the evidence contradicts is reported, never changed; the real owner still gets a record (break 3)', async () => {
  mem.seed(`houses/${H}`, { id: H, ownerId: 'owner', superAdminId: 'owner' });
  subscription('owner');
  mem.seed(`house-roles/${H}_co`, { houseId: H, tier: 'owner', primary: true, via: 'backfill' });
  const report = await run();
  expect(report.primaryContradicted).toEqual([
    { houseId: H, uid: 'co', reason: 'evidence names owner' },
  ]);
  expect(primaries()).toEqual([`house-roles/${H}_co`]);
  expect(report.owners).toEqual([]);
  // Pass 3 does not skip the real owner: a co-owner record, not primary.
  expect(mem.get(`house-roles/${H}_owner`)).toMatchObject({ tier: 'owner', via: 'backfill' });
  expect(mem.get(`house-roles/${H}_owner`)).not.toHaveProperty('primary');
  expect(exitCodeFor(report)).toBe(3);
});

it('an existing primary the evidence supports is not reported', async () => {
  mem.seed(`houses/${H}`, { id: H, ownerId: 'owner', superAdminId: 'owner' });
  subscription('owner');
  mem.seed(`house-roles/${H}_owner`, { houseId: H, tier: 'owner', primary: true });
  const report = await run();
  expect(report.primaryContradicted).toEqual([]);
  expect(report.primaryUnverifiable).toEqual([]);
  expect(report.owners).toEqual([]);
});

it('a createHouses primary the evidence cannot confirm (its claim grant failed) is listed for review, not contradicted (I1)', async () => {
  delete claims.owner; // the claims write after createHouses failed
  mem.seed(`houses/${H}`, { id: H, ownerId: 'owner', superAdminId: 'owner' });
  subscription('owner');
  mem.seed(`house-roles/${H}_owner`, {
    houseId: H,
    tier: 'owner',
    primary: true,
    via: 'createHouses',
  });
  const report = await run();
  expect(report.primaryContradicted).toEqual([]);
  expect(report.primaryUnverifiable).toEqual([
    { houseId: H, uid: 'owner', reason: expect.stringMatching(/no superAdmin claim/) },
  ]);
  expect(exitCodeFor(report)).toBe(3); // round 9 S-3: a review needs the owner
  const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  printRoleReport(report, false);
  const out = log.mock.calls.map((c) => String(c[0])).join('\n');
  log.mockRestore();
  expect(out).toMatch(/Review,\s+do not delete/);
  const section = out.slice(out.indexOf('neither confirm'));
  expect(section).not.toMatch(/remove|delete it|by hand/);
});

describe('--primary parsing and checks exit 1 (S1, N-D)', () => {
  it.each([
    [['--primary=h=u']],
    [['--primary']],
    [['--primary', '--apply']],
    [['--primary', 'h']],
    [['--primary', 'h=u=v']],
    [['--primary', '=u']],
    [['--primary', 'h=u', '--primary', 'h=v']],
  ])('refuses %j', (argv) => {
    expect(() => parsePrimaryChoices(argv)).toThrow();
  });

  it('accepts repeated distinct houses', () => {
    expect(parsePrimaryChoices(['--primary', 'a=u', '--apply', '--primary', 'b=v'])).toEqual({
      a: 'u',
      b: 'v',
    });
  });

  it.each([
    ['an unknown house', { nope: 'owner' }],
    ['an unknown account', { [H]: 'ghost' }],
  ])('a choice naming %s stops the run before any write', async (_label, choice) => {
    mem.seed(`houses/${H}`, { id: H, ownerId: 'owner', superAdminId: 'owner' });
    mem.seed(`house-roles/${H}_x`, { tier: 'resident' }); // pass 0 would stamp it
    await expect(run(choice)).rejects.toThrow(/unknown house or account/);
    expect(mem.get(`house-roles/${H}_x`)).not.toHaveProperty('houseId');
  });
});

describe('round 8: settling an existing primary; exit-code precedence; recent grants', () => {
  it('contradicted, then --primary with the same uid marks it chosen, then a re-run exits 0 (I1)', async () => {
    claims.co = { admin: { [H]: true } };
    mem.seed(`houses/${H}`, { id: H, ownerId: 'owner', superAdminId: 'owner' });
    subscription('owner');
    mem.seed(`house-roles/${H}_co`, { houseId: H, tier: 'owner', primary: true });
    expect(exitCodeFor(await run())).toBe(3);
    const settle = await run({ [H]: 'co' });
    expect(settle.owners).toEqual([expect.objectContaining({ uid: 'co', houseId: H })]);
    expect(mem.get(`house-roles/${H}_co`)).toMatchObject({ primary: true, chosen: true });
    const again = await run();
    expect(again.primaryContradicted).toEqual([]);
    expect(exitCodeFor(again)).toBe(0);
  });

  it('an unverifiable primary is settled the same way and stops being listed (verifier W1k)', async () => {
    delete claims.owner;
    mem.seed(`houses/${H}`, { id: H, ownerId: 'owner', superAdminId: 'owner' });
    mem.seed(`house-roles/${H}_owner`, { houseId: H, tier: 'owner', primary: true });
    expect((await run()).primaryUnverifiable).toHaveLength(1);
    claims.owner = { ...SUPER };
    delete claims.co;
    await run({ [H]: 'owner' });
    claims.co = { ...SUPER }; // a co-owner appears: a chosen record is not re-checked
    const again = await run();
    expect(again.primaryUnverifiable).toEqual([]);
    expect(again.primaryContradicted).toEqual([]);
  });

  it('a claims lookup failure wins over houses waiting for the owner: exit 2 (S3)', () => {
    const report = {
      lookupFailed: [{ uid: 'u', houseId: H, tier: 'manager', reason: 'claims lookup failed' }],
      ownerReview: [{ houseId: H, reason: 'owner must choose' }],
      primaryContradicted: [],
    } as unknown as Parameters<typeof exitCodeFor>[0];
    expect(exitCodeFor(report)).toBe(2);
  });

  it('the stale pass leaves a record granted in the last minutes alone (its claims may be in flight) (F3)', async () => {
    mem.seed(`houses/${H}`, { id: H, ownerId: 'owner', superAdminId: 'owner' });
    const recent = new Date(Date.now() - 60_000).toISOString();
    mem.seed(`house-roles/${H}_fresh`, { houseId: H, tier: 'manager', grantedAt: recent });
    mem.seed(`house-roles/${H}_old`, {
      houseId: H,
      tier: 'manager',
      grantedAt: '2000-01-01T00:00:00Z',
    });
    claims.fresh = {};
    claims.old = {};
    await run();
    expect(mem.get(`house-roles/${H}_fresh`)).toMatchObject({ tier: 'manager' });
    expect(mem.get(`house-roles/${H}_old`)).toBeUndefined();
  });
});
